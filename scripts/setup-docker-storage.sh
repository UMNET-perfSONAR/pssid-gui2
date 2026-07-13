#!/usr/bin/env bash
#
# pSSID GUI storage relocation helper.
#
# Points BOTH Docker's data-root and containerd's storage root at a roomy
# volume, so the image build does not die with "no space left on device" on a
# VM whose default /var/lib sits on a small partition. This is a common managed
# VM layout: several small root logical volumes plus one large data volume
# (for example /usr/local/miserver on a University of Michigan MiServer host).
#
# Why two locations must move together: modern Docker Engine extracts image
# layers through containerd's OWN snapshotter, whose root (/var/lib/containerd)
# is a separate directory from Docker's data-root (/var/lib/docker, set in
# /etc/docker/daemon.json). Relocating only one still runs the other out of
# space part way through a build, and `docker info` looks healthy the whole
# time. See docs/deployment.md ("Deploying to a new VM").
#
# Usage:
#   sudo scripts/setup-docker-storage.sh /usr/local/miserver/docker
#   sudo PSSID_DOCKER_DATA_ROOT=/usr/local/miserver/docker scripts/setup-docker-storage.sh
#
# The Docker data-root goes at the path you give; containerd's root goes at a
# "containerd" directory beside it (so /usr/local/miserver/docker pairs with
# /usr/local/miserver/containerd).
#
# Idempotent and safe to re-run. Works before Docker is installed (the settings
# take effect on first start) or after (existing data is migrated). Persists
# across reboots via /etc/docker/daemon.json and a /etc/fstab bind mount.

set -euo pipefail

TARGET="${1:-${PSSID_DOCKER_DATA_ROOT:-}}"

