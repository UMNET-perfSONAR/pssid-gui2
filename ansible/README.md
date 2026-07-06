# Deploying pSSID GUI with Ansible

This playbook deploys the pSSID GUI end to end on a fresh Unix box: it installs
Docker, then installs, configures, and starts the application stack. It is
built from two roles:

- **docker**: installs Docker Engine and the compose plugin from Docker's
  official repository (Debian/Ubuntu). Hosts that already have Docker are left
  untouched.
- **pssid_webgui**: fetches the application, generates its secrets,
  certificates, and nginx configuration, starts the containers, and waits for
  the health check to pass.

## Production install

On the target box, as root:

```bash
apt-get update && apt-get install -y git ansible
git clone https://github.com/UMNET-perfSONAR/pssid-gui2.git /opt/pssid-gui
cd /opt/pssid-gui/ansible
ansible-playbook site.yml -e pssid_gui_hostname=pssid.example.edu
```

Then open `https://pssid.example.edu`. That is the whole procedure: the
playbook installs Docker if it is missing, generates a self-signed certificate
and all secrets, and brings the stack up. With the default self-signed
certificate the browser shows a warning once; choose Advanced, then Proceed.

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
