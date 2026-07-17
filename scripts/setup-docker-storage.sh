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
# The Docker data-root goes at the path you give; containerd's root normally
# goes at a "containerd" directory beside it (so /data/docker pairs with
# /data/containerd). A dedicated filesystem mounted directly at
# /var/lib/docker is a special, common layout: Docker stays at that mount point
# and containerd is stored in /var/lib/docker/.containerd on the same volume.
#
# Idempotent and safe to re-run. Works before Docker is installed (the settings
# take effect on first start) or after (existing data is migrated). Persists
# across reboots via /etc/docker/daemon.json and a /etc/fstab bind mount.

set -euo pipefail

TARGET="${1:-${PSSID_DOCKER_DATA_ROOT:-}}"

err() { printf 'error: %s\n' "$1" >&2; exit 1; }

existing_path() {
  local path="$1"
  while [ ! -e "$path" ] && [ "$path" != "/" ]; do
    path="$(dirname "$path")"
  done
  printf '%s\n' "$path"
}

filesystem_type() {
  local path
  path="$(existing_path "$1")"
  if command -v findmnt >/dev/null 2>&1; then
    findmnt -n -o FSTYPE -T "$path" 2>/dev/null | head -n1
  else
    df -PT "$path" 2>/dev/null | awk 'NR==2{print $2}'
  fi
}

is_network_filesystem() {
  case "$1" in
    nfs|nfs4|cifs|smb3|9p|ceph|glusterfs|fuse.sshfs) return 0 ;;
    *) return 1 ;;
  esac
}

