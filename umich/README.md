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
| [`SSO.md`](SSO.md) | UMich's live SSO configuration, secret handling, and Okta-tenant-specific troubleshooting |
| [`QA/seed-qa.sh`](QA/seed-qa.sh) | QA dataset: eduroam + MWireless, the two lab probes, the `rpi4` group |
| [`QA/QA.md`](QA/QA.md) | QA walkthrough and the official demonstration script |
| `QA/SSOwithOkta.md` | Runbook for requesting a **new** Okta application from ITS (untracked; fill in your own values) |

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

## Single sign-on: on, one group, writes by membership

SSO is live on UMich's controllers, registered as the ITS Okta application
**ITS - pssid development**: OIDC Authorization Code + PKCE, issuer
`https://okta.umich.edu/oauth2/default`, one group (`pssid-gui-users`) released
in the `edumember_ismemberof` claim and mapped to **write** - so membership of
that MCommunity group *is* the access control here. The whole posture is in
[`group_vars/pssid_gui.yml`](group_vars/pssid_gui.yml) and
[`inventory.ini`](inventory.ini); the only value not in git is the client
secret, in an `ansible-vault`-encrypted `group_vars/all/vault.yml`.

**[`SSO.md`](SSO.md) is the full reference**: the complete configuration table,
how to deploy a new host or rotate the secret, and the four things most likely
to go wrong against this specific Okta tenant (a scope Okta rejects outright,
an issuer that looks right but discovers the wrong server, and the two
independent gates - Okta assignment and MCommunity membership - that fail
differently and are easy to mistake for one another).

## QA

The QA dataset is UMich-specific - it seeds the campus SSIDs (eduroam and
MWireless) and the two lab probes, whose hostnames are their IP addresses at this
site - so it lives here rather than in the generic tree. It is **not** part of any
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
