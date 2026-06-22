# pSSID GUI

pSSID GUI is a web application for building and managing pSSID configuration
through a browser. You define hosts, host groups, schedules, SSID profiles,
tests, jobs, and batches, and the application produces the files the pSSID daemon
needs and sends them to your probes.

The same codebase can be themed for different organizations, and the included
installer brings the stack up in one step while keeping the existing security
model: HTTPS, optional single sign-on, and an isolated Docker network.

## Quickstart

On a host with Docker and Docker Compose:

```bash
git clone <this-repo> pssid-gui
cd pssid-gui
./install.sh
```

The installer asks for the edition, hostname, SSO, and TLS settings, generates the
secrets and certificates, writes the nginx config, and starts the containers. It
can also run without prompts:

```bash
./install.sh -y --edition=default --hostname=pssid.example.com --tls=self-signed --sso=false
```

Day-to-day operations are wrapped in a Makefile (`make up`, `make down`,
`make logs`, `make dev`, `make doctor`, and others). Run `make help` for the
full list.

## Documentation

The [deployment guide](docs/deployment.md) covers installation, single sign-on
(including UMich Okta), TLS, editions, and the provisioning pipeline.

## System overview

The application runs as a set of Docker containers: `client`, `server`, `mongo`,
and `nginx`, plus `redis` for session storage and `certbot` for certificate
renewal when single sign-on is enabled.

Users interact with the client in the browser. The client talks to the server,
which stores its data in MongoDB. nginx terminates HTTPS and routes traffic into
the internal Docker network, so the internal services are not exposed directly.

<p align="center">
  <img width="80%" alt="pSSID GUI controller architecture" src="assets/gui-controller-v2.png">
</p>

The application produces two files:

- `hosts.ini`, an Ansible inventory of the hosts and groups.
- `pssid_config.json`, the pSSID daemon configuration, which lists the batches to
  run.

The provision script uses Ansible to copy the daemon config onto the probes in
`hosts.ini` and restart the daemon on each one. The deployment guide describes the
[full pipeline](docs/deployment.md#provisioning-and-automation).

## Configuration file anatomy

The daemon configuration is built from seven components, each with its own page
in the dashboard: hosts, host groups, schedules, SSID profiles, tests, jobs, and
batches. Test templates on disk define the fields each test type needs. Tests are
combined into jobs, and SSID profiles, schedules, and jobs are combined into
batches. The batches are what run on the probes.

<p align="center">
  <img width="80%" alt="pSSID config file anatomy" src="assets/config-file-anatomy.png">
</p>

## Access control

Access is configured in [`shared/config.ts`](shared/config.ts). With single
sign-on enabled, users sign in through an OIDC provider, and group membership maps
to read or write access in
[`shared/auth-groups.config.json`](shared/auth-groups.config.json). With SSO
disabled, access is open, and `OPEN_WRITE` decides whether unauthenticated users
have read-only or read-write access. The installer sets these values; the
[deployment guide](docs/deployment.md#single-sign-on) covers provider-specific
setup.

## Further reading

- [Adding fields to the config file](services/README.md)
- [Backend folders](services/server/src/README.md),
  [service files](services/server/src/services/README.md), and
  [test templates](services/server/README.md)
- [Frontend directories](services/client/src/README.md) and
  [components](services/client/src/components/README.md)

## Troubleshooting

```bash
make doctor                          # prerequisites and port conflicts
make ps                              # container status
make logs                            # service logs
curl -k https://<host>/api/health    # server and database health
```

The [deployment guide](docs/deployment.md#troubleshooting) has more.
