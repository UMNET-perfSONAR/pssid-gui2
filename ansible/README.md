# Deploying pSSID GUI with Ansible

These playbooks deploy and maintain the pSSID GUI end to end on a Unix host:
they install Docker, then install, configure, start, and keep the application
stack maintained. Two roles do the work:

- **docker**: installs Docker Engine and the compose plugin from Docker's
  official repository (Debian/Ubuntu). Hosts that already have Docker are left
  untouched.
- **pssid_webgui**: fetches the application, generates its secrets,
  certificates, and nginx configuration, starts the containers, waits for the
  health check to pass, loads the starter defaults on the first install, and
  schedules nightly database backups.

Three playbooks use them:

| Playbook | Purpose |
|---|---|
| `site.yml` | Install or reconfigure a deployment |
| `upgrade.yml` | Upgrade in place: backup, pull latest, rebuild, verify |
| `dev.yml` | Hot-reload development stack on `http://localhost:8888` |

## One-command install

The repository root carries [`bootstrap.sh`](../bootstrap.sh), which wraps this
playbook so a fresh host needs exactly one command:

```bash
curl -fsSL https://raw.githubusercontent.com/UMNET-perfSONAR/pssid-gui2/main/bootstrap.sh | bash
```

It installs git and Ansible if missing, clones the repository to
`/opt/pssid-gui`, and runs `site.yml`. Settings travel as environment
variables (`PSSID_HOSTNAME`, `PSSID_EDITION`, `PSSID_TLS`, `PSSID_SSO`, and
the `PSSID_OIDC_*` values; see the header of the script).

## Production install

The same procedure, step by step, on the target host as root:

```bash
apt-get update && apt-get install -y git ansible
git clone https://github.com/UMNET-perfSONAR/pssid-gui2.git /opt/pssid-gui
cd /opt/pssid-gui/ansible
ansible-playbook site.yml -e pssid_gui_hostname=pssid.example.edu
```

Then open `https://pssid.example.edu`. That is the whole procedure: the
playbook installs Docker if it is missing, generates a self-signed certificate
and all secrets, brings the stack up, loads the starter defaults (first
install only), and schedules a nightly database backup. With the default
self-signed certificate the browser shows a warning once; choose Advanced,
then Proceed.

An install with OIDC single sign-on and a trusted certificate:

```bash
ansible-playbook site.yml \
  -e pssid_gui_hostname=pssid.example.edu \
  -e pssid_gui_sso=true \
  -e pssid_gui_oidc_issuer=https://idp.example.com \
  -e pssid_gui_oidc_client_id=<from your IdP> \
  -e pssid_gui_oidc_client_secret=<from your IdP> \
  -e pssid_gui_tls=letsencrypt -e pssid_gui_letsencrypt_email=<team>@example.edu
```

## Upgrades

```bash
cd /opt/pssid-gui/ansible
ansible-playbook upgrade.yml          # or: make upgrade (from the repo root)
```

The upgrade backs up the database first, discards **all** local modifications to
tracked files (so nothing can block the pull; the installer run regenerates the
ones it owns, `nginx.conf` and `shared/config.ts`), fast-forwards the checkout, rebuilds
the images, restarts the stack with the existing settings, and waits for the
health check. Data is never touched: the starter defaults only load on a first
install (a marker file under `/var/lib/pssid` records that), and MongoDB lives
in a named volume that survives rebuilds. If an upgrade fails, the
pre-upgrade archive is in `mongo-backups/`; restore it with
`scripts/restore.sh`.

Treat the deployed checkout as owned by the deployment: hand-edits to tracked
files are discarded on the next upgrade. Put customizations in `group_vars/` or
your inventory, where the playbook reapplies them on every run.

## Backups

Every production run of `site.yml` (or `upgrade.yml`) installs a cron entry
that archives the database nightly at 03:15 into `mongo-backups/` and prunes
archives older than 14 days. Tune or disable it with variables:

```bash
ansible-playbook site.yml -e pssid_gui_backup_hour=2 -e pssid_gui_backup_retention_days=30
ansible-playbook site.yml -e pssid_gui_backup_cron=false     # remove the schedule
```

