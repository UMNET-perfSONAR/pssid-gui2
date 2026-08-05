# Deploying with single sign-on

With single sign-on (SSO) on, users authenticate through an OIDC identity
provider and their group membership decides whether they get read or write
access. This is the posture to prefer for any deployment reachable outside a
network you already control — see
[deployment without SSO](deployment-without-sso.md) for what runs in its
place when SSO is off.

There is exactly **one supported installation path**, described below. It is
the same one [deployment without SSO](deployment-without-sso.md) uses; the
only difference is which flags you pass it.

## Prerequisites

1. **A compliant OIDC provider.** The server uses generic OIDC
   (`express-openid-connect`), so any provider works — Okta, Entra ID,
   Keycloak, Google, and others. [`umich/SSO.md`](../umich/SSO.md) and
   [`umich/QA/SSOwithOkta.md`](../umich/QA/SSOwithOkta.md) are worked
   examples against Okta.
2. **HTTPS.** The session cookie is `Secure`-only, so SSO cannot work over
   plain HTTP — the installer refuses `--sso=true --tls=none` outright. Use
   `--tls=self-signed` for an internal CA or lab, or `--tls=letsencrypt` for a
   publicly trusted certificate.
3. **Register a web application** with the provider:
   - Grant type: **Authorization Code**, with PKCE. Leave Implicit off.
   - Sign-in redirect URI: `https://<your-hostname>/callback`
   - Sign-out redirect URI: `https://<your-hostname>`
   - Make sure the ID token includes a **groups claim** (`groups`,
     `edumember_ismemberof`/`edumember_is_member_of`, or `isMemberOf` — the
     server reads whichever the provider sends). This is the single most
     common reason an OIDC integration appears to work and grants nobody
     anything: without it, every user authenticates and is then refused.
4. **Decide which of the provider's groups get write access and which get
   read-only.** You will map these to permissions in step 2 below.

Record the **issuer base URL**, **client ID**, and **client secret** the
provider gives you; the installer asks for exactly these three.

## Step 1 — Deploy

### One command

On a fresh host, as root, with the values from above:

```bash
curl -fsSL https://raw.githubusercontent.com/UMNET-perfSONAR/pssid-gui2/main/bootstrap.sh \
  | PSSID_HOSTNAME=pssid.example.edu \
    PSSID_SSO=true \
    PSSID_OIDC_ISSUER=https://idp.example.com \
    PSSID_OIDC_CLIENT_ID=your-client-id \
    PSSID_OIDC_CLIENT_SECRET=your-client-secret \
    PSSID_TLS=letsencrypt \
    bash
```

This is the same script [deployment without SSO](deployment-without-sso.md)
uses — it installs git and Ansible, clones the repository, and runs the
Ansible playbook, which installs Docker and runs
[`install.sh`](../install.sh) internally. There is no other script this
repository documents or supports for a first install.

Afterwards, one command each keeps the deployment maintained:

```bash
make upgrade    # backup, pull the latest release, rebuild, verify health
make backup     # extra on-demand database backup (nightly ones are automatic)
make help       # every operator shortcut (up, down, logs, doctor, ...)
```

### The same steps, by hand

