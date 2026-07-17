# Deploying pSSID GUI with Ansible

These playbooks deploy and maintain the pSSID GUI end to end on a Unix box:
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
playbook so a fresh box needs exactly one command:

```bash
curl -fsSL https://raw.githubusercontent.com/UMNET-perfSONAR/pssid-gui2/main/bootstrap.sh | bash
```

It installs git and Ansible if missing, clones the repository to
`/opt/pssid-gui`, and runs `site.yml`. Settings travel as environment
variables (`PSSID_HOSTNAME`, `PSSID_EDITION`, `PSSID_TLS`, `PSSID_SSO`, and
the `PSSID_OIDC_*` values; see the header of the script).

## Production install

The same thing, step by step, on the target box as root:

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

A University of Michigan install with Okta sign-on:

```bash
ansible-playbook site.yml \
  -e pssid_gui_edition=umich \
  -e pssid_gui_hostname=pssid-web-dev.miserver.it.umich.edu \
  -e pssid_gui_sso=true \
  -e pssid_gui_oidc_issuer=https://umich.okta.com \
  -e pssid_gui_oidc_client_id=<from Okta> \
  -e pssid_gui_oidc_client_secret=<from Okta> \
  -e pssid_gui_tls=letsencrypt -e pssid_gui_letsencrypt_email=<team>@umich.edu
```

## Upgrades

```bash
cd /opt/pssid-gui/ansible
ansible-playbook upgrade.yml          # or: make upgrade (from the repo root)
```

The upgrade backs up the database first, discards the installer's deploy-time
edits to `nginx.conf` and `shared/config.ts` (so they can never block the
pull; the installer run regenerates both), fast-forwards the checkout, rebuilds
the images, restarts the stack with the existing settings, and waits for the
health check. Data is never touched: the starter defaults only load on a first
install (a marker file under `/var/lib/pssid` records that), and MongoDB lives
in a named volume that survives rebuilds. If an upgrade misbehaves, the
pre-upgrade archive is in `mongo-backups/`; restore it with
`scripts/restore.sh`.

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

## Variables

All variables and their defaults are documented in
[`group_vars/all.yml`](group_vars/all.yml) and defined in
[`roles/pssid_webgui/defaults/main.yml`](roles/pssid_webgui/defaults/main.yml).
The most common:

| Variable | Default | Purpose |
|---|---|---|
| `pssid_gui_mode` | `prod` | `prod` (HTTPS stack) or `dev` (hot reload) |
| `pssid_gui_hostname` | machine FQDN | Public hostname users will visit |
| `pssid_gui_edition` | `default` | Interface edition (`default`, `umich`) |
| `pssid_gui_tls` | `self-signed` | `self-signed`, `letsencrypt`, or `none` |
| `pssid_gui_sso` | `false` | Enable OIDC single sign-on |
| `pssid_gui_version` | `main` | Branch or tag to deploy when cloning |
| `pssid_gui_docker_data_root` | auto | Roomy local filesystem for Docker + containerd; a dedicated `/var/lib/docker` mount is detected automatically |
| `pssid_gui_pull` | `false` | Pull prebuilt images (~4 GB minimum) instead of building (~6 GB minimum, ~12 GB recommended) |
| `pssid_gui_seed_defaults` | `true` | Load starter defaults on the first install |
| `pssid_gui_backup_cron` | `true` | Nightly MongoDB backup schedule |
| `pssid_gui_backup_retention_days` | `14` | Prune backups older than this (0 keeps all) |

## Relationship to install.sh

The `pssid_webgui` role runs the repository's own installer
(`install.sh -y ...`) under the hood, so the Ansible path and the manual
one-machine path share the same logic and cannot drift apart. Use whichever
fits: `./install.sh` for a quick single host where Docker already exists, this
playbook when you want Docker installed for you, are deploying remotely, or
manage the host with Ansible already.

Re-running the playbook is safe: existing MongoDB credentials and certificates
are reused, the generated configs are rewritten, and the containers are
recreated as needed.
