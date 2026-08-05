# Deploying without single sign-on

This is the fastest path to a running deployment: no identity provider to
register, no redirect URIs, no group mapping. It suits a host that is already
access-controlled some other way — a private VLAN, a VPN-only network, or a
lab — since the application itself does not authenticate anyone in this
posture.

There is exactly **one supported installation path**, described below. It is
the same one [deployment with SSO](deployment-with-sso.md) uses; the only
difference is which flags you pass it.

## What this posture is

`ENABLE_SSO` is one flag and it **ships `false`**. With it off:

- Every page loads for anyone who can reach the hostname. There is no sign-in.
- Whether they can also **save changes** is a second, independent flag,
  `OPEN_WRITE`, which also **ships `false`**. A fresh deployment is therefore
  read-only by default, not open: reads work, every form is disabled, and
  nothing explains why until you open writes deliberately (below).
- Opening writes means **anyone who can reach the hostname can change the
  probe configuration** — the network in front of the site becomes its only
  access control. That is a reasonable posture on a private network; it is not
  one to leave in place on a reachable host. Prefer
  [SSO](deployment-with-sso.md) wherever the site is reachable by anyone
  outside a trusted network.

Nothing here is a dead end: SSO can be turned on for the same deployment later
without reinstalling. See [Moving to SSO later](#moving-to-sso-later).

## One command

On a fresh Unix host, as root:

```bash
curl -fsSL https://raw.githubusercontent.com/UMNET-perfSONAR/pssid-gui2/main/bootstrap.sh | bash
```

This installs git and Ansible, clones the repository, and runs the Ansible
playbook, which itself installs Docker and runs [`install.sh`](../install.sh)
internally — the same installer you would run by hand, described below. There
is no other script this repository documents or supports for a first install;
the Ansible playbooks, `make deploy`, and the piped bootstrap all resolve to
this one installer, so an instruction that works for one works for all of
them.

`ENABLE_SSO` needs no flag here — it ships off — but the write policy is worth
setting explicitly rather than accepting the read-only default silently:

```bash
curl -fsSL https://raw.githubusercontent.com/UMNET-perfSONAR/pssid-gui2/main/bootstrap.sh \
  | PSSID_HOSTNAME=pssid.example.edu PSSID_OPEN_WRITE=true bash
```

Afterwards, one command each keeps the deployment maintained:

```bash
make upgrade    # backup, pull the latest release, rebuild, verify health
make backup     # extra on-demand database backup (nightly ones are automatic)
make help       # every operator shortcut (up, down, logs, doctor, ...)
```

## The same steps, by hand

The command above only strings together the steps below. Run them yourself
when you want control at each point, or when something needs investigating;
the [Ansible guide](../ansible/README.md) and the
[full deployment reference](deployment.md) cover each stage in depth.

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
   upgrades, and backups):
   ```bash
   cd /opt/pssid-gui/ansible
   ansible-playbook site.yml \
     -e pssid_gui_hostname=pssid.example.edu \
     -e pssid_gui_open_write=true
   ```
   or, when Docker is already installed, the installer directly:
   ```bash
   ./install.sh --hostname=pssid.example.edu --sso=false --open-write=true -y
   ```
   Omit `--open-write` / `pssid_gui_open_write` (or pass `false`) to keep the
   shipped read-only default. `ENABLE_SSO` needs no flag in either form — it
   ships off. `./install.sh` with no flags asks interactively.

Then [verify](#verify) and optionally load the starter data, exactly as with
the one-command path.

## Verify

```bash
make sso-status                          # posture: SSO off, writes on/off
curl -k https://<host>/api/health        # {"status":"ok",...}
curl -k https://<host>/api/userinfo      # {"sso_enabled":false,"access_level":"write"|"read",...}
```

Then load the starter data so the interface is not empty on first load:

```bash
make seed-defaults
```

## Changing the write policy later

No rebuild needed — this flag is resolved by the server per request:

```bash
make writes-on     # allow writes while SSO is off
make writes-off     # back to read-only
```

## Moving to SSO later

Nothing about this posture is permanent. Register an identity provider
whenever you are ready and follow [deployment with SSO](deployment-with-sso.md);
the credentials can be filled in ahead of time and sit inert until you flip the
switch with `make sso-on`, which refuses to proceed until they are complete
rather than starting a server that authenticates nobody.

## Further reading

The [full deployment guide](deployment.md) covers what is out of scope
here: TLS modes, disk sizing for small VMs, editions, upgrades and backups,
the provisioning pipeline that delivers the generated config to probes, and
troubleshooting. [`../README.md`](../README.md) is the project overview.