[ "$(id -u)" -eq 0 ] || err "run as root (use sudo)."
[ -n "$TARGET" ] || err "usage: setup-docker-storage.sh <absolute-dir-on-a-roomy-volume>"
case "$TARGET" in
  /*) ;;
  *)  err "the target must be an absolute path (got: $TARGET).";;
esac
case "$TARGET" in
  *[[:space:]]*) err "the target path must not contain whitespace (got: $TARGET).";;
esac

DOCKER_ROOT="${TARGET%/}"
[ -n "$DOCKER_ROOT" ] || DOCKER_ROOT="/"
if command -v realpath >/dev/null 2>&1; then
  DOCKER_ROOT="$(realpath -m "$DOCKER_ROOT")"
fi
[ "$DOCKER_ROOT" != "/" ] || err "refusing to use / as Docker's data-root."

case "$DOCKER_ROOT" in
  /var/lib/docker)
    # Some managed VMs provide a large LV mounted exactly here. A sibling
    # /var/lib/containerd would still be on the small /var filesystem, so put
    # containerd inside the dedicated Docker mount instead.
    CONTAINERD_ROOT="$DOCKER_ROOT/.containerd"
    ;;
  /var/lib/docker/*)
    err "do not choose a directory inside /var/lib/docker; use /var/lib/docker itself for a dedicated Docker mount."
    ;;
  *)
    CONTAINERD_ROOT="$(dirname "$DOCKER_ROOT")/containerd"
    ;;
esac

TARGET_FSTYPE="$(filesystem_type "$DOCKER_ROOT")"
if is_network_filesystem "$TARGET_FSTYPE"; then
  err "$DOCKER_ROOT is on a ${TARGET_FSTYPE} network filesystem. Docker and containerd storage must use a local filesystem (for example ext4 or xfs)."
fi

# Copy a directory tree, preferring rsync when present (handles xattrs/sparse
# files cleanly) and falling back to cp so a minimal box still works.
migrate() { # migrate SRC DST
  if command -v rsync >/dev/null 2>&1; then
    rsync -aXS --numeric-ids "$1/" "$2/"
  else
    cp -a "$1/." "$2/"
  fi
}

mkdir -p "$DOCKER_ROOT" "$CONTAINERD_ROOT" \
  || err "cannot create storage directories under $DOCKER_ROOT; choose a writable local filesystem."

# Make sure the chosen volume actually has room, and is not the same cramped
# filesystem we are trying to escape.
MIN_GIB="${PSSID_STORAGE_MIN_GIB:-6}"
WARN_GIB="${PSSID_STORAGE_WARN_GIB:-12}"
NEED_TEXT="${PSSID_STORAGE_NEED_TEXT:-the image build needs about 8-10 GB}"
FREE_KB="$(df -Pk "$DOCKER_ROOT" 2>/dev/null | awk 'NR==2{print $4}')"
if [ -n "${FREE_KB:-}" ] && [ "$FREE_KB" -lt $(( MIN_GIB * 1048576 )) ]; then
  FREE_GB=$(( FREE_KB / 1024 / 1024 ))
  err "the volume holding $DOCKER_ROOT has only ${FREE_GB} GB free; ${NEED_TEXT}."
elif [ -n "${FREE_KB:-}" ] && [ "$FREE_KB" -lt $(( WARN_GIB * 1048576 )) ]; then
  FREE_GB=$(( FREE_KB / 1024 / 1024 ))
  echo "warning: only ${FREE_GB} GB free on $DOCKER_ROOT; ${NEED_TEXT} and storage is tight." >&2
fi

# Idempotency short-circuit: if both stores already point at the target, do
# nothing and, crucially, do NOT stop Docker. This runs on every deploy and
# upgrade (whenever pssid_gui_docker_data_root is set), so a needless restart
# here would bounce a healthy running stack each time.
#
# Read daemon.json only when it exists: on a fresh VM it does not, and `sed` on a
# missing file exits 2, which under `set -o pipefail` would abort the whole
# script (empty output, rc 2) before it ever relocates anything.
cur_docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
if [ -z "$cur_docker_root" ] && [ -f /etc/docker/daemon.json ]; then
  cur_docker_root="$(sed -n 's/.*"data-root"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' /etc/docker/daemon.json 2>/dev/null | head -n1 || true)"
fi
if [ "$cur_docker_root" = "$DOCKER_ROOT" ] \
   && mountpoint -q /var/lib/containerd 2>/dev/null \
   && grep -Fqs "$CONTAINERD_ROOT /var/lib/containerd " /etc/fstab; then
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
if [ "$DOCKER_ROOT" != "/var/lib/docker" ] \
   && [ -d /var/lib/docker ] && [ -n "$(ls -A /var/lib/docker 2>/dev/null)" ] \
   && [ -z "$(ls -A "$DOCKER_ROOT" 2>/dev/null)" ]; then
  echo "    migrating existing /var/lib/docker -> $DOCKER_ROOT"
  migrate /var/lib/docker "$DOCKER_ROOT"
fi

# ── containerd root, via a bind mount ────────────────────────────────────────
# containerd's storage root is not settable through daemon.json. A bind mount
# relocates it without editing containerd's own config (robust across versions)
# and persists via /etc/fstab.
if mountpoint -q /var/lib/containerd; then
  if [ -n "$(ls -A /var/lib/containerd 2>/dev/null)" ] \
     && [ -z "$(ls -A "$CONTAINERD_ROOT" 2>/dev/null)" ]; then
    echo "    migrating mounted /var/lib/containerd -> $CONTAINERD_ROOT"
    migrate /var/lib/containerd "$CONTAINERD_ROOT"
  fi
  echo "    replacing the existing /var/lib/containerd mount"
  umount /var/lib/containerd \
    || err "could not unmount /var/lib/containerd after stopping Docker and containerd."
fi
mkdir -p /var/lib/containerd
if [ -n "$(ls -A /var/lib/containerd 2>/dev/null)" ] \
   && [ -z "$(ls -A "$CONTAINERD_ROOT" 2>/dev/null)" ]; then
  echo "    migrating existing /var/lib/containerd -> $CONTAINERD_ROOT"
  migrate /var/lib/containerd "$CONTAINERD_ROOT"
fi
mount --bind "$CONTAINERD_ROOT" /var/lib/containerd \
  || err "could not bind-mount $CONTAINERD_ROOT onto /var/lib/containerd."

# Replace an obsolete or incorrect entry (including the old self-bind
# /var/lib/containerd -> /var/lib/containerd layout) with the requested source.
sed -i '\|[[:space:]]/var/lib/containerd[[:space:]]|d' /etc/fstab
echo "$CONTAINERD_ROOT /var/lib/containerd none bind,x-systemd.requires-mounts-for=$CONTAINERD_ROOT 0 0" >> /etc/fstab

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
