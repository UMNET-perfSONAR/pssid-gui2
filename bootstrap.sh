#!/usr/bin/env bash
#
# pSSID GUI one-command bootstrap.
#
# Takes a fresh Unix box (root shell) to a running pSSID GUI in one step:
# installs git and Ansible if missing, fetches the application source, and
# hands off to the Ansible playbook, which installs Docker, generates the
# secrets, certificates and nginx config, builds and starts the stack, loads
# the starter defaults, and schedules nightly database backups.
#
#   As one command on a fresh machine:
#
#     curl -fsSL https://raw.githubusercontent.com/UMNET-perfSONAR/pssid-gui2/main/bootstrap.sh | bash
#
#   Or from a clone (equivalent):
#
#     ./bootstrap.sh
#
#   Settings are environment variables (all optional; sane defaults apply):
#
#     PSSID_HOSTNAME=pssid.example.edu   Public hostname (default: this FQDN)
#     PSSID_EDITION=umich                Interface edition: default | umich
#     PSSID_TLS=letsencrypt              TLS: self-signed | letsencrypt | none
#     PSSID_LE_EMAIL=you@example.edu     Contact email for Let's Encrypt
#     PSSID_SSO=true                     Enable OIDC single sign-on
#     PSSID_OIDC_ISSUER=...              OIDC issuer URL          (SSO only)
#     PSSID_OIDC_CLIENT_ID=...           OIDC client id           (SSO only)
#     PSSID_OIDC_CLIENT_SECRET=...       OIDC client secret       (SSO only)
#     PSSID_GUI_DIR=/opt/pssid-gui       Where to clone when not run from a checkout
#     PSSID_GUI_REPO=<git url>           Alternate repository to clone
#     PSSID_GUI_VERSION=main             Branch or tag to deploy
#
#   Example:
#
#     PSSID_HOSTNAME=pssid.example.edu PSSID_EDITION=umich ./bootstrap.sh
#
#   Any extra arguments are passed through to ansible-playbook, so every
#   playbook variable can also be set directly:
#
#     ./bootstrap.sh -e pssid_gui_seed_defaults=false
#
# The step-by-step manual procedure this script automates is documented in
# README.md and docs/deployment.md; if anything here fails, that guide shows
# how to run each stage by hand.
set -euo pipefail

REPO="${PSSID_GUI_REPO:-https://github.com/UMNET-perfSONAR/pssid-gui2.git}"
VERSION="${PSSID_GUI_VERSION:-main}"
INSTALL_DIR="${PSSID_GUI_DIR:-/opt/pssid-gui}"

if [ -t 1 ]; then C_G='\033[32m'; C_R='\033[31m'; C_B='\033[1m'; C_N='\033[0m'; else C_G=''; C_R=''; C_B=''; C_N=''; fi
step() { printf "${C_B}==> %s${C_N}\n" "$1"; }
ok()   { printf "${C_G}  ok${C_N} %s\n" "$1"; }
die()  { printf "${C_R}error:${C_N} %s\n" "$1" >&2; exit 1; }

# ─── Root ─────────────────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  # Re-exec through sudo when the script exists as a file. When piped
  # (curl | bash) there is no file to re-run, so ask for a root shell instead.
  if [ -f "${BASH_SOURCE[0]:-}" ] && command -v sudo >/dev/null 2>&1; then
    step "Re-running with sudo (root is required to install packages and Docker)"
    # Preserve the PSSID_* settings across the sudo boundary.
    exec sudo --preserve-env=PSSID_HOSTNAME,PSSID_EDITION,PSSID_TLS,PSSID_LE_EMAIL,PSSID_SSO,PSSID_OIDC_ISSUER,PSSID_OIDC_CLIENT_ID,PSSID_OIDC_CLIENT_SECRET,PSSID_GUI_DIR,PSSID_GUI_REPO,PSSID_GUI_VERSION bash "${BASH_SOURCE[0]}" "$@"
  fi
  die "Run as root (for the piped form: sudo -i, then re-run the command)."
fi

# ─── Prerequisites: git + ansible ─────────────────────────────────────────────
install_pkgs() { # install_pkgs pkg...
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq && apt-get install -y -qq "$@"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q "$@"
  elif command -v yum >/dev/null 2>&1; then
    yum install -y -q "$@"
  else
    die "No supported package manager found (apt, dnf, yum). Install: $*"
  fi
}

step "Checking prerequisites"

