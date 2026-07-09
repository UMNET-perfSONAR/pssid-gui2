#!/usr/bin/env bash
#
# Upgrade the pSSID GUI inside an existing pSSID controller install.
#
# For machines where the GUI containers run as part of the pSSID controller
# stack (the compose file the pSSID Ansible playbooks install, normally
# /usr/lib/pssid/docker-compose.yml) instead of this repository's own stack.
# For deployments running this repository's stack, use `make upgrade` instead.
#
# What it does, in order: back up the database, fast-forward this checkout,
# rebuild the GUI images from it, restart only the containers whose image
# changed, and wait for the health check.
#
#   Usage:  scripts/upgrade-controller.sh [CONTROLLER_DIR]
#
#   CONTROLLER_DIR defaults to $PSSID_CONTROLLER_DIR, then /usr/lib/pssid.
#   PSSID_HEALTH_URL overrides the URL polled at the end.
#
# One-time setup: the controller compose file must point the GUI services at
# the locally built images (pssid-gui2_client:latest, pssid-gui2_server:latest,
# pssid-gui2_mongo:latest). Put that in a docker-compose.override.yml next to
# the controller's docker-compose.yml, so a playbook re-run cannot silently
# revert it; see docs/deployment.md.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROLLER_DIR="${1:-${PSSID_CONTROLLER_DIR:-/usr/lib/pssid}}"

if [ ! -f "$CONTROLLER_DIR/docker-compose.yml" ]; then
  echo "error: no docker-compose.yml in $CONTROLLER_DIR (pass the controller directory as an argument)" >&2
  exit 1
fi

echo "==> Backing up the database"
bash "$REPO_DIR/scripts/backup.sh"

# The pull fast-forwards whatever branch this checkout is on. Releases land on
# main, so a checkout left on a feature branch would keep "upgrading" to stale
# code while reporting success. Say which branch we are on, loudly if unusual.
branch="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)"
echo "==> Updating the source in $REPO_DIR (branch: $branch)"
if [ "$branch" != "main" ]; then
  echo "    WARNING: this checkout is on '$branch', not 'main'. If your fixes" >&2
  echo "    were merged to main, this upgrade will NOT include them. Switch with:" >&2
  echo "      git -C $REPO_DIR checkout main" >&2
fi
git -C "$REPO_DIR" pull --ff-only

echo "==> Building the GUI images"
(cd "$REPO_DIR" && docker compose build)

echo "==> Restarting changed containers in $CONTROLLER_DIR"
(cd "$CONTROLLER_DIR" && docker compose up -d)

# Force the GUI containers to pick up the freshly built images. A plain `up -d`
# only recreates a container when compose notices the image changed, and the
# client serves its source through Vite, which does not reliably notice a
# rebuild without a fresh container. Recreate exactly the services that use our
# locally built pssid-gui2_*:latest images, so other controller services (the
# daemon, etc.) are left untouched.
gui_services="$(cd "$CONTROLLER_DIR" && docker compose config 2>/dev/null \
  | awk '/^services:/{s=1;next} s&&/^  [^[:space:]]/{svc=$1;sub(/:$/,"",svc)} s&&/image:[[:space:]]*pssid-gui2_/{print svc}')"
if [ -n "$gui_services" ]; then
  # shellcheck disable=SC2086
  echo "    recreating GUI services: $gui_services"
  (cd "$CONTROLLER_DIR" && docker compose up -d --force-recreate $gui_services)
else
  echo "    WARNING: could not confirm $CONTROLLER_DIR uses the locally built" >&2
  echo "    pssid-gui2_*:latest images. If the site did not change, the controller" >&2
  echo "    compose is still pointing at the published images: add a" >&2
  echo "    docker-compose.override.yml that maps its GUI services to those image" >&2
  echo "    names (see docs/deployment.md), then re-run this script." >&2
fi

# Restart the reverse proxy so it re-resolves the upstream container addresses.
# nginx caches the IPs it resolved for `server:8000` / `client:8080` at startup;
# a recreated client/server comes back with a NEW IP, and without this nginx keeps
# proxying to the dead old IP and returns 502 Bad Gateway to a healthy backend.
if (cd "$CONTROLLER_DIR" && docker compose restart nginx >/dev/null 2>&1); then
  echo "    restarted nginx to re-resolve the recreated containers"
else
  echo "    note: if you see 502s, restart your reverse proxy so it re-resolves the recreated containers" >&2
fi

echo "==> Waiting for the server health check"
# Validate the actual health JSON, not just any 200: the Vite client serves the
# SPA's index.html for every path (including /api/health), so a bare 200 check
# against the client port would falsely report healthy while the API is 502ing.
urls=("${PSSID_HEALTH_URL:-}" "https://localhost/api/health" "http://localhost/api/health")
healthy=""
for i in $(seq 1 30); do
  for url in "${urls[@]}"; do
    [ -n "$url" ] || continue
    if curl -fsk "$url" 2>/dev/null | grep -q '"status"'; then healthy="$url"; break 2; fi
  done
  sleep 2
done
if [ -n "$healthy" ]; then
  echo "    healthy ($healthy)"
else
  echo "error: health check did not pass; inspect with:" >&2
  echo "  cd $CONTROLLER_DIR && docker compose logs --tail=100 server" >&2
  exit 1
fi

echo "==> Removing dangling images left by the rebuild"
docker image prune -f >/dev/null

echo "Done. The pre-upgrade database archive is in $REPO_DIR/mongo-backups/."
