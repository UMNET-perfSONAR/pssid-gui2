# pSSID GUI — VM deploy kit (staging)

A small, temporary helper for standing up pSSID GUI on a fresh managed VM
(for example a University of Michigan MiServer host) in **one command**, plus
the **infrastructure requirements to hand to the VM administrator** so the VMs
get provisioned correctly.

This folder is **operator/ops tooling**, kept separate from the shipped product
on purpose:

- The **product** (the rest of the repo) never changes firewalls, opens ports,
  or touches host networking — that stays the operator's / ITS's job, which
  keeps it clean for a commercial security review.
- This **kit** wraps the product's standard deploy with VM-environment
  convenience (mainly: where to put Docker's image storage) and documents the
  environment requirements that live *outside* the app.

When the VMs are provisioned as described below, you can deploy with the plain
one-command bootstrap and this folder is no longer needed.

---

## TL;DR — deploy on the VM

On the VM, as **root**, from a checkout of this repo:

```bash
git clone https://github.com/UMNET-perfSONAR/pssid-gui2.git
cd pssid-gui2
PSSID_HOSTNAME=pssid-new.miserver.it.umich.edu ./vm-temp-run/deploy.sh
```

`deploy.sh` auto-detects a roomy volume for Docker's image storage (needed on
VMs whose `/var/lib` is a small partition), then runs the repository's standard
`bootstrap.sh`, which does everything else: installs Docker and Ansible, builds
the images, brings up the HTTPS stack behind nginx, seeds the starter defaults,
and schedules nightly database backups.

Running from a checkout deploys **that checkout's code**, so you get the current
version even before changes are merged to `main`.

---

## What `deploy.sh` does

1. **Storage.** If `/var/lib` is small and a larger volume exists (e.g.
   `/usr/local/miserver`), it sets `PSSID_DOCKER_DATA_ROOT` so both Docker's
   data-root and containerd's storage root are relocated there before the
   build. This is the single most common reason a fresh-VM build fails
   (`no space left on device` part way through). If Docker is already installed
   with roomy storage, it leaves it alone.
2. **Hand-off.** It exports your `PSSID_*` settings and runs `bootstrap.sh`,
   which elevates with `sudo` as needed and performs the full deployment.

It does **not** modify the firewall, open ports, or change DNS. Those are
provisioning items for the VM administrator (below).

---

## Settings (environment variables)

