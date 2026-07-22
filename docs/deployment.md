# Deployment

This guide covers deploying pSSID GUI on a single host with Docker. It applies to
any organization; hostnames, identity-provider URLs, and storage paths in the
examples are placeholders to replace with your own.

## Contents

- [One-command bootstrap](#one-command-bootstrap)
- [Deploying to a new VM](#deploying-to-a-new-vm)
  - [Provisioning checklist for the VM administrator](#provisioning-checklist-for-the-vm-administrator)
- [Prerequisites](#prerequisites)
- [Deploying with Ansible](#deploying-with-ansible)
- [Upgrades and backups](#upgrades-and-backups)
- [Quickstart](#quickstart)
- [What the installer does](#what-the-installer-does)
- [Everyday operations](#everyday-operations)
- [Starter data](#starter-data)
- [Single sign-on](#single-sign-on)
- [TLS](#tls)
- [Editions](#editions)
- [Provisioning and automation](#provisioning-and-automation)
- [Troubleshooting](#troubleshooting)

## One-command bootstrap

The fastest path from a fresh box to a running deployment is the bootstrap
script at the repository root:

```bash
curl -fsSL https://raw.githubusercontent.com/UMNET-perfSONAR/pssid-gui2/main/bootstrap.sh | bash
```

It installs git and Ansible when missing, clones the repository to
`/opt/pssid-gui`, and runs the `site.yml` playbook, which performs everything
in this guide: Docker installation, secrets, certificates, nginx config,
containers, the first-install starter defaults, and the nightly backup
schedule. Settings are environment variables (`PSSID_HOSTNAME`,
`PSSID_EDITION`, `PSSID_TLS`, `PSSID_SSO`, `PSSID_OIDC_*`; the script header
documents them all). Everything below describes what that one command does, so
each stage can be run or repaired by hand.

## Deploying to a new VM

The bootstrap above "just works" on a box with a single large disk. Some VMs
split storage across several small partitions plus one large data volume, which
can stop the image build part way through with `no space left on device`. Check
the disk layout once per new VM and the one command goes through cleanly.

### Small VMs: pull prebuilt images instead of building

Building the images from source needs ~8-10 GB of Docker storage. On VMs whose
`/var` is a small partition (common on managed VMs), skip the build entirely
and pull the images CI publishes to GitHub Container Registry — that needs only
~4 GB:

```bash
curl -fsSL https://raw.githubusercontent.com/UMNET-perfSONAR/pssid-gui2/main/bootstrap.sh \
  | PSSID_PULL=true PSSID_HOSTNAME=pssid.example.edu bash
```

or `./install.sh --pull ...` from a checkout, or `-e pssid_gui_pull=true` with
the playbook. The client image is published per edition (the default edition is
`:latest`; a branded edition is published under its own tag) and the installer
picks the right one from `--edition`. If
the pull fails (registry unreachable, images not yet published), the installer
falls back to building from source automatically — with the larger disk
requirement that implies. The images are published by
`.github/workflows/publish.yml` on every push to `main`; make sure the three
`pssid-gui2_*` packages are set to **public** in the GitHub organization's
package settings so VMs can pull anonymously.

Networking (DNS, host or perimeter firewalls, and which client networks may
reach the site) is the operator's responsibility and outside the scope of this
deployment: it never changes firewall rules or opens ports. The stack listens on
80 and 443 through nginx; make sure your environment allows the clients you
expect to reach those ports.

### Check the disk layout

The build needs about 8-10 GB free on the local filesystem(s) holding Docker
and containerd data. On some VMs `/var` is a small partition while
`/var/lib/docker` is already a separate large logical volume; on others, the
only large path is an unrelated data mount. Look before you deploy:

```bash
df -hT            # free space per filesystem
lsblk             # disks, partitions, and where they are mounted
findmnt -T /var/lib/docker -o TARGET,SOURCE,FSTYPE,OPTIONS
```

Plan for these amounts:

| Location | Required headroom |
|---|---|
| Docker + containerd storage, source build | ~12 GB recommended; deployment refuses below 6 GB |
| Docker + containerd storage, prebuilt-image pull | ~8 GB recommended; deployment refuses below 4 GB |
| `/opt/pssid-gui` checkout | Keep at least ~1 GB free, plus room for database backups stored under `mongo-backups/` |

Docker and containerd may share one roomy filesystem; the space is not additive
when they do. If they are on separate filesystems, both are checked because
either can stop the deployment during image extraction.

- If `/var/lib/docker` is itself a roomy **local** mount (for example the 49 GB
  ext4 LV commonly supplied on managed VMs), run the plain bootstrap. It
  detects that mount automatically, keeps Docker there, and bind-mounts
  containerd storage from `/var/lib/docker/.containerd`.
- If the filesystem(s) holding both `/var/lib/docker` and
  `/var/lib/containerd` already have ~12 GB+ free, run the plain bootstrap.
- If there is a **large mounted volume elsewhere** (a dedicated data volume with
  tens of GB free), point Docker at it (below).
- If there is a **large unmounted/raw disk** (shows in `lsblk` with no
  mountpoint), or an LVM volume group with free extents, grow Docker's
  filesystem onto it (LVM: `pvcreate`/`vgextend`/`lvextend`/`resize2fs`); no
  further steps needed.

Do not use NFS, CIFS/SMB, or another shared/network filesystem for Docker or
containerd storage. Besides filesystem-semantics and locking problems, managed
NFS exports commonly root-squash the VM's root user. The bootstrap excludes
network mounts from automatic suggestions and rejects an explicitly selected
network path with a clear error.

### Point Docker at the roomy volume

Set `PSSID_DOCKER_DATA_ROOT` to a directory on the large volume. The deployment
relocates **both** Docker's data-root and containerd's storage root there before
the build (they are separate directories; see the note below), so nothing runs
out of space part way through:

```bash
curl -fsSL https://raw.githubusercontent.com/UMNET-perfSONAR/pssid-gui2/main/bootstrap.sh \
  | PSSID_HOSTNAME=pssid-new.example.edu \
    PSSID_DOCKER_DATA_ROOT=/data/docker \
    bash
```

You can also configure storage by hand first (idempotent, safe to re-run), then
run the plain bootstrap:

```bash
sudo scripts/setup-docker-storage.sh /data/docker
```

When a large filesystem is mounted directly at `/var/lib/docker`, pass that
exact path (or let bootstrap detect it):

```bash
sudo scripts/setup-docker-storage.sh /var/lib/docker
```

In this special layout Docker remains at `/var/lib/docker`, while containerd
is stored at `/var/lib/docker/.containerd` and bind-mounted onto
`/var/lib/containerd`. This matters because `/var/lib/containerd` by itself
would still reside on the smaller `/var` filesystem.

> **Why both stores move.** Modern Docker Engine extracts image layers through
> containerd's own snapshotter, whose root (`/var/lib/containerd`) is a separate
> directory from Docker's data-root (`/var/lib/docker`, set in
> `/etc/docker/daemon.json`). Relocating only one still dies mid-build with
> `no space left on device`, and `docker info` looks healthy the whole time.
> `scripts/setup-docker-storage.sh`, `make doctor`, and the bootstrap preflight
> all account for both. If you forget to set the variable, the bootstrap
> preflight first recognizes a dedicated local `/var/lib/docker` mount. If one
> is not present, it finds the roomiest writable local volume and prints the
> exact `PSSID_DOCKER_DATA_ROOT=...` line to re-run with.

### Provisioning checklist for the VM administrator

The deployment itself never touches firewalls, DNS, or host networking — as
noted above, that stays outside its scope on purpose (it keeps the product
clean for a security review). Share this checklist with whoever provisions the
VM (network/ITS team):

- **Inbound `80`/`443`** must be reachable from every client network expected to
  reach the site (campus ranges, VPN, etc.). Double-check any VPN/remote-access
  range specifically: it is easy for a firewall to trust a range for SSH (`22`)
  but not for `80`/`443`, which leaves the site healthy on the box yet
  unreachable from a browser on that network — see
  [Troubleshooting](#troubleshooting) for how to diagnose that symptom.
- **A public DNS A record** for the hostname, pointing at the VM's IP.
- **Outbound internet** from the VM to Docker Hub (or GHCR, for
  `PSSID_PULL=true`) and the OS package mirrors — needed during the
  build/pull, not afterward.
- **TLS** and **SSO**, if used: see [TLS](#tls) and
  [Single sign-on](#single-sign-on) for what each needs from the network
  (Let's Encrypt needs inbound `80`; SSO needs the provider's redirect URI
  registered).

## Prerequisites

A Linux host with Docker and Docker Compose. If Docker is not already installed on
Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker ${USER}   # log out and back in, or run: newgrp docker
```

The Ansible playbook below performs these steps for you; installing Docker by
hand is only needed for the plain installer path.

## Deploying with Ansible

The repository ships a role-based Ansible playbook under
[`ansible/`](../ansible/README.md) that takes a fresh box to a running
deployment, Docker included:

```bash
apt-get update && apt-get install -y git ansible
git clone https://github.com/UMNET-perfSONAR/pssid-gui2.git /opt/pssid-gui
cd /opt/pssid-gui/ansible
ansible-playbook site.yml -e pssid_gui_hostname=pssid.example.edu
```

It uses two roles: `docker` installs Docker Engine and the compose plugin, and
`pssid_webgui` runs the same installer described below, so both paths produce
identical deployments. On a first install the playbook also loads the reusable
starter defaults (guarded by a marker file under `/var/lib/pssid`, so re-runs
never touch data) and schedules the nightly backup. `ansible-playbook dev.yml`
brings up the hot-reload development stack instead. Remote hosts, SSO, and all
variables are covered in the [Ansible guide](../ansible/README.md).

## Upgrades and backups

Upgrading an existing deployment is one command:

```bash
make upgrade                # or: cd ansible && ansible-playbook upgrade.yml
```

It backs up the database, fast-forwards the checkout, rebuilds the images,
restarts the stack with the existing settings, and waits for the health check.
MongoDB lives in a named volume that survives rebuilds, and starter defaults
only load on first installs, so upgrades never modify data.

The installer edits `nginx.conf` and `shared/config.ts` in place at deploy time
(hostname, SSO flag, base URL). The upgrade discards those two local edits
before pulling — they would otherwise block the pull whenever upstream also
changed either file — and the installer run that follows regenerates both from
the deployment's settings, so nothing is lost.

### Controller-integrated installs

On machines where the GUI containers run inside the pSSID controller stack
(the compose file the pSSID Ansible playbooks install, normally
`/usr/lib/pssid/docker-compose.yml`) rather than this repository's own stack,
use the controller upgrade script instead:

```bash
scripts/upgrade-controller.sh          # backup, pull, rebuild, restart, verify
```

The script fast-forwards whatever branch the checkout is on, and releases land
on `main`. If the checkout was ever left on a feature branch, every upgrade
will report success while shipping stale code; the script warns when this is
the case. Check with `git branch --show-current` and switch once with
`git checkout main`.

One-time setup: point the controller's GUI services at the locally built
images with an override file, so playbook re-runs cannot revert it. Check the
service names first (`grep -B4 'pssid-gui2'
/usr/lib/pssid/docker-compose.yml`), then create
`/usr/lib/pssid/docker-compose.override.yml`:

```yaml
services:
  client:
    image: pssid-gui2_client:latest
  server:
    image: pssid-gui2_server:latest
  mongo:
    image: pssid-gui2_mongo:latest
```

Compose merges the override automatically, and `docker compose build` in this
repository produces exactly those image names, so editing the playbook-owned
compose file by hand is never needed.

Backups run automatically: production playbook runs install a cron entry that
archives the `gui` database nightly at 03:15 to `mongo-backups/` and prunes
archives older than 14 days (see the [Ansible guide](../ansible/README.md) for
the tuning variables; the log is `/var/log/pssid-gui-backup.log`). On-demand
backups and restores stay one command each:

```bash
make backup                 # archive now (scripts/backup.sh)
make restore                # restore an archive (scripts/restore.sh)
```

## Quickstart

```bash
git clone <your-fork-or-this-repo> pssid-gui
cd pssid-gui
./install.sh
```

The installer asks a few questions (edition, hostname, SSO, and TLS), generates
the secrets and certificates, writes the nginx config, and starts the stack. When
it finishes it prints the URL.

To run it without prompts, pass the answers as flags:

```bash
./install.sh -y \
  --edition=default \
  --hostname=pssid.example.com \
  --tls=self-signed \
  --sso=false
```

`./install.sh --help` lists every option.

## What the installer does

It checks for Docker, Docker Compose, and OpenSSL, then collects the edition,
hostname, SSO, and TLS settings. From those it writes `services/server/.env` (the
Mongo and Redis URLs, `BASE_URL`, `COOKIE_DOMAIN`, a random `SECRET`, and the OIDC
values when SSO is on) and a root `.env` recording the edition and a generated
MongoDB username and password. The database runs with authentication enabled, and
the server connects with those credentials. It applies the SSO flag and base URL
to `shared/config.ts`, generates a certificate (self-signed, or sets up Let's
Encrypt), and renders `nginx.conf` for the hostname. On Linux it creates the probe
runtime directories under `/var/lib/pssid` and `/usr/lib/exec/pssid`. Finally it
starts the containers and waits for `/api/health` to respond.

Both `.env` files and the certificates are gitignored. Re-running the installer is
safe: it reuses the stored MongoDB credentials, overwrites the generated config,
and reuses an existing certificate.

Database authentication is set up when the database is first initialized. If you
add it to a host that already has a database volume from an earlier run without
credentials, the server will not be able to connect; remove the old volume with
`make clean` (this deletes data) and re-run, or restore from a backup once the new
database is up.

## Everyday operations

The Makefile wraps the common commands:

| Command | Purpose |
|---|---|
| `make deploy` | Full automated deployment (Ansible `site.yml`) |
| `make upgrade` | Upgrade in place: backup, pull, rebuild, verify |
| `make up` / `make down` | Start or stop the stack |
| `make restart` | Restart the stack |
| `make logs` | Follow logs from all services |
| `make ps` | List running containers |
| `make build` | Rebuild the images |
| `make dev` | Local development stack on `http://localhost:8888` |
| `make backup` / `make restore` | Back up or restore MongoDB |
| `make seed-defaults` | Load the pre-load starter data (fresh installs) |
| `make seed-qa` | Load the QA dataset (pre-load + probes, MWireless, BatchMW) |
| `make doctor` | Check prerequisites and ports |
| `make test` | Run every unit test (server and client; no stack needed) |
| `make smoke` | Walk every user action against a running stack |
| `make clean` | Stop the stack and remove its volumes (this deletes data) |

`make test` covers the daemon-contract rules for the generated
`pssid_config.json` (the shape rules the probes depend on) and every form
validator. `make smoke` runs `scripts/smoke-test.sh` against a live stack
(default `http://localhost:8888`; pass `SMOKE_URL=https://host` for another):
it creates its own objects, exercises create/read/update/delete on every
collection, the settings endpoint, the config preview, and reference cleanup
on delete, then removes everything it created. The smoke test needs a
writable stack; it aborts with instructions when the target is read-only.

### How the client is served

In production the client is compiled to a static bundle **when its image is
built**: `docker compose build` runs `vue-tsc && vite build` inside the image,
and the container then serves that finished bundle on the internal port 8080
with an SPA fallback (deep links like `/hosts` return the app shell). The image
build context is the repository root, so the build can bundle both the client
app and the repo-root `shared/` config; the edition is passed as a build
argument (from `EDITION` in the root `.env`) and inlined by Vite.

Practical consequences:

- Containers start in seconds (they serve a pre-built bundle), so deploys and
  recreates are fast.
- A broken build (for example a TypeScript error in pulled source) fails at
  `docker compose build`, visibly, **before any container is recreated** - so a
  bad change cannot take a running site down. Both `make refresh` and
  `scripts/upgrade-controller.sh` build before they recreate.
- After a `git pull`, run `make refresh` (unchanged) to rebuild and apply the
  new code.
- Switching editions (`make edition-default`, or `_set-edition EDITION=<id>`) rebuilds the
  client image, because the edition is baked into the bundle at build time.
- `make dev` is unchanged: the development stack overrides the container command
  back to the Vite dev server for hot reload against the mounted source.

## Starter data

Both seeders run `mongosh` inside the database container and, on a production
deployment (where the installer enabled database authentication), read the
MongoDB credentials from the root `.env` automatically — so run them from the
repository root, the same place the Makefile does. `seed-defaults.sh` also
verifies its writes actually landed and fails loudly instead of leaving a
silently empty site.

After seeding, use Settings > Configuration > Preview to inspect and validate the
generated files.

### Pre-load and QA data

[`scripts/seed-defaults.sh`](../scripts/seed-defaults.sh) is the **pre-load**: the
starter data every fresh site begins with (the Ansible role runs it once on first
install). It loads the four standard schedules, the eduroam SSID profile, the
`test-http-to-google` and `test-rtt-to-google` tests, `job-comprehensive`,
`batch-comprehensive` (priority 0, hourly, test interface `$ifacename`), and two
host groups: `all` (host regex `.*`, nothing else attached) and `rpi4` (empty,
group metadata `ifacename=wlan0`). No hosts are pre-loaded, and the retired
`example_script` test type is removed.

[`scripts/seed-qa.sh`](../scripts/seed-qa.sh) (or `make seed-qa`) loads the QA
dataset: the pre-load plus the MWireless profile, `test-http-to-MWireless`
(url `$dest`), the `job-MWagree` (captive portal) and `job-MWireless` jobs,
`BatchMW` (priority 1, MWireless, hourly + every 5 minutes), and two Raspberry Pi
probe hosts. It wires the four assignment paths QA exercises: a group batch via
the `all` regex, group hosts by name in `rpi4` (which delivers the group
metadata `ifacename=wlan0`), a host-level batch (`BatchMW` on probe 1), and
host-level metadata (`dest` on probe 1). Override the probe host names and
destination with `PSSID_QA_PROBE1`, `PSSID_QA_PROBE2`, and `PSSID_QA_MW_DEST`;
the probe names must match the probes' real hostnames.

A batch's **test interface** may be a literal interface (`wlan0`) or a metadata
reference (`$ifacename`), resolved per host by the daemon from that host's
effective metadata. Metadata can be assigned in two places: on the host and on a
host group. Group metadata reaches the hosts a group lists **by name** (host
keys win on collision); regex membership assigns the group's batches but not its
metadata.

### Running the seeders with bootstrap

The pre-load is already wired into the playbook: `scripts/seed-defaults.sh` runs
automatically on first install (guarded by `pssid_gui_seed_defaults: true`, the
default, and a marker file under `/var/lib/pssid` so later playbook runs never
re-seed). So a plain bootstrap already leaves you with the pre-load data:

```bash
curl -fsSL https://raw.githubusercontent.com/UMNET-perfSONAR/pssid-gui2/main/bootstrap.sh | \
  PSSID_HOSTNAME=pssid.example.edu bash
```

`scripts/seed-qa.sh` is intentionally not wired in, since it needs real probe
hostnames. Run it by hand on the VM after bootstrap finishes:

```bash
cd /opt/pssid-gui   # or wherever bootstrap deployed to; see below
PSSID_QA_PROBE1=<real-pi-hostname-1> \
PSSID_QA_PROBE2=<real-pi-hostname-2> \
PSSID_QA_MW_DEST=www.example.edu \
bash scripts/seed-qa.sh
```

The probe names must exactly match the Pis' hostnames, or the daemon exits on
them; running seed-qa over an already pre-loaded database is the expected path
and replaces its own objects cleanly (`make seed-qa` also works, but only with
the placeholder probe names). Where to `cd`: the piped bootstrap clones to
`/opt/pssid-gui` (`$PSSID_GUI_DIR` to override); running `./bootstrap.sh` from a
checkout deploys that checkout instead, so run the seeder from there. Both
seeders `docker exec` into the running mongo container, so they must run on the
VM itself, after the stack is up.

To skip the pre-load and go straight to seed-qa, pass the playbook variable
through bootstrap (extra arguments are forwarded to `ansible-playbook`):

```bash
./bootstrap.sh -e pssid_gui_seed_defaults=false
```

then run `seed-qa.sh` as above; it contains the whole pre-load, so the end state
is the same either way. Re-running `seed-defaults.sh` on a QA box **resets** the
objects it owns (for example it detaches `batch-comprehensive` from `all` and
empties `rpi4`), so on a QA deployment always reseed with `seed-qa.sh`, not
`seed-defaults.sh`.

## Single sign-on

The server uses generic OIDC (`express-openid-connect`), so any compliant provider
works (Okta, Entra ID, Keycloak, Google, and others). Register a web application
with your provider, set the redirect URI to `https://<your-hostname>/callback` and
the sign-out URI to `https://<your-hostname>`, and make sure the ID token includes
a groups claim. Run the installer with `--sso=true` and supply the issuer URL,
client ID, and client secret, or answer the prompts.

Map the provider's group names to permissions in
[`shared/auth-groups.config.json`](../shared/auth-groups.config.json):

```json
{
  "permissions": {
    "your-write-group": "write",
    "your-read-group":  "read"
  }
}
```

With SSO off, access is governed by `OPEN_WRITE` in `shared/config.ts`: `true`
allows anyone to read and write, `false` makes the interface read-only.

### Example: Okta

1. Sign in to your Okta tenant with an admin account, go to Applications, then
   Create App Integration, and choose OIDC (OpenID Connect) followed by Web
   Application. Set the sign-in redirect URI to `https://<your-hostname>/callback`
   and the sign-out redirect URI to `https://<your-hostname>`. Save, and note the
   client ID and client secret.
2. Under Sign On, open the OpenID Connect ID Token section, set the groups claim
   type to Filter, and set a filter that matches your groups (for example, starts
   with `pssid`). A federated higher-education tenant may instead pass the
   eduPerson `edumember_is_member_of` attribute from the directory; where that is
   configured the claim arrives on its own and no filter is needed. The
   application reads either `edumember_is_member_of` or the standard `groups`
   claim.
3. Use the Okta org authorization server as the issuer, for example
   `ISSUER_BASE_URL=https://<your-tenant>.okta.com`. The discovery document is at
   `<ISSUER_BASE_URL>/.well-known/openid-configuration`. Do not append
   `/oauth2/default`; that path is for Okta custom authorization servers and is
   not used here.
4. Set the group permissions in
   [`shared/auth-groups.config.json`](../shared/auth-groups.config.json), for
   example `"pssid-gui": "write"` and `"pssid-gui-users": "read"`.

## TLS

The installer supports three modes. `self-signed`, the default, gives you HTTPS
right away (with the usual browser warning) and suits internal or lab use.
`letsencrypt` issues real certificates and needs ports 80 and 443 reachable from
the internet; the bundled certbot service handles renewals, and you issue the
first certificate once the stack is up. `none` serves plain HTTP and is only
appropriate for local testing.

## Editions

The interface can be shown with a different appearance for each organization: its
colors, product name, and logo. One edition ships today: `default`, a neutral navy
and cyan. The active edition is chosen by the `EDITION` value, which the installer
writes to the root `.env`. You can change it later with `make edition-default` (or
`make _set-edition EDITION=<id>` for an edition you have added), which rebuilds the
client image with the new edition (it is baked into the bundle at build time)
and recreates the container.

To add an organization, add an entry to
[`services/client/src/edition/editions.ts`](../services/client/src/edition/editions.ts),
copying an existing one as a starting point. Each color has a matching `*Rgb`
value (the comma-separated channels) so that translucent tints follow the same
color:

```ts
acme: {
  id: 'acme',
  productName: 'pSSID GUI · Acme University',
  shortName: 'pSSID',
  emphasis: 'GUI',
  org: 'Acme University',
  tagline: 'Wireless measurement orchestration for Acme.',
  glyph: 'wifi',          // any Material Icons name
  version: 'v2.0',
  colors: {
    primary:     '#1a2b4c',
    primaryDark: '#11203c',
    primaryRgb:  '26,43,76',
    accent:      '#e85d2a',
    accentRgb:   '232,93,42',
    accentText:  '#2a1206',
  },
},
```

Then deploy with `--edition=acme`, or set `EDITION=acme` in `.env`. Nothing else needs
to change; the colors, product name, page title, and favicon all follow that
entry. A few notes on the colors: `primary` is used for the navbar, headers, and
primary buttons, and `primaryDark` is its hover shade; `accent` highlights the
active navigation item and the product name, and `accentText` has to be readable
on top of it; keep each `*Rgb` value in step with its hex color. Status colors
(success green, danger red) are deliberately fixed so they always read the same
way.

## Host groups, regex, and metadata

### Host regex is a standard regular expression, anchored at the start

A host group can select its members by name with a regular expression. The
daemon on the probe matches it with **Python's `re.match`** (the
`find_matching_regex` function in `pssid-daemon.py`), so the rules are exactly
`re.match`'s:

- It is a **full regular expression**. `.` is any character; `*`, `+`, `?` are
  quantifiers; `[...]` is a character class; `(...)` groups; `|` alternates;
  `\d`, `\w` and the rest all work. They are **not** treated as literal
  characters.
- It is anchored at the **start** of the hostname but **not** the end (`re.match`
  matches a prefix). So `probe-01` also matches `probe-011` and
  `probe-01.example.edu`. To match a name **exactly**, end the pattern with `$`
  (for example `probe-01$`).
- `*` (and `+`, `?`) must follow something. A bare `*` is an invalid pattern:
  the daemon logs it and the group matches no host. Use `.*` to mean
  "everything", not `*`. The shipped `all` group uses `.*` for exactly this
  reason.
- Matching is case-sensitive, and a group may hold several patterns (the "Add
  Host Regex Specifier" button); a host joins the group if **any one** matches.

Examples:

| Pattern | Matches | Does not match |
|---|---|---|
| `.*` | every host | — |
| `rp.*` | `rp4-01`, `rpi-lab` | `sensor-1` |
| `probe-0[12]` | `probe-01`, `probe-02` | `probe-03` |
| `probe-01$` | `probe-01` only | `probe-011` |
| `probe` | `probe`, `probe-01`, `probeXYZ` | `sensor` |

The GUI's Preview and each host's "Probe configuration" panel evaluate the same
`re.match` semantics, so the group membership they show matches what the daemon
computes on the probe.

### Metadata

Metadata is key/value data attached to **hosts** and **host groups** (the
"Metadata" section of each form). It lets you describe a class of hardware or a
site once and reference it from tests, instead of duplicating a test per machine
type. Typical uses: the network interface name (which can differ across hardware
even on the same OS) or a per-group test destination.

- **Where it is defined:** on hosts and on host groups.
- **Preference and override:** a host's effective metadata is its group metadata
  with the host's own metadata layered on top, so **host keys win** on collision.
  Collisions between two groups a host belongs to are order-dependent and
  therefore **indeterminate** by contract; avoid defining the same key on
  overlapping groups.
- **Where it is used:** the generated `pssid_config.json` carries each host's
  effective metadata under a `metadata` key, and the daemon substitutes `$key`
  references from it per host (an unresolved `$key` invalidates the batch on
  that host). The pre-load and QA data show the pattern: `batch-comprehensive`
  and `BatchMW` set the test interface to `$ifacename` (supplied by the `rpi4`
  group as `ifacename=wlan0`), and `test-http-to-MWireless` targets `$dest`
  (supplied by the probe's own host metadata).
- **Group metadata reaches named hosts only:** a group's metadata applies to
  the hosts the group lists by name. A host matched only by the group's regex
  still receives the group's **batches**, but not its metadata.

## Provisioning and automation

Everything you create in the GUI (hosts, host groups, schedules, SSID profiles,
tests, jobs, and batches) is stored in MongoDB. The server turns that into the
files the probes use: `pssid_config.json` (the merged daemon configuration) and
`hosts.ini` (the Ansible inventory), built by
[`build_config_payload()`](../services/server/src/services/config.service.ts) and
validated against the daemon's rules before they are emitted.

**Settings > Configuration** has two actions:

- **Preview** builds and validates the files from the current database state and
  shows them in the browser **without writing anything to disk**. This is the
  guarantee the GUI can make: that the config it generates is well-formed and
  passes the same checks the daemon enforces.
- **Generate** runs the same build and validation and then **writes**
  `pssid_config.json` and `hosts.ini` to the controller (the server's output
  directory, `/var/lib/pssid/output` on a standard deploy), so they exist as real
  files, for example to run the daemon's own `--validate` check against them.

Both validate the WHOLE database at once, because the daemon receives one file:
a single broken batch anywhere blocks them (with the specific problem), even if
it belongs to a host you are not looking at. Neither delivers anything to the
probes; that is the separate step described below.

Each host's own edit page (**Hosts > select a host > Probe configuration**)
shows a different, narrower view: the slice of the config that ONE host
actually runs (via
[`build_host_view()`](../services/server/src/services/config.service.ts)),
validated against only that host's own batches. A problem elsewhere in the
database (a different host's broken batch) does not appear here; a problem in
this host's own batches does, as a scoped warning, and the rest of its
(otherwise valid) configuration still renders. This is why a host can show a
clean Probe configuration while Preview still reports an error elsewhere in
the database, and it is intentional: fix the flagged host to clear its own
warning, and clear every host's warnings (or check Preview directly) before
relying on the whole file being valid.

Delivering those files to real probes is a separate step performed by
`bin/provision` (an Ansible-based script that copies the config out and restarts
the daemon). The copy shipped in this repository,
`services/server/starters/provision`, is a placeholder that only logs; a
deployment must drop a real provision script at the path in `paths_config.json`
(`/usr/lib/exec/pssid/provision`) for provisioning to reach the probes. Until
then the GUI's job ends at generating and validating a correct config file.

**Generate** writes the files and stops there: it runs `bin/provision`, which
today is the placeholder above, so nothing reaches a probe yet. The `settings`
collection's `autoProvision` flag (served at `GET`/`PUT /api/settings`) and the
per-host/per-group provision endpoints remain in the server for when a real
provision script is in place, but the GUI exposes only the single **Generate**
action, not per-item provision buttons or an auto-provision toggle.

For working on the code itself, the development stack reloads the client and
server as you edit:

```bash
make dev      # http://localhost:8888; edits under services/*/src reload live
```

The source directories are mounted into the containers, so changes are picked up
without rebuilding images.

### Image-based deployments

When deploying from prebuilt images rather than a source build, pin a release
tag for reproducibility:

```
<registry>/pssid-gui2_client:v1
<registry>/pssid-gui2_server:v1
<registry>/pssid-gui2_mongo:v1
```

Mount `shared/` into both the client and server containers, and do not mount the
`node_modules` volumes, which would hide the dependencies already in the image.
For SSO, provide the OIDC values through the server's env file.

## Troubleshooting

```bash
make ps                              # are the containers running?
make logs                            # what do the logs say?
make doctor                          # prerequisites and port conflicts
curl -k https://<host>/api/health    # server and database health
```

A few common issues:

- If a port is already in use, stop the other service or change the mapping.
  The production stack publishes only 80 and 443 (nginx); everything else stays
  on the internal Docker network. The development stack publishes 8888.
- The certificate warning under `--tls=self-signed` is expected; choose Advanced,
  then Proceed.
- For an SSO redirect loop, check that `BASE_URL` and `COOKIE_DOMAIN` in
  `services/server/.env` match the hostname in the browser, and that the
  provider's redirect URI is exactly `https://<host>/callback`.
- **Healthy on the box but "This site can't be reached" in the browser** →
  a firewall/reachability gap, not an application problem (see
  [provisioning checklist](#provisioning-checklist-for-the-vm-administrator)).
  A common cause: the host firewall trusts a remote-access range for SSH (`22`)
  but not for `443`, so `curl -sk https://localhost/api/health` succeeds on the
  box while the site stays unreachable from a browser on that network.
  Diagnose which source IP is being dropped and on which port:
  ```bash
  grep 'UFW BLOCK' /var/log/ufw.log | tail     # SRC= the dropped client IP; DPT= the port
  ```
  then compare that `SRC=` against the ranges `ufw status` allows for `443`,
  and add `80`/`443` to the same source ranges already allowed for SSH
  (ideally in the managed firewall template so it survives config runs).
- **The client image fails to build** (for example a TypeScript error in pulled
  source). `docker compose build` stops with the exact compiler error and a
  non-zero exit. Because `make refresh` and `scripts/upgrade-controller.sh` both
  build *before* they recreate anything, this happens before any container is
  touched: a currently-running site keeps serving the previous image and stays
  up. Fix the reported error in `services/client/src` (or, on a controller box,
  the deployment's `shared/config.ts`), then re-run the build or upgrade.
  Nothing on the running stack needs to be undone.
- **`no space left on device` partway through a build, even after moving Docker
  to a bigger disk.** Modern Docker Engine extracts image layers through
  **containerd's own snapshotter**, which has its own storage root (default
  `/var/lib/containerd`) that is completely separate from Docker's own
  `data-root` (default `/var/lib/docker`, set in `/etc/docker/daemon.json`).
  On a VM with a small root disk and a large secondary volume, redirecting
  only `daemon.json`'s `data-root` is not enough: `docker info` and this
  project's disk preflight (`make doctor`, `scripts/lib/preflight.sh`,
  `bootstrap.sh`) will report the roomy volume as free and healthy, while
  containerd keeps writing to the cramped default path and the build still
  dies mid-layer-extraction. Point containerd at the same volume with a bind
  mount:
  ```bash
  sudo systemctl stop docker containerd
  sudo mkdir -p /path/to/big/volume/containerd
  sudo rsync -a /var/lib/containerd/ /path/to/big/volume/containerd/  # keep anything already there
  sudo mount --bind /path/to/big/volume/containerd /var/lib/containerd
  echo '/path/to/big/volume/containerd /var/lib/containerd none bind 0 0' | sudo tee -a /etc/fstab
  sudo systemctl start containerd docker
  ```
  `make doctor` and `scripts/lib/preflight.sh`'s `check_disk` check both
  Docker's and containerd's storage roots for exactly this reason.
