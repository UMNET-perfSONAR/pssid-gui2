<h1 align="center">pSSID GUI</h1>

<p align="center">
  <em>Wireless measurement orchestration — design, manage, and deploy pSSID daemon
  configuration from a single web interface.</em>
</p>

---

pSSID GUI is a web application for generating and managing pSSID configuration
through a graphical interface. Define **hosts, host groups, schedules, SSID
profiles, tests, jobs,** and **batches**, then push the resulting daemon
configuration to your measurement probes — manually or automatically.

It ships as one codebase that can be **branded per organization** (white-label),
deploys with a **single command**, and keeps the existing security model
(HTTPS, optional SSO, isolated Docker network).

---

## Quickstart

On a host with Docker + Docker Compose:

```bash
git clone <this-repo> pssid-gui
cd pssid-gui
./install.sh
```

The installer prompts for brand, hostname, SSO, and TLS; generates all secrets
and certificates; renders nginx; and brings the stack up. Fully scriptable, too:

```bash
./install.sh -y --brand=default --hostname=pssid.example.com --tls=self-signed --sso=false
```

Then manage it with `make`:

```bash
make up      make down      make logs      make ps
make dev     # local hot-reload dev stack (http://localhost:8888)
make doctor  # check prerequisites + ports
```

---

## Documentation

| Guide | For |
|---|---|
| **[Deploy — any organization](docs/generic/README.md)** | General deployment with any OIDC provider |
| **[Deploy — University of Michigan](docs/umich/README.md)** | UMich edition + Okta SSO specifics |
| **[Branding & white-labeling](docs/BRANDING.md)** | Switch editions or add your own org's identity |
| **[Automation — GUI → daemon sync](docs/AUTOMATION.md)** | Auto-provision, safety model, dev hot-reload |

---

## System overview

The application is containerized with Docker. Depending on the deployment mode it
runs some of: `client`, `server`, `mongo`, `nginx`, `redis` (SSO sessions), and
`certbot` (TLS renewal).

Users interact with the **client** in the browser. The client talks to the
**server**, which stores data in **MongoDB**. **nginx** terminates HTTPS and
routes traffic into the internal Docker network, keeping internal services
isolated from direct public access.

<p align="center">
  <img width="80%" alt="pSSID GUI controller architecture" src="assets/gui-controller-v2.png">
</p>

The GUI produces two outputs:

- **`hosts.ini`** — an Ansible inventory of hosts and groups.
- **`pssid_config.json`** — the pSSID daemon configuration (the batches to
  schedule and run).

The provision script uses Ansible to copy the daemon config onto the probes in
`hosts.ini`; the pSSID daemon on each probe then runs accordingly. See
[docs/AUTOMATION.md](docs/AUTOMATION.md) for the full pipeline and the
auto-provision feature.

---

## Configuration file anatomy

The daemon config is built from seven components, each with its own page in the
GUI dashboard (create / read / update / delete on every page):

1. Hosts &nbsp; 2. Host groups &nbsp; 3. Schedules &nbsp; 4. SSID profiles &nbsp;
5. Tests &nbsp; 6. Jobs &nbsp; 7. Batches

Test templates on disk define the fields each test type requires; tests compose
into jobs; SSID profiles, schedules, and jobs combine into **batches**, which are
what actually run on the probes.

<p align="center">
  <img width="80%" alt="pSSID config file anatomy" src="assets/config-file-anatomy.png">
</p>

---

## Access control (SSO)

The app supports two modes, configured in
[`shared/config.ts`](shared/config.ts):

- **SSO enabled** — users authenticate via any OIDC provider; group membership
  maps to `read`/`write` in
  [`shared/auth-groups.config.json`](shared/auth-groups.config.json).
- **SSO disabled** — open access, with `OPEN_WRITE` choosing read-only vs
  read-write.

The installer sets these for you. Provider-specific setup is in the
[generic](docs/generic/README.md) and [UMich](docs/umich/README.md) guides.

---

## Repository documentation

- [Adding fields to the config file](services/README.md)
- [Backend folders](services/server/src/README.md) ·
  [Service files](services/server/src/services/README.md) ·
  [Test template files](services/server/README.md)
- [Frontend directories](services/client/src/README.md) ·
  [Client components](services/client/src/components/README.md)

---

## Troubleshooting

```bash
make doctor                          # prerequisites + port conflicts
make ps                              # are containers running?
make logs                            # service logs
curl -k https://<host>/api/health    # server + DB health
```

More tips in the [deployment guide](docs/generic/README.md#troubleshooting).
