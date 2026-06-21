# pSSID GUI — Deployment Guide (any organization)

This is the vendor-neutral deployment guide. It deploys the **default brand**
edition and works with **any** OIDC identity provider. If you are deploying for
the University of Michigan, use [docs/umich/README.md](../umich/README.md) instead.

> pSSID GUI is a web application for generating and managing pSSID daemon
> configuration through a graphical interface — hosts, host groups, schedules,
> SSID profiles, tests, jobs, and batches — and pushing that configuration to
> your measurement probes.

---

## Quickstart (≈60 seconds)

On a host with Docker and Docker Compose installed:

```bash
git clone <your-fork-or-this-repo> pssid-gui
cd pssid-gui
./install.sh
```

The installer asks a few questions (brand, hostname, SSO, TLS), generates all
secrets and certificates, renders the nginx config, and brings the stack up. When
it finishes it prints your URL.

Prefer fully unattended? Pass everything as flags:

```bash
./install.sh -y \
  --brand=default \
  --hostname=pssid.example.com \
  --tls=self-signed \
  --sso=false
```

Run `./install.sh --help` for the full option list.

---

## What the installer does

1. **Preflight** — verifies Docker, Docker Compose, and OpenSSL; warns about
   busy ports (80/443/8000/8080/27017).
2. **Collects config** — brand, public hostname, SSO on/off (+ OIDC details),
   and TLS mode.
3. **Generates `services/server/.env`** — Mongo/Redis URLs, `BASE_URL`,
   `COOKIE_DOMAIN`, a random 32-byte `SECRET`, and (if SSO) the OIDC values.
   This file is gitignored and never committed.
4. **Writes the root `.env`** — `BRAND=...` so Docker Compose builds the right
   edition.
5. **Applies SSO + base URL** to `shared/config.ts` (the flag both the client and
   server read).
6. **TLS + nginx** — generates a self-signed certificate (or sets up for Let's
   Encrypt), then renders `nginx.conf` for your hostname.
7. **Prepares probe directories** (Linux) — `/usr/lib/exec/pssid`,
   `/var/lib/pssid/{plugins,output}`.
8. **Starts the stack** — `docker compose up -d` (adds the `sso` profile, which
   includes Redis, when SSO is enabled).
9. **Health check** — polls `/api/health` and prints the result.

Re-running the installer is safe; it overwrites generated config and reuses
existing certificates.

---

## Day-2 operations (Makefile)

| Command | What it does |
|---|---|
| `make up` / `make down` | Start / stop the production stack |
| `make restart` | Restart the stack |
| `make logs` | Tail logs from all services |
| `make ps` | List running containers |
| `make build` | Rebuild images from source |
| `make dev` | Local hot-reload stack at `http://localhost:8888` |
| `make brand-default` / `make brand-umich` | Switch the visual edition |
| `make backup` / `make restore` | MongoDB backup / restore |
| `make doctor` | Check prerequisites and ports |
| `make clean` | Stop and **delete volumes** (destroys data) |

---

## Installing Docker (Ubuntu)

If Docker is not yet installed:

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
sudo usermod -aG docker ${USER}   # log out/in (or: newgrp docker)
```

---

## Single Sign-On (any OIDC provider)

The app uses generic OIDC via `express-openid-connect`, so any compliant
provider works (Okta, Entra ID, Keycloak, Google, etc.).

1. Register a **web application** with your IdP.
2. Set the **redirect URI** to `https://<your-hostname>/callback` and the
   **sign-out URI** to `https://<your-hostname>`.
3. Ensure the IdP includes a **groups** claim in the ID token.
4. Run the installer with `--sso=true` and provide the issuer URL, client id, and
   client secret (or answer the prompts).
5. Map your IdP group names to permissions in
   [`shared/auth-groups.config.json`](../../shared/auth-groups.config.json):

   ```json
   {
     "permissions": {
       "your-write-group": "write",
       "your-read-group":  "read"
     }
   }
   ```

When SSO is **off**, access is controlled by `OPEN_WRITE` in `shared/config.ts`:
`true` allows anyone to read and write; `false` makes the GUI read-only.

---

## TLS options

- **self-signed** (default): instant HTTPS; browsers show a warning you can
  bypass. Good for internal/lab use.
- **letsencrypt**: production certificates. Requires ports 80/443 publicly
  reachable. The bundled `certbot` service renews automatically; issue the first
  certificate after the stack is up.
- **none**: HTTP only — local testing only, never production.

---

## Branding

This guide deploys the neutral **default** edition. To create your own
organization's look (colors, product name, logo), see
[docs/BRANDING.md](../BRANDING.md). Switching editions is a one-liner:
`make brand-default` or `make brand-umich`.

---

## Automation (auto-provision)

The GUI can push configuration to your probes automatically whenever you change
it, instead of clicking *Configure* each time. It is **off by default** and
fully audited. See [docs/AUTOMATION.md](../AUTOMATION.md).

---

## Troubleshooting

```bash
make ps                 # are the containers running?
make logs               # what do the logs say?
curl -k https://<host>/api/health   # server + DB health
make doctor             # prerequisites and port conflicts
```

Common issues:

- **Port already in use** — another service holds 80/443/8000/8080/27017. Stop it
  or change the mapping in `docker-compose.yml`.
- **Browser certificate warning** — expected with `--tls=self-signed`; choose
  *Advanced → Proceed*.
- **SSO redirect loop** — confirm `BASE_URL`/`COOKIE_DOMAIN` in
  `services/server/.env` match the hostname your browser uses, and that the IdP
  redirect URI is exactly `https://<host>/callback`.