The backup log is `/var/log/pssid-gui-backup.log` on the host.

## Development environment

For working on the code, the dev playbook brings up the hot-reload stack:

```bash
cd pssid-gui2/ansible
ansible-playbook dev.yml
```

The interface serves at `http://localhost:8888` and edits under
`services/*/src` reload live, without rebuilding images. Stop it with
`make dev-down` from the repository root.

## Remote hosts

Copy `inventories/remote.example.ini` to `inventories/remote.ini`, set the
hostname, and run:

```bash
ansible-playbook -i inventories/remote.ini site.yml -e pssid_gui_hostname=pssid.example.edu
```

When the playbook is not running from inside a checkout on the target, it
clones the repository to `/opt/pssid-gui` (configurable) and deploys from
there.

## Site inventories

A site that deploys the same hosts repeatedly is better served by a committed
inventory than by a growing list of `-e` flags. Put the inventory and a
`group_vars/` directory beside each other; Ansible loads the variables
automatically because they sit next to the inventory file, so the deploy command
stays a single line.

[`../umich/`](../umich/README.md) is the worked example and the University of
Michigan's live deployment: [`inventory.ini`](../umich/inventory.ini) names the
controllers and [`group_vars/pssid_gui.yml`](../umich/group_vars/pssid_gui.yml)
supplies the hostname, Okta issuer, edition, TLS mode, and Docker storage path.

```bash
ansible-playbook -i ../umich/inventory.ini site.yml --ask-vault-pass
```

Those files set only the generic variables documented below — a site inventory
never introduces a variable of its own, so there is exactly one code path.

## Variables

All variables and their defaults are documented in
[`group_vars/all.yml`](group_vars/all.yml) and defined in
[`roles/pssid_webgui/defaults/main.yml`](roles/pssid_webgui/defaults/main.yml).
The most common:

| Variable | Default | Purpose |
|---|---|---|
| `pssid_gui_mode` | `prod` | `prod` (HTTPS stack) or `dev` (hot reload) |
| `pssid_gui_hostname` | machine FQDN | Public hostname users will visit |
| `pssid_gui_edition` | `default` | Interface edition id: `default`, `umich`, or another entry in `services/client/src/edition/editions.ts` |
| `pssid_gui_tls` | `self-signed` | `self-signed`, `letsencrypt`, or `none` |
| `pssid_gui_sso` | `""` | Enable OIDC single sign-on. Empty leaves the host's current posture alone (off on a first install), so `make sso-on` survives an upgrade; `true`/`false` forces it on every run |
| `pssid_gui_open_write` | `""` | Whether the site is writable **while SSO is off**. Empty leaves the host's own setting alone (read-only on a first install, so a fresh SSO-off deploy greys out every form until `make writes-on` or `true` here); `true`/`false` forces it on every run. Never consulted while SSO is on |
| `pssid_gui_version` | `main` | Branch or tag to deploy when cloning |
| `pssid_gui_docker_data_root` | auto | Local filesystem with sufficient space for Docker + containerd; a dedicated `/var/lib/docker` mount is detected automatically |
| `pssid_gui_pull` | `false` | Pull prebuilt images (~4 GB minimum) instead of building (~6 GB minimum, ~12 GB recommended) |
| `pssid_gui_seed_defaults` | `true` | Load starter defaults on the first install |
| `pssid_gui_backup_cron` | `true` | Nightly MongoDB backup schedule |
| `pssid_gui_backup_retention_days` | `14` | Prune backups older than this (0 keeps all) |

## Relationship to install.sh

The `pssid_webgui` role runs the repository's own installer
(`install.sh -y ...`) internally, so the Ansible path and the manual
one-machine path share the same logic and cannot drift apart. Use whichever
fits: `./install.sh` for a quick single host where Docker already exists, this
playbook when you want Docker installed for you, are deploying remotely, or
manage the host with Ansible already.

Re-running the playbook is safe: existing MongoDB credentials and certificates
are reused, the generated configs are rewritten, and the containers are
recreated as needed.
