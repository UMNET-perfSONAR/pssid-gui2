#!/usr/bin/env bash
# Shared preflight checks for the pSSID GUI deploy scripts, sourced by
# install.sh and scripts/upgrade-controller.sh.
#
# NOTE: bootstrap.sh runs via `curl | bash` BEFORE the repo is cloned, so it
# carries an inline copy of the same logic. Keep it in sync with this file.

_existing_disk_path() {
  local path="$1"
  while [ ! -e "$path" ] && [ "$path" != "/" ]; do
    path="$(dirname "$path")"
  done
  printf '%s\n' "$path"
}

_disk_filesystem_type() {
  local path
  path="$(_existing_disk_path "$1")"
  if command -v findmnt >/dev/null 2>&1; then
    findmnt -n -o FSTYPE -T "$path" 2>/dev/null | head -n1
  else
    df -PT "$path" 2>/dev/null | awk 'NR==2{print $2}'
  fi
}

_is_network_filesystem() {
  case "$1" in
    nfs|nfs4|cifs|smb3|9p|ceph|glusterfs|fuse.sshfs) return 0 ;;
    *) return 1 ;;
  esac
}

# _check_disk_path: return non-zero when the filesystem holding $2 has less
# than PREFLIGHT_MIN_GIB (default 6) free. Warns but passes below twice that.
# $1 is a label used in the printed message (e.g. "Docker" or "containerd").
# Building from source needs ~8-10 GB; pulling prebuilt images (--pull) needs
# ~4 GB, so the installer lowers PREFLIGHT_MIN_GIB in pull mode.
_check_disk_path() {
  local label="$1" requested="$2" root fstype free_kb free_gb min_gib min_kb warn_kb need
  root="$(_existing_disk_path "$requested")"
  [ -d "$root" ] || return 0   # nothing to check; do not block
  fstype="$(_disk_filesystem_type "$root")"
  if _is_network_filesystem "$fstype"; then
    echo "error: ${requested} (${label} storage) is on a ${fstype} network filesystem. Docker and containerd storage must use a local filesystem such as ext4 or xfs." >&2
    return 1
  fi
  free_kb="$(df -Pk "$root" 2>/dev/null | awk 'NR==2{print $4}')"
  [ -n "$free_kb" ] || return 0   # cannot determine free space; do not block
  free_gb=$(( free_kb / 1024 / 1024 ))
  min_gib="${PREFLIGHT_MIN_GIB:-6}"
  min_kb=$(( min_gib * 1048576 ))
  warn_kb=$(( min_kb * 2 ))
  need="${PREFLIGHT_NEED_TEXT:-The image build needs about 8-10 GB}"
  if [ "$free_kb" -lt "$min_kb" ]; then
    echo "error: only ${free_gb} GB free on ${root} (${label} storage). ${need}. Free space with 'docker system prune -af' or grow the disk, then re-run." >&2
    return 1
  elif [ "$free_kb" -lt "$warn_kb" ]; then     # tight, warn and continue
    echo "warning: only ${free_gb} GB free on ${root} (${label} storage); tight on space. If it fails with 'no space left on device', free space or grow the disk." >&2
  else
    echo "ok: ${free_gb} GB free on ${root} (${label} storage)"
  fi
  return 0
}

# check_disk: verify both Docker's storage root AND containerd's storage root
# have enough free space. These are two SEPARATE directories: modern Docker
# Engine builds/extracts image layers through containerd's own snapshotter
# (default: /var/lib/containerd), which is independent of Docker's own
# "data-root" (default: /var/lib/docker, overridable in /etc/docker/daemon.json).
# Redirecting only one of the two (e.g. pointing daemon.json's data-root at a
# roomy volume while containerd still writes to a cramped /var/lib/containerd)
# looks fine in `docker info` but still dies mid-build with "no space left on
# device" while extracting layers. Falls back to /var/lib/docker and
# /var/lib/containerd respectively when Docker is not installed yet.
check_disk() {
  local docker_root containerd_root rc=0
  docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
  [ -n "$docker_root" ] && [ -d "$docker_root" ] || docker_root="/var/lib/docker"
  # `|| true`: the containerd CLI may be absent (fresh box, or Docker installs
  # that do not expose it); callers source this under `set -e -o pipefail`,
  # where an unguarded command-not-found would silently kill the installer.
  containerd_root="$(containerd config dump 2>/dev/null | sed -n 's/^root[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1 || true)"
  [ -n "$containerd_root" ] && [ -d "$containerd_root" ] || containerd_root="/var/lib/containerd"
  _check_disk_path "Docker" "$docker_root" || rc=1
  if [ "$containerd_root" != "$docker_root" ]; then
    _check_disk_path "containerd" "$containerd_root" || rc=1
  fi
  return "$rc"
}
