so #!/usr/bin/env bash
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

echo "==> Updating the source in $REPO_DIR"
git -C "$REPO_DIR" pull --ff-only

echo "==> Building the GUI images"
(cd "$REPO_DIR" && docker compose build)

echo "==> Restarting changed containers in $CONTROLLER_DIR"
(cd "$CONTROLLER_DIR" && docker compose up -d)

echo "==> Waiting for the server health check"
urls=("${PSSID_HEALTH_URL:-}" "https://localhost/api/health" "http://localhost/api/health" "http://localhost:8080/api/health")
healthy=""
for i in $(seq 1 30); do
  for url in "${urls[@]}"; do
    [ -n "$url" ] || continue
    if curl -fsk "$url" >/dev/null 2>&1; then healthy="$url"; break 2; fi
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
