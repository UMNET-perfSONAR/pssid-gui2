# pSSID GUI — University of Michigan Edition

This is the **UMich-specific** deployment guide. It deploys the `umich` brand
(navy/maize identity) and documents UMich's Okta SSO. For the mechanics of the
installer and Makefile, the [generic guide](../generic/README.md) is the
reference; this page only covers what differs for UMich.

---

## Quickstart (UMich)

```bash
git clone https://github.com/UMNET-perfSONAR/pssid-gui2.git pssid-gui
cd pssid-gui
./install.sh \
  --brand=umich \
  --hostname=pssid-web-dev.miserver.it.umich.edu \
  --sso=true \
  --issuer=https://umich.okta.com \
  --client-id=<from Okta> \
  --client-secret=<from Okta> \
  --tls=letsencrypt --email=<team-alias>@umich.edu
```

Omit the flags to be prompted interactively. The installer generates the
`SECRET`, writes `services/server/.env`, sets `ENABLE_SSO=true` and `BASE_URL` in
`shared/config.ts`, renders nginx for the miserver hostname, and starts the stack
with the `sso` profile (Redis included).

To switch an existing deployment to the UMich look without reinstalling:

```bash
make brand-umich
```

---

## Setting up SSO with UMich Okta

The application uses generic OIDC (`express-openid-connect`); the steps below are
specific to UMich's Okta instance.

### 1. Register an OIDC application in Okta

1. Sign in to [https://umich.okta.com](https://umich.okta.com) with an admin account.
2. **Applications → Applications → Create App Integration**.
3. Choose **OIDC – OpenID Connect** and **Web Application**.
4. **Sign-in redirect URI**: `https://<your-hostname>/callback`
5. **Sign-out redirect URI**: `https://<your-hostname>`
6. Save and note the **Client ID** and **Client Secret**.

### 2. Configure the groups claim

1. In the app, **Sign On → OpenID Connect ID Token**.
2. **Groups claim type**: *Filter*.
3. **Groups claim filter**: e.g. *Starts with* → `pssid`.
4. Save.

UMich's Okta may instead propagate the `edumember_is_member_of` attribute from
the campus directory. If your Okta admin has configured this, the claim arrives
automatically and no extra filter is needed — the app handles both
`edumember_is_member_of` and the standard `groups` claim.

### 3. Issuer URL

UMich uses the Okta **Org Authorization Server**:

```
ISSUER_BASE_URL=https://umich.okta.com
```

Discovery document: `https://umich.okta.com/.well-known/openid-configuration`.
Do **not** append `/oauth2/default` — that is for Okta custom authorization
servers and is not used by UMich.

### 4. Group permissions

Map the Okta group names your admin assigned in
[`shared/auth-groups.config.json`](../../shared/auth-groups.config.json):

```json
{
  "permissions": {
    "pssid-gui":       "write",
    "pssid-gui-users": "read"
  }
}
```

---

## Fleet deployment via Ansible (alternative)

For managed/fleet deployments, UMNET maintains an Ansible playbook:

```
https://github.com/UMNET-perfSONAR/ansible-playbook-pssid-GUI-deploy.git
```

The single-host `./install.sh` path is recommended for most cases; use the
playbook when provisioning controllers at scale or alongside other UMNET roles.

---

## Published images

Release images are published under the `umnetworking` Docker Hub organization;
pin a release tag for reproducible deploys:

```
umnetworking/pssid-gui2_client:v3.2.0
umnetworking/pssid-gui2_server:v3.2.0
umnetworking/pssid-gui2_mongo:v3.2.0
```

For an image-based deploy, mount `shared/` into both the client and server
containers and do **not** mount the `node_modules` volumes (they would hide the
dependencies baked into the image). For SSO, provide the OIDC values via
`/usr/lib/pssid/server.env`.

---

## Probe provisioning

The GUI generates `hosts.ini` and `pssid_config.json` and calls
`/usr/lib/exec/pssid/provision`, which uses Ansible to copy the config to the
probes and restart the pSSID daemon. Provisioning can be triggered manually
(*Configure selected host/group*) or automatically — see
[docs/AUTOMATION.md](../AUTOMATION.md).
