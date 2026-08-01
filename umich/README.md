# University of Michigan deployment

Everything specific to the University of Michigan lives in this folder. The rest
of the repository is vendor-neutral and carries no UMich hostname, SSID, probe
address or branding, so the two can be maintained independently: nothing outside
`umich/` has to change to deploy here, and nothing in here has to change when the
generic product does.

| Path | What it is |
|---|---|
| [`inventory.ini`](inventory.ini) | Master Ansible inventory: the real UMich controllers |
| [`group_vars/pssid_gui.yml`](group_vars/pssid_gui.yml) | UMich values for the generic deployment variables (hostname, Okta, edition, storage) |
| [`QA/seed-qa.sh`](QA/seed-qa.sh) | QA dataset: eduroam + MWireless, the two lab probes, the `rpi4` group |
| [`QA/QA.md`](QA/QA.md) | QA walkthrough and the official demonstration script |
| `QA/SSOwithOkta.md` | Runbook for requesting the Okta application from ITS (untracked; fill in your own values) |

The navy/maize interface is not in this folder, because the client bundle is
built from one registry: it is the `umich` entry in
[`services/client/src/edition/editions.ts`](../services/client/src/edition/editions.ts),
selected by `pssid_gui_edition: umich` in `group_vars/pssid_gui.yml`.

## Deploy

One command, from the `ansible/` directory so that `ansible.cfg` and the roles
resolve. Ansible reads `group_vars/pssid_gui.yml` automatically because it sits
beside the inventory, so no `-e` flags are needed:

```bash
cd ansible
ansible-playbook -i ../umich/inventory.ini site.yml --ask-vault-pass
```

Upgrades use the same inventory:

```bash
ansible-playbook -i ../umich/inventory.ini upgrade.yml --ask-vault-pass
```

The upgrade backs the database up first, fast-forwards the checkout, rebuilds,
and waits for the health check. See [`../ansible/README.md`](../ansible/README.md)
for what the roles do and [`../docs/deployment.md`](../docs/deployment.md) for
the full deployment reference.

## Current posture: SSO on, one group, writes by membership

ITS registered the OIDC application **ITS - pssid development**, and everything
it returned is configured. The whole posture is in
[`group_vars/pssid_gui.yml`](group_vars/pssid_gui.yml) and
[`inventory.ini`](inventory.ini); the only value not in git is the client secret.

| What | Value | Where |
|---|---|---|
| Application type | **OIDC** web application, Authorization Code + PKCE, `client_secret_post` | Okta (AMP) |
| Client id | `0oa25hltopzoZr4XR1d8` — not a credential, committed on purpose | `pssid_gui_oidc_client_id` |
| Client secret | *not in git* | `group_vars/all/vault.yml` |
| Issuer | `https://umich.okta.com` — **unconfirmed, see below** | `pssid_gui_oidc_issuer` |
| Group claim | `edumember_ismemberof` | read automatically, no setting |
| Group released | `pssid-gui-users` → **write** | `pssid_gui_auth_groups` |
| Scope | `openid profile email edumember` | `pssid_gui_sso_scope` |
| SSO enabled on | dev, qa5, qa6, qa8 (the registered redirect URIs) | per host in `inventory.ini` |

**One group means one tier.** ITS releases only `pssid-gui-users`, so everyone who
can sign in gets **write**. Mapping it to `read` instead would authenticate
everybody into an interface where nothing can be saved, which is not safer, only
broken. So membership of the `pssid-gui-users` MCommunity group *is* the access
control — treat adding someone to it as granting them the ability to reconfigure
the probes. For a viewer tier, ask ITS to release a second group and map it to
`read`.

`pssid_gui_open_write` is now `false`. It is never consulted on a host with SSO
on, so it governs only unregistered hosts — and those cannot authenticate anyone,
so read-only is the right resting state. `make sso-status` on a host reports
what is actually in force.

## Turning SSO on

It is already on in configuration. Two things remain: the secret in a vault, and
a first deploy.

```bash
ansible-vault create umich/group_vars/all/vault.yml
```

```yaml
---
pssid_gui_oidc_client_secret: <the secret from ITS>
```

The client id is **not** in there — it is committed, because a client id travels
in the browser's URL bar on every sign-in and protecting it protects nothing.
Keeping the vault to a single value removes any doubt about what actually matters.

Deploy **one host first**, so a mistake costs one controller rather than three:

```bash
make deploy-umich ANSIBLE_ARGS="--limit pssid-gui-qa6.miserver.it.umich.edu --ask-vault-pass"
```

Verify on that host before the others:

1. Sign in — Okta, then back to the dashboard with your name in the navigation bar.
2. Open `/api/userinfo`. `groups` must contain `pssid-gui-users` and
   `access_level` must be `write`.
3. Sign out, revisit, and you are asked to authenticate again.
4. `make security-check` passes.

Then drop the `--limit`.