All optional except a hostname (which defaults to the machine's FQDN). Pass them
inline before `./vm-temp-run/deploy.sh`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PSSID_HOSTNAME` | machine FQDN | Public hostname users will visit |
| `PSSID_EDITION` | `default` | Interface edition: `default` or `umich` |
| `PSSID_TLS` | `self-signed` | `self-signed`, `letsencrypt`, or `none` |
| `PSSID_LE_EMAIL` | — | Contact email (only for `letsencrypt`) |
| `PSSID_SSO` | `false` | Enable Okta / OIDC single sign-on |
| `PSSID_OIDC_ISSUER` / `PSSID_OIDC_CLIENT_ID` / `PSSID_OIDC_CLIENT_SECRET` | — | OIDC settings (SSO only) |
| `PSSID_DOCKER_DATA_ROOT` | auto-detected | Directory on a roomy volume for Docker + containerd storage |

Example (UMich edition, a specific storage volume):

```bash
PSSID_HOSTNAME=pssid-new.miserver.it.umich.edu \
PSSID_EDITION=umich \
PSSID_DOCKER_DATA_ROOT=/usr/local/miserver/docker \
./vm-temp-run/deploy.sh
```

---

## For the VM administrator — provisioning checklist

The application deploys and runs **entirely on the VM**. The items below are
things about the VM's *environment* that the app cannot and should not set for
itself. Share this section with whoever provisions the VMs (Ed / ITS).

### 1. Disk

- The image build needs about **8–10 GB free** where Docker stores images, plus
  headroom to grow (aim for **~15 GB+**).
- **MiServer layout note:** on these VMs `/var/lib` is a small logical volume
  (a few GB) while the real space is a separate large volume (e.g.
  `/usr/local/miserver`, tens of GB). Either is fine:
  - **Preferred:** ensure a large volume is mounted and has ~15 GB+ free.
    `deploy.sh` will point Docker + containerd at it automatically.
  - **Or:** provision `/var/lib/docker` itself with ~15 GB+.
- Why both Docker *and* containerd matter: modern Docker extracts image layers
  through containerd's own store (`/var/lib/containerd`), which is a **separate**
  directory from Docker's data-root (`/var/lib/docker`). The kit relocates both;
  a partial move still runs out of space mid-build.

### 2. Network / firewall — the app does NOT change these

- **Inbound `TCP 443` (and `80`)** must be reachable from the client networks
  that will use the site, **including the VPN range `35.7.0.0/18`**.
- Known gap seen on `pssid-gui-qa5`: `ufw` trusts `35.7.0.0/18` for **SSH (22)**
  but **not for 443**, so the site is healthy on the box yet unreachable from a
  browser on the VPN. **Please add `80` and `443` to the same source ranges SSH
  already allows** (campus blocks + `35.7.0.0/18`), ideally in the **managed
  firewall template** so it survives config runs — matching what `pssid-dev`
  already has.
- Please also **confirm the perimeter/border firewall** allows inbound `443` to
  the host (as it does for `pssid-dev`).

### 3. DNS

- A public **A record** for the hostname pointing at the VM's IP.
  (`pssid-gui-qa5.miserver.it.umich.edu` → `141.211.4.131` is already in place.)

### 4. TLS

- Default is a **self-signed** certificate (browsers show a warning; choose
  Advanced → Proceed). Fine for QA.
- For a **trusted** certificate: either provide an ITS-issued cert/key, or allow
  inbound `80` from the public internet so Let's Encrypt's HTTP-01 challenge can
  validate (`PSSID_TLS=letsencrypt PSSID_LE_EMAIL=...`).

### 5. SSO (optional)

- For Okta: an OIDC app with **issuer URL, client id, client secret**, and the
  **redirect URI `https://<host>/callback`** registered.

### 6. Outbound internet

- The VM needs outbound access to Docker Hub (base images) and the OS package
  mirrors (apt) during the build. No inbound beyond the web ports above.

---

## Verify the deployment

On the VM:

```bash
curl -sk https://localhost/api/health          # expect {"status":"ok","mongo":"connected",...}
docker compose -f docker-compose.yml ps        # all services Up / healthy
```

Then browse `https://<hostname>` **from an allowed network** (campus or VPN). If
the health check passes on the box but the browser cannot reach it, that is the
firewall item in the provisioning checklist — not an application problem.

---

## Troubleshooting

- **`no space left on device` during the build** → storage. Confirm a roomy
  volume exists and re-run, or configure it explicitly:
  `sudo ../scripts/setup-docker-storage.sh /usr/local/miserver/docker`, then
  re-run `deploy.sh`.
- **Healthy on the box but "This site can't be reached" in the browser** →
  firewall/reachability (Ed's provisioning item). Diagnose which source IP is
  being dropped and on which port:
  ```bash
  grep 'UFW BLOCK' /var/log/ufw.log | tail     # SRC= is the dropped client IP; DPT= the port
  ```
  Compare that `SRC=` against the ranges `443` is allowed from in `ufw status`.
- **Certificate warning in the browser** → expected with `self-signed`; choose
  Advanced → Proceed, or deploy a trusted cert (TLS section above).
- **Re-running over an already-deployed stack** rotates the generated secrets in
  `.env` (including the MongoDB credentials), which will not match an existing
  database volume. For a clean re-deploy, tear the stack down first
  (`make down` in the repo, and remove the data volume only if you intend to
  wipe data) rather than re-running on top of live data.

---

## Relationship to the main repo

Everything here just wraps the repo's official `bootstrap.sh` / `install.sh`
flow with VM-environment convenience plus the provisioning notes above. Nothing
in this folder is required by the product itself. Once the VMs are provisioned
per the checklist, the plain one-command bootstrap works on its own and this
`vm-temp-run/` folder can be removed.