err() { printf 'error: %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || err "run as root (use sudo)."
[ -n "$TARGET" ] || err "usage: setup-docker-storage.sh <absolute-dir-on-a-roomy-volume>"
case "$TARGET" in
  /*) ;;
  *)  err "the target must be an absolute path (got: $TARGET).";;
esac

DOCKER_ROOT="${TARGET%/}"
CONTAINERD_ROOT="$(dirname "$DOCKER_ROOT")/containerd"

# Copy a directory tree, preferring rsync when present (handles xattrs/sparse
# files cleanly) and falling back to cp so a minimal box still works.
migrate() { # migrate SRC DST
  if command -v rsync >/dev/null 2>&1; then
    rsync -aXS --numeric-ids "$1/" "$2/"
  else
    cp -a "$1/." "$2/"
  fi
}

mkdir -p "$DOCKER_ROOT" "$CONTAINERD_ROOT"

# Make sure the chosen volume actually has room, and is not the same cramped
# filesystem we are trying to escape.
FREE_KB="$(df -Pk "$DOCKER_ROOT" 2>/dev/null | awk 'NR==2{print $4}')"
if [ -n "${FREE_KB:-}" ] && [ "$FREE_KB" -lt 12582912 ]; then   # < 12 GiB
  FREE_GB=$(( FREE_KB / 1024 / 1024 ))
  err "the volume holding $DOCKER_ROOT has only ${FREE_GB} GB free; pick a location on a volume with at least ~12 GB (the build needs ~8-10 GB)."
fi

# Idempotency short-circuit: if both stores already point at the target, do
# nothing and, crucially, do NOT stop Docker. This runs on every deploy and
# upgrade (whenever pssid_gui_docker_data_root is set), so a needless restart
# here would bounce a healthy running stack each time.
#
# Read daemon.json only when it exists: on a fresh VM it does not, and `sed` on a
# missing file exits 2, which under `set -o pipefail` would abort the whole
# script (empty output, rc 2) before it ever relocates anything.
cur_docker_root=""
if [ -f /etc/docker/daemon.json ]; then
  cur_docker_root="$(sed -n 's/.*"data-root"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' /etc/docker/daemon.json 2>/dev/null | head -n1 || true)"
fi
if [ "$cur_docker_root" = "$DOCKER_ROOT" ] && mountpoint -q /var/lib/containerd 2>/dev/null; then
  echo "==> Docker + containerd storage already on $DOCKER_ROOT; nothing to change."
  exit 0
fi

echo "==> Relocating Docker + containerd storage"
echo "    Docker data-root : $DOCKER_ROOT"
echo "    containerd root  : $CONTAINERD_ROOT  (bind-mounted onto /var/lib/containerd)"

# Stop everything that writes to the current locations. Guarded so this also
# works before Docker is installed (the units simply do not exist yet).
systemctl stop docker.socket 2>/dev/null || true
systemctl stop docker 2>/dev/null || true
systemctl stop containerd 2>/dev/null || true

# ── Docker data-root, via /etc/docker/daemon.json ────────────────────────────
mkdir -p /etc/docker
if [ -s /etc/docker/daemon.json ]; then
  # Merge into the existing config, preserving any other keys. python3 is
  # present on every Ubuntu server (Ansible requires it) and edits JSON safely.
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$DOCKER_ROOT" <<'PY'
import json, sys
path = "/etc/docker/daemon.json"
with open(path) as f:
    data = json.load(f)
data["data-root"] = sys.argv[1]
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
  elif grep -q "\"data-root\"[[:space:]]*:[[:space:]]*\"$DOCKER_ROOT\"" /etc/docker/daemon.json; then
    : # already points at the target; nothing to change
  else
    err "/etc/docker/daemon.json exists and python3 is unavailable to edit it safely; add \"data-root\": \"$DOCKER_ROOT\" to it by hand, then re-run."
  fi
else
  printf '{\n  "data-root": "%s"\n}\n' "$DOCKER_ROOT" > /etc/docker/daemon.json
fi

# Migrate any existing Docker data (a freshly installed engine has almost none).
if [ -d /var/lib/docker ] && [ -n "$(ls -A /var/lib/docker 2>/dev/null)" ] \
   && [ -z "$(ls -A "$DOCKER_ROOT" 2>/dev/null)" ]; then
  echo "    migrating existing /var/lib/docker -> $DOCKER_ROOT"
  migrate /var/lib/docker "$DOCKER_ROOT"
fi

# ── containerd root, via a bind mount ────────────────────────────────────────
# containerd's storage root is not settable through daemon.json. A bind mount
# relocates it without editing containerd's own config (robust across versions)
# and persists via /etc/fstab.
if mountpoint -q /var/lib/containerd; then
  echo "    /var/lib/containerd is already a mount point; leaving it as-is"
else
  mkdir -p /var/lib/containerd
  if [ -n "$(ls -A /var/lib/containerd 2>/dev/null)" ] \
     && [ -z "$(ls -A "$CONTAINERD_ROOT" 2>/dev/null)" ]; then
    echo "    migrating existing /var/lib/containerd -> $CONTAINERD_ROOT"
    migrate /var/lib/containerd "$CONTAINERD_ROOT"
  fi
  mount --bind "$CONTAINERD_ROOT" /var/lib/containerd
fi
if ! grep -qsE "[[:space:]]/var/lib/containerd[[:space:]]" /etc/fstab; then
  echo "$CONTAINERD_ROOT /var/lib/containerd none bind 0 0" >> /etc/fstab
fi

# ── Restart (only when Docker is actually installed) ─────────────────────────
if command -v dockerd >/dev/null 2>&1 || command -v docker >/dev/null 2>&1; then
  systemctl start containerd 2>/dev/null || true
  systemctl start docker 2>/dev/null || true
  if command -v docker >/dev/null 2>&1; then
    actual="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
    [ -n "$actual" ] && echo "    Docker is now using: $actual"
  fi
else
  echo "    Docker is not installed yet; these settings take effect on first start."
fi

echo "==> Done."
df -h "$DOCKER_ROOT" /var/lib/containerd 2>/dev/null || true