The command above only strings together the steps below. Run them yourself
when you want control at each point, or when something needs investigating;
the [Ansible guide](../ansible/README.md) and the
[full deployment reference](deployment.md#single-sign-on) cover each stage in
depth.

1. **Install git and Ansible** (root shell):
   ```bash
   apt-get update && apt-get install -y git ansible
   ```
2. **Fetch the source**:
   ```bash
   git clone https://github.com/UMNET-perfSONAR/pssid-gui2.git /opt/pssid-gui
   ```
3. **Deploy**. Either the playbook (installs Docker for you; the
   [Ansible guide](../ansible/README.md) covers remote hosts, editions,
   upgrades, and backups). Export the client secret rather than passing it with
   `-e`: an `ansible-playbook` command line is world-readable through
   `/proc/<pid>/cmdline` for as long as the run takes, and the role's default
   reads the secret from the environment instead:
   ```bash
   read -rs PSSID_OIDC_CLIENT_SECRET && export PSSID_OIDC_CLIENT_SECRET
   cd /opt/pssid-gui/ansible
   ansible-playbook site.yml \
     -e pssid_gui_hostname=pssid.example.edu \
     -e pssid_gui_sso=true \
     -e pssid_gui_oidc_issuer=https://idp.example.com \
     -e pssid_gui_oidc_client_id=your-client-id \
     -e pssid_gui_tls=letsencrypt -e pssid_gui_letsencrypt_email=you@example.edu
   ```
   or, when Docker is already installed, the installer directly:
   ```bash
   ./install.sh --hostname=pssid.example.edu --sso=true \
     --issuer=https://idp.example.com --client-id=your-client-id \
     --tls=letsencrypt --email=you@example.edu
   ```
   Omit `--client-secret` to be prompted for it, which keeps it out of your
   shell history. Either form normalizes and validates the issuer before
   writing anything, so a common mistake (a discovery-document URL, a custom
   authorization-server path that needs its own claim configuration) is caught
   here rather than at sign-in.

## Step 2 — Map groups to permissions

Edit [`shared/auth-groups.config.json`](../shared/auth-groups.config.json)
with the exact group strings the provider's claim carries — not a display
name:

```json
{
  "permissions": {
    "your-write-group": "write",
    "your-read-group":  "read"
  }
}
```

Matching folds case and surrounding whitespace but is otherwise exact: no
prefix or suffix matching, so `pssid-gui` does not also grant
`pssid-gui-readonly`. A user in several groups gets the highest level among
them; a group not listed grants nothing. The server re-reads this file live —
but compose bind-mounts it as a single file, and an editor that replaces the
file on save (`sed -i`, vim, by default) leaves the running container reading
the old copy. Either edit in place, or run
`docker compose restart server` and confirm with `/api/userinfo`.

## It fails closed

With SSO on, the server validates its configuration at startup and **refuses
to start** on a fault that would otherwise present as a working deployment
that authenticates nobody or denies everyone:

```bash
docker compose logs server | grep -E 'SSO enabled|REFUSING TO START' -A3
```

Expect a line starting `SSO enabled:` reporting the posture in force.
`REFUSING TO START` names the exact setting at fault; fix it and
`docker compose restart server` (or `make restart`).

## Verify

```bash
make sso-status                        # posture: SSO on, provider configured
make security-check                    # TLS, headers, auth, containers -- from the outside
```

Then, signed in through the browser:

1. Sign in at `https://<your-hostname>` — the provider, then back to the
   dashboard with your name in the navigation bar.
2. Open `/api/userinfo`. `groups` must list the groups the provider actually
   sent, and `access_level` must match what you mapped in step 2. An empty
   `groups` means the provider is not releasing the claim — go back to
   prerequisite 3.
3. Sign out, revisit, and you must be asked to authenticate again.

## Turning SSO on for an already-deployed host

The credentials can be filled in ahead of time and sit inert — the server
only reads them behind the `ENABLE_SSO` flag — so "configure the provider now,
switch on later" is one command once you are ready:

```bash
make sso-on     # refuses until the OIDC values above are complete, and says which are missing
make sso-off    # back to unauthenticated; see deployment without SSO
```

## Further reading

[`docs/deployment.md#single-sign-on`](deployment.md#single-sign-on) is the
full reference: a worked Okta example, the group-claim differences between
providers, session and hardening settings, and troubleshooting for redirect
loops, missing claims, and startup refusals.
[`umich/SSO.md`](../umich/SSO.md) is a complete real deployment against Okta,
including the four things most likely to go wrong.
[`docs/deployment.md`](deployment.md) also covers what is out of scope here:
TLS modes in depth, disk sizing, editions, upgrades and backups, and the
provisioning pipeline.
