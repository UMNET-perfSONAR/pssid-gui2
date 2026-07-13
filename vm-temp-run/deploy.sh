#!/usr/bin/env bash
#
# pSSID GUI — one-command VM deploy wrapper (staging kit).
#
# Runs from a checkout of this repo, ON the target VM. It smooths over the one
# environment quirk the plain bootstrap cannot decide for you -- where Docker
# should store images on a VM whose /var/lib is a small partition -- and then
# hands off to the repository's standard bootstrap.sh.
#
# It does NOT touch the firewall, ports, or any network configuration: that is
# the VM administrator's responsibility (see README.md -> provisioning
# checklist). This wrapper only deals with the application and its storage.
#
# Usage (as root, from the repo root):
#
#   PSSID_HOSTNAME=pssid-new.miserver.it.umich.edu ./vm-temp-run/deploy.sh
#
# Every PSSID_* setting the bootstrap understands is passed straight through
# (PSSID_HOSTNAME, PSSID_EDITION, PSSID_TLS, PSSID_SSO, PSSID_OIDC_*, ...).
# Set PSSID_DOCKER_DATA_ROOT yourself to override the storage auto-detection.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"

if [ -t 1 ]; then B='\033[1m'; G='\033[32m'; Y='\033[33m'; N='\033[0m'; else B=''; G=''; Y=''; N=''; fi
say()  { printf "${B}==>${N} %s\n" "$1"; }
note() { printf "  %s\n" "$1"; }
warn() { printf "  ${Y}! %s${N}\n" "$1" >&2; }

[ -f "$REPO/bootstrap.sh" ] || { echo "error: run this from a checkout of the pssid-gui2 repo (bootstrap.sh not found)." >&2; exit 1; }

# ── Storage: choose where Docker + containerd keep image data ────────────────
# The build needs ~8-10 GB. On a VM whose /var/lib is a small partition, point
# Docker at a larger volume. If the operator already set PSSID_DOCKER_DATA_ROOT,
# respect it. If Docker is already installed with roomy storage, leave it.
say "Checking Docker storage space"
if [ -n "${PSSID_DOCKER_DATA_ROOT:-}" ]; then
  note "Using PSSID_DOCKER_DATA_ROOT=${PSSID_DOCKER_DATA_ROOT} (operator override)."
else
  storage_ok=""
  cur_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
  if [ -n "$cur_root" ]; then
    cur_free="$(df -Pk "$cur_root" 2>/dev/null | awk 'NR==2{print int($4/1024/1024)}')"
    if [ "${cur_free:-0}" -ge 12 ]; then
      note "Docker already stores images at ${cur_root} with ${cur_free} GB free; no change needed."
      storage_ok=1
    fi
  fi
  if [ -z "$storage_ok" ]; then
    # How much room is there where /var/lib/docker would live by default?
    varlib_free="$(df -Pk /var/lib 2>/dev/null | awk 'NR==2{print int($4/1024/1024)}')"
    # Roomiest real (non-pseudo) filesystem on the box.
    # `|| true`: if no suitable volume is found, read hits EOF and returns
    # non-zero; without this, `set -e` would abort instead of falling through
    # to the "no larger volume" branch below.
    big_gb=""; big_mp=""
    read -r big_gb big_mp < <(df -PTk 2>/dev/null | awk '
      NR>1 && $2 !~ /^(tmpfs|devtmpfs|overlay|squashfs|iso9660)$/ && $5 ~ /^[0-9]+$/ {
        print int($5/1024/1024), $7
      }' | sort -rn | head -n1) || true
    if [ "${varlib_free:-0}" -lt 12 ] && [ "${big_gb:-0}" -ge 15 ] \
       && [ "$big_mp" != "/" ] && [ "$big_mp" != "/var" ]; then
      export PSSID_DOCKER_DATA_ROOT="${big_mp%/}/docker"
      note "/var/lib is tight (${varlib_free:-?} GB free); using ${PSSID_DOCKER_DATA_ROOT} (${big_gb} GB free on ${big_mp})."
    elif [ "${varlib_free:-0}" -lt 12 ]; then
      warn "/var/lib has only ${varlib_free:-?} GB free and no larger volume was found."
      warn "Grow the disk or set PSSID_DOCKER_DATA_ROOT to a roomy volume, then re-run."
      warn "See README.md -> provisioning checklist (Disk)."
    else
      note "/var/lib has ${varlib_free} GB free; using the system default location."
    fi
  fi
fi

# ── Hand off to the standard bootstrap ───────────────────────────────────────
export PSSID_HOSTNAME="${PSSID_HOSTNAME:-$(hostname -f 2>/dev/null || hostname)}"

say "Deploying pSSID GUI"
note "hostname : ${PSSID_HOSTNAME}"
note "edition  : ${PSSID_EDITION:-default}"
note "tls      : ${PSSID_TLS:-self-signed}"
note "sso      : ${PSSID_SSO:-false}"
note "storage  : ${PSSID_DOCKER_DATA_ROOT:-system default (/var/lib/docker)}"
note "source   : ${REPO} (this checkout)"
echo

# bootstrap.sh handles root elevation (sudo) and preserves the PSSID_* settings.
exec bash "$REPO/bootstrap.sh" "$@"
