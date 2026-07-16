#!/usr/bin/env bash
# Shared preflight checks for the pSSID GUI deploy scripts, sourced by
# install.sh and scripts/upgrade-controller.sh.
#
# NOTE: bootstrap.sh (which runs via `curl | bash` BEFORE the repo is cloned)
# and the Makefile `doctor` target cannot source this file, so they carry their
# own inline copies of the same logic. Keep all three in sync.

# _check_disk_path: return non-zero when the filesystem holding $2 has less
# than ~6 GiB free. Warns but passes between 6 and 12 GiB. $1 is a label used
# in the printed message (e.g. "Docker" or "containerd").
_check_disk_path() {
  local label="$1" root="$2" free_kb free_gb
  [ -d "$root" ] || return 0   # nothing to check; do not block
  free_kb="$(df -Pk "$root" 2>/dev/null | awk 'NR==2{print $4}')"
  [ -n "$free_kb" ] || return 0   # cannot determine free space; do not block
  free_gb=$(( free_kb / 1024 / 1024 ))
  if [ "$free_kb" -lt 6291456 ]; then          # < 6 GiB
    echo "error: only ${free_gb} GB free on ${root} (${label} storage). The image build needs about 8-10 GB. Free space with 'docker system prune -af' or grow the disk, then re-run." >&2
    return 1
  elif [ "$free_kb" -lt 12582912 ]; then       # < 12 GiB: tight, warn and continue
    echo "warning: only ${free_gb} GB free on ${root} (${label} storage); the image build is tight on space. If it fails with 'no space left on device', free space or grow the disk." >&2
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
  [ -d "$docker_root" ] || docker_root="/"
  # `|| true`: the containerd CLI may be absent (fresh box, or Docker installs
  # that do not expose it); callers source this under `set -e -o pipefail`,
  # where an unguarded command-not-found would silently kill the installer.
  containerd_root="$(containerd config dump 2>/dev/null | sed -n 's/^root[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1 || true)"
  [ -n "$containerd_root" ] && [ -d "$containerd_root" ] || containerd_root="/var/lib/containerd"
  [ -d "$containerd_root" ] || containerd_root="/"
  _check_disk_path "Docker" "$docker_root" || rc=1
  if [ "$containerd_root" != "$docker_root" ]; then
    _check_disk_path "containerd" "$containerd_root" || rc=1
  fi
  return "$rc"
}
