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

## Current posture: SSO off, writes open

ITS has not returned the Okta application yet, so
[`group_vars/pssid_gui.yml`](group_vars/pssid_gui.yml) pins
`pssid_gui_sso: "false"` and `pssid_gui_open_write: "true"`. Every deploy
asserts that pair, so the controller comes up unauthenticated and fully usable —
every form editable, Generate working — rather than as a read-only demo.

The consequence is worth stating plainly: **anyone who can reach any of the
controllers in [`inventory.ini`](inventory.ini) — the dev host or the three QA
hosts — can change its probe configuration.** The network in front of them is
the only access control until Okta is in place. Keep them off the public
internet, or set `pssid_gui_open_write: "false"` and accept a read-only
interface in the meantime.

`pssid_gui_open_write` stops being consulted the moment SSO is on, and
`make sso-status` on a host reports what is actually in force.

## Turning SSO on

Four values arrive from ITS and each has exactly one home. Nothing else about
the deployment changes.

| # | From ITS | Goes in |
|---|---|---|
| 1 | Issuer URL | `pssid_gui_oidc_issuer` — **already set** to `https://umich.okta.com`; change only for a custom `/oauth2/...` authorization server |
| 2 | Client id | `group_vars/all/vault.yml` (below) |
| 3 | Client secret | `group_vars/all/vault.yml` (below) |
| 4 | The two group strings, **exactly as they appear in a token** | `pssid_gui_auth_groups` in [`group_vars/pssid_gui.yml`](group_vars/pssid_gui.yml) — a commented block is waiting there |

Then two switches in the same file:

```yaml
pssid_gui_sso: "true"
pssid_gui_open_write: "false"   # ignored while SSO is on; correct resting state
```

Deploy **one host first**, so a mistake costs one controller rather than four:

```bash
make deploy-umich ANSIBLE_ARGS="--limit pssid-gui-qa7.miserver.it.umich.edu --ask-vault-pass"
```

Verify on that host before rolling out the rest:

1. Sign in — Okta, then back to the dashboard with your name in the navigation bar.
2. Open `/api/userinfo`. `groups` must list your Okta groups and `access_level`
   must be `write`. **An empty `groups` means ITS has not released the claim** —
   that is the single most common failure, and no amount of redeploying fixes it.
3. A read-only user sees the badge and greyed forms.
4. Sign out, revisit, and you are asked to authenticate again.
5. `make security-check` passes.

Then drop the `--limit` and deploy the other three.

If the server will not stay up, it is refusing a bad setting on purpose and the
log names which one:

```bash
docker compose logs server | grep -E 'SSO enabled|REFUSING TO START' -A3
```

To see what Okta actually sent without locking yourself out, set
`SSO_REQUIRE_GROUP=false` in `services/server/.env` and `make restart`; sign-in
then succeeds and `/api/userinfo` shows the raw claim. **Set it back to `true`.**

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
pssid_gui_oidc_client_id: <from ITS>
pssid_gui_oidc_client_secret: <from ITS>
```

Then deploy with `--ask-vault-pass` as shown above. To deploy without a vault,
pass the two values on the command line instead:

```bash
ansible-playbook -i ../umich/inventory.ini site.yml \
  -e pssid_gui_oidc_client_id=... -e pssid_gui_oidc_client_secret=...
```

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
