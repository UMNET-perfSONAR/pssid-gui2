# Deployment

This guide covers deploying pSSID GUI on a single host with Docker. It applies to
any organization. The University of Michigan specifics (Okta sign-on, hostnames,
and published images) are gathered in their own section near the end.

## Contents

- [Prerequisites](#prerequisites)
- [Deploying with Ansible](#deploying-with-ansible)
- [Quickstart](#quickstart)
- [What the installer does](#what-the-installer-does)
- [Everyday operations](#everyday-operations)
- [Demo data](#demo-data)
- [Single sign-on](#single-sign-on)
- [TLS](#tls)
- [Editions](#editions)
- [Provisioning and automation](#provisioning-and-automation)
- [University of Michigan notes](#university-of-michigan-notes)
- [Troubleshooting](#troubleshooting)

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
identical deployments. `ansible-playbook dev.yml` brings up the hot-reload
development stack instead. Remote hosts, SSO, and all variables are covered in
the [Ansible guide](../ansible/README.md).

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
| `make up` / `make down` | Start or stop the stack |
| `make restart` | Restart the stack |
| `make logs` | Follow logs from all services |
| `make ps` | List running containers |
| `make build` | Rebuild the images |
| `make dev` | Local development stack on `http://localhost:8888` |
| `make backup` / `make restore` | Back up or restore MongoDB |
| `make doctor` | Check prerequisites and ports |
| `make test` | Run every unit test (server and client; no stack needed) |
| `make smoke` | Walk every user action against a running stack |
| `make clean` | Stop the stack and remove its volumes (this deletes data) |

`make test` covers the daemon-contract rules for the generated
`pssid_config.json` (the shape rules the probes depend on) and every form
validator. `make smoke` runs `scripts/smoke-test.sh` against a live stack
(default `http://localhost:8888`; pass `SMOKE_URL=https://host` for another):
it creates its own objects, exercises create/read/update/delete on every
collection, the settings toggle, the provision preview, and reference cleanup
on delete, then removes everything it created. The smoke test needs a
writable stack; it aborts with instructions when the target is read-only.

## Demo data

Use one command for demos:

```bash
make seed-demo
```

This loads the canonical sample dataset through
[`scripts/seed-demo.sh`](../scripts/seed-demo.sh). The data matches the current
GUI forms and config generator: SSID profiles include their layer 2 and layer 3
methods, tests use the dynamic-form `spec` array shape, jobs use the daemon's
string fields, host metadata is stored as objects, and host regexes are arrays.
After seeding, use Settings > Provisioning tools to preview or provision the
generated files.

The old [`scripts/seed-config-demo.sh`](../scripts/seed-config-demo.sh) command
is kept only as a compatibility wrapper around `seed-demo.sh`, so running it will
load the same current dataset. [`scripts/seed-defaults.sh`](../scripts/seed-defaults.sh)
is not a demo loader; it inserts reusable starter schedules, SSID profiles, a
metadata-based test, and an `all` host group for a fresh site.

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

### UMich Okta

The steps below are specific to UMich's Okta tenant.

1. Sign in to [umich.okta.com](https://umich.okta.com) with an admin account, go
   to Applications, then Create App Integration, and choose OIDC (OpenID Connect)
   followed by Web Application. Set the sign-in redirect URI to
   `https://<your-hostname>/callback` and the sign-out redirect URI to
   `https://<your-hostname>`. Save, and note the client ID and client secret.
2. Under Sign On, open the OpenID Connect ID Token section, set the groups claim
   type to Filter, and set a filter that matches your groups (for example, starts
   with `pssid`). UMich's Okta may instead pass the `edumember_is_member_of`
   attribute from the campus directory; if your admin has set that up, the claim
   arrives on its own and no filter is needed. The application reads either
   `edumember_is_member_of` or the standard `groups` claim.
3. Use the Okta org authorization server as the issuer:
   `ISSUER_BASE_URL=https://umich.okta.com`. The discovery document is at
   `https://umich.okta.com/.well-known/openid-configuration`. Do not append
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
colors, product name, and logo. Two editions ship today: `default`, a neutral navy
and cyan, and `umich`, UMich navy and maize. The active edition is chosen by the
`EDITION` value, which the installer writes to the root `.env`. You can change it
later with `make edition-default` or `make edition-umich`, which recreate the
client container.

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

### Host regex uses a custom library, not standard regex

A host group can select its members by name with a regex, but it is **not**
standard regex. It uses the pSSID matching library, where:

- `.` matches any single character
- `*` means zero or more occurrences of the preceding character

So the pattern that matches every host is `.*` (not `*`). For example, `rp.*`
matches every host whose name starts with `rp`. If you type `*` expecting "match
everything" you will get the wrong result; use `.*`. The shipped `all` group uses
`.*` for exactly this reason.

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
  effective metadata under a `metadata` key, so the daemon can resolve references
  per host. The shipped `throughput-by-metadata` test shows the pattern: its
  destination is `{{throughput_dest}}`, resolved from the host's metadata.

Metadata is an early feature and the reference syntax is still being finalized,
so treat the placeholder convention above as provisional.

## Provisioning and automation

Everything you create in the GUI (hosts, host groups, schedules, SSID profiles,
tests, jobs, and batches) is stored in MongoDB. Provisioning turns that into the
files the probes use and sends them out: it writes `hosts.ini` (the Ansible
inventory) and `pssid_config.json` (the merged daemon configuration), then runs
`bin/provision`, which uses Ansible to copy the config to the probes and restart
the daemon. This is implemented in
[`create_config_file()`](../services/server/src/services/config.service.ts).

By default this is manual: use Configure selected host or Configure selected group
on the Hosts or Groups page, or Provision now on the Settings page. You can also
turn on Auto-provision on change in Settings, after which a successful edit to any
collection that affects the daemon regenerates the config and pushes it without a
manual step.

When automatic provisioning is on:

- It stays off until someone enables it.
- Rapid edits are grouped into a single run using a short window of about five
  seconds, so a burst of changes does not start a series of Ansible runs. If a run
  is already in progress, the next one waits rather than overlapping.
- Automatic runs follow the same path as manual ones, including the on-disk
  re-check of each SSID profile's layer 2 and layer 3 methods.
- Turning the setting on or off requires write access.

The setting is stored in the Mongo `settings` collection and served at `GET` and
`PUT /api/settings`.

For working on the code itself, the development stack reloads the client and
server as you edit:

```bash
make dev      # http://localhost:8888; edits under services/*/src reload live
```

The source directories are mounted into the containers, so changes are picked up
without rebuilding images.

## University of Michigan notes

A typical UMich install:

```bash
./install.sh \
  --edition=umich \
  --hostname=pssid-web-dev.miserver.it.umich.edu \
  --sso=true \
  --issuer=https://umich.okta.com \
  --client-id=<from Okta> \
  --client-secret=<from Okta> \
  --tls=letsencrypt --email=<team-alias>@umich.edu
```

For an Ansible-managed install, use the playbook that ships in this repository
([`ansible/`](../ansible/README.md)); it wraps the same installer with a
`docker` role and a `pssid_webgui` role. UMNET separately maintains an older
standalone playbook
(`https://github.com/UMNET-perfSONAR/ansible-playbook-pssid-GUI-deploy.git`)
that renders its own compose file under `/usr/lib/pssid`; it predates the
in-repo playbook. Prefer the in-repo playbook unless the host is already
managed by the standalone one.

Release images are published under the `umnetworking` Docker Hub organization. Pin
a release tag for reproducible deployments:

```
umnetworking/pssid-gui2_client:v3.2.0
umnetworking/pssid-gui2_server:v3.2.0
umnetworking/pssid-gui2_mongo:v3.2.0
```

For an image-based deployment, mount `shared/` into both the client and server
containers, and do not mount the `node_modules` volumes, which would hide the
dependencies already in the image. For SSO, provide the OIDC values through
`/usr/lib/pssid/server.env`.

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
