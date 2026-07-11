#!/usr/bin/env bash
# Shared preflight checks for the pSSID GUI deploy scripts, sourced by
# install.sh and scripts/upgrade-controller.sh.
#
# NOTE: bootstrap.sh (which runs via `curl | bash` BEFORE the repo is cloned)
# and the Makefile `doctor` target cannot source this file, so they carry their
# own inline copies of the same logic. Keep all three in sync.

# check_disk: return non-zero when Docker's storage has less than ~6 GiB free
# (the image build pulls base images and runs npm installs, needing ~8-10 GB;
# a tight disk otherwise dies mid-build with a cryptic containerd "no space
# left on device"). Warns but passes between 6 and 12 GiB. Prints one status
# line. Probes Docker's storage root, falling back to /var/lib/docker then /
# when Docker is not installed yet.
check_disk() {
  local root free_kb free_gb
  root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
  [ -n "$root" ] && [ -d "$root" ] || root="/var/lib/docker"
  [ -d "$root" ] || root="/"
  free_kb="$(df -Pk "$root" 2>/dev/null | awk 'NR==2{print $4}')"
  [ -n "$free_kb" ] || return 0   # cannot determine free space; do not block
  free_gb=$(( free_kb / 1024 / 1024 ))
  if [ "$free_kb" -lt 6291456 ]; then          # < 6 GiB
    echo "error: only ${free_gb} GB free on ${root} (Docker storage). The image build needs about 8-10 GB. Free space with 'docker system prune -af' or grow the disk, then re-run." >&2
    return 1
  elif [ "$free_kb" -lt 12582912 ]; then       # < 12 GiB: tight, warn and continue
    echo "warning: only ${free_gb} GB free on ${root}; the image build is tight on space. If it fails with 'no space left on device', free space or grow the disk." >&2
  else
    echo "ok: ${free_gb} GB free on ${root}"
  fi
  return 0
}