### The three things most likely to go wrong

Each has a different symptom, so the symptom tells you which one it is.

**`invalid_scope` at Okta, before any password prompt.** The tenant does not
define a scope named in `pssid_gui_sso_scope`. We send
`openid profile email edumember` because ITS releases the eduPerson claim; if
their authorization server wants something else, ask which scope releases
`edumember_ismemberof` and set it. `openid profile email` alone is the safe
fallback — sign-in will work, and step 2 above then tells you whether the claim
arrived anyway.

**The server refuses to start.** It is rejecting a setting on purpose and names
which:

```bash
docker compose logs server | grep -E 'SSO enabled|REFUSING TO START' -A3
```

The likely culprit is the **issuer**, which is the one value the AMP screens never
showed. If ITS gave a custom authorization server (a URL with an `/oauth2/...`
path), set it in `pssid_gui_oidc_issuer` — and confirm with them that
`edumember_ismemberof` is released on *that* server, since claims configured on
the org authorization server are not emitted by a custom one.

**Sign-in works, then "not a member of any group permitted".** The claim did not
arrive, or its contents do not match `pssid-gui-users`. To see exactly what Okta
sent without locking yourself out, set `SSO_REQUIRE_GROUP=false` in
`services/server/.env`, `make restart`, sign in, and read `/api/userinfo`.
**Set it back to `true` afterwards.**

## The Okta secret

`group_vars/pssid_gui.yml` is committed, so the client secret does not belong in
it. Keep it in an encrypted vault file, which `.gitignore` keeps untracked:

```bash
ansible-vault create umich/group_vars/all/vault.yml
```

The `all/` subdirectory is not decoration. Ansible maps a file
`group_vars/<name>.yml` to a **group** called `<name>`, so a file named
`group_vars/vault.yml` would be read as variables for a group called `vault` —
which does not exist, so it would be **silently ignored** and the deploy would
run with no client credentials. `group_vars/all/` is a directory form: every file
in it applies to every host in this inventory, whatever it is called.

```yaml
---
pssid_gui_oidc_client_secret: <from ITS>
```

One value, not two: the client id is committed in
[`group_vars/pssid_gui.yml`](group_vars/pssid_gui.yml).

Then deploy with `--ask-vault-pass` as shown above. Where it lands, and what
touches it on the way:

| Stage | Handling |
|---|---|
| Ansible → installer | The **environment**, never argv. `/proc/<pid>/cmdline` is world-readable, so `--client-secret=…` would let any local user read it with `ps` for the length of the install |
| Ansible output | `no_log` on that task — never printed, even on failure |
| At rest | `services/server/.env`, root-owned **mode 640**, readable only by the server container's supplementary gid |
| Later runs | Preserved automatically; upgrades neither erase it nor need it re-supplied |

**Do not** pass it as `-e pssid_gui_oidc_client_secret=...`. That puts it in your
shell history and in `ps` output for every local user. If you must deploy without
a vault, export it instead — the role reads it from the environment:

```bash
read -rs PSSID_OIDC_CLIENT_SECRET && export PSSID_OIDC_CLIENT_SECRET
make deploy-umich ANSIBLE_ARGS="--limit pssid-gui-qa6.miserver.it.umich.edu"
```

**Rotation.** Have ITS issue the new secret *while the old one still works*,
update the vault, redeploy, confirm a real sign-in, then ask them to retire the
old one. The reverse order takes every host down in between.

**If it leaks.** Rotate as above and tell ITS. It is not a password: the
Authorization Code flow still requires a code delivered to one of the three
registered redirect URIs, PKCE means an intercepted code cannot be redeemed
without the verifier, and no grant type is enabled that would let the secret mint
a token on its own. Serious hygiene failure, not an access breach — but if it ever
reached a git commit, rotation is mandatory and rewriting history does not help.

Requesting the application from ITS in the first place — which values they need
from you and which they return — is `QA/SSOwithOkta.md`. That file is
deliberately untracked: it is a working document you fill in with the tenant's
real ids and group names. The vendor-neutral version of the same material is
[`../docs/deployment.md`](../docs/deployment.md#single-sign-on).

## QA

The QA dataset is UMich-specific — it seeds the campus SSIDs (eduroam and
MWireless) and the two lab probes, whose hostnames are their IP addresses at this
site — so it lives here rather than in the generic tree. It is **not** part of any
deployment path: neither the bootstrap nor the installer runs it.

```bash
cd /opt/pssid-gui
bash scripts/seed-defaults.sh                       # pre-load, generic; first install runs it already
PSSID_QA_PROBE1=<probe-1-ip> PSSID_QA_PROBE2=<probe-2-ip> \
  bash umich/QA/seed-qa.sh                          # or: make seed-qa
```

[`QA/QA.md`](QA/QA.md) is the full walkthrough: what each seeder owns, a
section-by-section demonstration script, the exact expected configuration
output, and how to roll back.