# Disk space, FIRST: the most common fresh-VM failure. Checking here gives a
# clean one-line error before any packages are installed or Ansible runs
# (install.sh checks again later, but by then the failure surfaces wrapped in
# an Ansible fatal blob). Docker may not be installed yet, so fall back from
# its storage root to /var/lib (where /var/lib/docker will live).
DISK_TARGET="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
[ -n "$DISK_TARGET" ] && [ -d "$DISK_TARGET" ] || DISK_TARGET="/var/lib"
[ -d "$DISK_TARGET" ] || DISK_TARGET="/"
FREE_KB="$(df -Pk "$DISK_TARGET" 2>/dev/null | awk 'NR==2{print $4}')"
if [ -n "${FREE_KB:-}" ]; then
  FREE_GB=$(( FREE_KB / 1024 / 1024 ))
  if [ "$FREE_KB" -lt 6291456 ]; then
    die "Only ${FREE_GB} GB free on ${DISK_TARGET}. The deployment needs about 8-10 GB for Docker images. Grow the disk (or free space, e.g. 'docker system prune -af' if Docker is installed), then re-run this command."
  fi
  ok "disk space: ${FREE_GB} GB free on ${DISK_TARGET}"
fi

command -v git >/dev/null 2>&1 || { step "Installing git"; install_pkgs git; }
ok "git: $(git --version | cut -d' ' -f3)"

if ! command -v ansible-playbook >/dev/null 2>&1; then
  step "Installing Ansible"
  # Package name differs across distributions; EL ships ansible-core.
  install_pkgs ansible 2>/dev/null || install_pkgs ansible-core
fi
ok "ansible: $(ansible-playbook --version | head -n1)"

# ─── Locate or fetch the source ───────────────────────────────────────────────
# When this script runs from inside a checkout, deploy that checkout (so local
# changes and branches deploy as-is). Otherwise clone to $INSTALL_DIR.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd || pwd)"
if [ -f "$SCRIPT_DIR/install.sh" ] && [ -d "$SCRIPT_DIR/ansible" ]; then
  SRC="$SCRIPT_DIR"
  ok "Using this checkout: $SRC"
else
  step "Fetching pSSID GUI to $INSTALL_DIR"
  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" fetch --quiet origin "$VERSION"
    git -C "$INSTALL_DIR" checkout --quiet "$VERSION"
    git -C "$INSTALL_DIR" pull --ff-only --quiet origin "$VERSION" || true
    ok "Updated existing clone"
  else
    git clone --quiet --branch "$VERSION" "$REPO" "$INSTALL_DIR"
    ok "Cloned $REPO ($VERSION)"
  fi
  SRC="$INSTALL_DIR"
fi

# ─── Translate settings into playbook variables ───────────────────────────────
EXTRA=()
[ -n "${PSSID_HOSTNAME:-}" ]           && EXTRA+=(-e "pssid_gui_hostname=${PSSID_HOSTNAME}")
[ -n "${PSSID_EDITION:-}" ]            && EXTRA+=(-e "pssid_gui_edition=${PSSID_EDITION}")
[ -n "${PSSID_TLS:-}" ]                && EXTRA+=(-e "pssid_gui_tls=${PSSID_TLS}")
[ -n "${PSSID_LE_EMAIL:-}" ]           && EXTRA+=(-e "pssid_gui_letsencrypt_email=${PSSID_LE_EMAIL}")
[ -n "${PSSID_SSO:-}" ]                && EXTRA+=(-e "pssid_gui_sso=${PSSID_SSO}")
[ -n "${PSSID_OIDC_ISSUER:-}" ]        && EXTRA+=(-e "pssid_gui_oidc_issuer=${PSSID_OIDC_ISSUER}")
[ -n "${PSSID_OIDC_CLIENT_ID:-}" ]     && EXTRA+=(-e "pssid_gui_oidc_client_id=${PSSID_OIDC_CLIENT_ID}")
[ -n "${PSSID_OIDC_CLIENT_SECRET:-}" ] && EXTRA+=(-e "pssid_gui_oidc_client_secret=${PSSID_OIDC_CLIENT_SECRET}")

# ─── Deploy ───────────────────────────────────────────────────────────────────
step "Deploying (Ansible: docker + pssid_webgui roles)"
cd "$SRC/ansible"
# ${EXTRA[@]+...} keeps `set -u` happy when no settings were provided (older
# bash treats expanding an empty array as an unbound variable).
ansible-playbook site.yml ${EXTRA[@]+"${EXTRA[@]}"} "$@"
