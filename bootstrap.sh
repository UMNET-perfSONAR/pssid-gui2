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
#     PSSID_EDITION=default              Interface edition id (see
#                                        services/client/src/edition/)
#     PSSID_TLS=letsencrypt              TLS: self-signed | letsencrypt | none
#     PSSID_LE_EMAIL=you@example.edu     Contact email for Let's Encrypt
#     PSSID_SSO=true                     Enable OIDC single sign-on
#     PSSID_OIDC_ISSUER=...              OIDC issuer URL          (SSO only)
#     PSSID_OIDC_CLIENT_ID=...           OIDC client id           (SSO only)
#     PSSID_OIDC_CLIENT_SECRET=...       OIDC client secret       (SSO only)
#     PSSID_PULL=true                    Pull prebuilt images from the registry
#                                        instead of building on this machine
#                                        (~4 GB disk instead of ~8-10 GB; falls
#                                        back to building if the pull fails)
#     PSSID_GUI_DIR=/opt/pssid-gui       Where to clone when not run from a checkout
#     PSSID_GUI_REPO=<git url>           Alternate repository to clone
#     PSSID_GUI_VERSION=main             Branch or tag to deploy
#     PSSID_DOCKER_DATA_ROOT=/data/docker  Put Docker + containerd storage on a
#                                        roomier volume (for VMs whose /var/lib is
#                                        a small partition; see docs/deployment.md)
#
#   Example:
#
#     PSSID_HOSTNAME=pssid.example.edu ./bootstrap.sh
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

if [ -t 1 ]; then C_G='\033[32m'; C_R='\033[31m'; C_Y='\033[33m'; C_B='\033[1m'; C_N='\033[0m'; else C_G=''; C_R=''; C_Y=''; C_B=''; C_N=''; fi
step() { printf "${C_B}==> %s${C_N}\n" "$1"; }
ok()   { printf "${C_G}  ok${C_N} %s\n" "$1"; }
warn() { printf "${C_Y}  warn${C_N} %s\n" "$1" >&2; }
die()  { printf "${C_R}error:${C_N} %s\n" "$1" >&2; exit 1; }

# ─── Root ─────────────────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  # Re-exec through sudo when the script exists as a file. When piped
  # (curl | bash) there is no file to re-run, so ask for a root shell instead.
  if [ -f "${BASH_SOURCE[0]:-}" ] && command -v sudo >/dev/null 2>&1; then
    step "Re-running with sudo (root is required to install packages and Docker)"
    # Preserve the PSSID_* settings across the sudo boundary.
    exec sudo --preserve-env=PSSID_HOSTNAME,PSSID_EDITION,PSSID_TLS,PSSID_LE_EMAIL,PSSID_SSO,PSSID_OIDC_ISSUER,PSSID_OIDC_CLIENT_ID,PSSID_OIDC_CLIENT_SECRET,PSSID_GUI_DIR,PSSID_GUI_REPO,PSSID_GUI_VERSION,PSSID_DOCKER_DATA_ROOT,PSSID_PULL bash "${BASH_SOURCE[0]}" "$@"
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
# (install.sh checks again later via scripts/lib/preflight.sh, but by then the
# failure surfaces wrapped in an Ansible fatal blob). Kept inline because
# bootstrap runs before the repo is cloned; keep the tiers/threshold in sync
# with scripts/lib/preflight.sh.
#
# Checks BOTH Docker's storage root and containerd's storage root: modern
# Docker Engine extracts image layers through containerd's own snapshotter
# (default /var/lib/containerd), a SEPARATE directory from Docker's "data-root"
# -- redirecting only one still dies mid-build with "no space left on device".
#
# On these managed VMs the default /var/lib is a small partition while a large
# data volume sits elsewhere. Setting PSSID_DOCKER_DATA_ROOT points both stores
# at that volume (the Ansible role runs scripts/setup-docker-storage.sh); when
# it is not set, a dedicated local filesystem already mounted at
# /var/lib/docker is detected automatically. Otherwise, when space is tight,
# we suggest the roomiest writable LOCAL volume we can find; network filesystems
# such as NFS are deliberately excluded because Docker storage requires local
# filesystem semantics and the server may root-squash writes.

# Pull mode (PSSID_PULL=true) fetches prebuilt images instead of building, so
# it needs ~4 GB rather than the ~8-10 GB a from-source build does.
if [ "${PSSID_PULL:-false}" = "true" ]; then
  DISK_MIN_KB=4194304;  DISK_WARN_KB=8388608   # 4 / 8 GiB
  DISK_NEED_TEXT="pulling the prebuilt images (needs ~4 GB)"
else
  DISK_MIN_KB=6291456;  DISK_WARN_KB=12582912  # 6 / 12 GiB
  DISK_NEED_TEXT="the image build (needs ~8-10 GB)"
fi

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

is_dedicated_mount() {
  local path="$1" target=""
  [ -d "$path" ] || return 1
  if command -v mountpoint >/dev/null 2>&1; then
    mountpoint -q "$path" || return 1
  elif command -v findmnt >/dev/null 2>&1; then
    target="$(findmnt -n -o TARGET -T "$path" 2>/dev/null | head -n1)"
    [ "$target" = "$path" ] || return 1
  else
    return 1
  fi
  ! is_network_filesystem "$(filesystem_type "$path")"
}

path_free_kb() {
  local path
  path="$(existing_path "$1")"
  df -Pk "$path" 2>/dev/null | awk 'NR==2{print $4}'
}

# check_disk_target <label> <path>: 0 if ok/tight (prints status), 1 if too small.
check_disk_target() {
  local label="$1" requested="$2" path free_kb free_gb
  path="$(existing_path "$requested")"
  [ -d "$path" ] || return 0
  free_kb="$(path_free_kb "$path")"
  [ -n "$free_kb" ] || return 0
  free_gb=$(( free_kb / 1024 / 1024 ))
  if [ "$free_kb" -lt "$DISK_MIN_KB" ]; then
    return 1
  elif [ "$free_kb" -lt "$DISK_WARN_KB" ]; then # tight, warn and continue
    printf "  ${C_R}!${C_N} only %s GB free on %s (%s storage); %s is tight on space.\n" "$free_gb" "$path" "$label" "$DISK_NEED_TEXT" >&2
  else
    ok "disk space: ${free_gb} GB free on ${path} (${label} storage)"
  fi
  return 0
}

# suggest_volume: print "<free_gb> <mountpoint>" of the roomiest writable local
# filesystem. Exclude pseudo, network, boot, and read-only filesystems.
suggest_volume() {
  local candidate
  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    [ -w "${candidate#* }" ] || continue
    printf '%s\n' "$candidate"
    return 0
  done < <(df -PTk 2>/dev/null | awk '
    NR>1 &&
    $2 !~ /^(tmpfs|devtmpfs|overlay|squashfs|iso9660|efivarfs|autofs|nfs|nfs4|cifs|smb3|9p|ceph|glusterfs)$/ &&
    $2 !~ /^fuse\./ &&
    $7 !~ /^\/boot(\/|$)/ &&
    $5 ~ /^[0-9]+$/ {
      print int($5/1024/1024), $7
    }' | sort -rn)
}

# disk_die <path>: fail with a "not enough space" message, appending a concrete
# PSSID_DOCKER_DATA_ROOT suggestion when a roomier volume exists.
disk_die() {
  local path="$1" sugg sugg_gb sugg_mp sugg_root hint=""
  [ "${PSSID_PULL:-false}" = "true" ] || hint="
  Tip: PSSID_PULL=true pulls prebuilt images instead of building and needs only ~4 GB."
  sugg="$(suggest_volume)"
  sugg_gb="${sugg%% *}"; sugg_mp="${sugg#* }"
  if [ "$sugg_mp" = "/var/lib/docker" ]; then
    sugg_root="$sugg_mp"
  else
    sugg_root="${sugg_mp%/}/docker"
  fi
  if [ -n "$sugg" ] && [ "${sugg_gb:-0}" -ge 15 ] && [ "$sugg_mp" != "/" ] && [ "$sugg_mp" != "$path" ]; then
    die "Not enough disk space on ${path} for ${DISK_NEED_TEXT}.
  A larger volume was found at ${sugg_mp} (${sugg_gb} GB free). Point Docker there and re-run:

      PSSID_DOCKER_DATA_ROOT=${sugg_root}  <re-run your bootstrap command>

  (or configure it once by hand first:  sudo scripts/setup-docker-storage.sh ${sugg_root})${hint}
  See docs/deployment.md -> \"Deploying to a new VM\"."
  else
    die "Not enough disk space on ${path} for ${DISK_NEED_TEXT}. Grow the disk (or free space with 'docker system prune -af' if Docker is installed), then re-run.${hint}
  See docs/deployment.md -> \"Deploying to a new VM\"."
  fi
}

# A managed VM may already have a large local LV mounted exactly where Docker
# will use it. Detect that layout before Docker is installed and opt into the
# storage helper so containerd is also placed on that LV.
CONFIGURED_DOCKER_ROOT="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
if [ -z "$CONFIGURED_DOCKER_ROOT" ] && [ -r /etc/docker/daemon.json ]; then
  CONFIGURED_DOCKER_ROOT="$(sed -n 's/.*"data-root"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' /etc/docker/daemon.json | head -n1)"
fi
if [ -z "${PSSID_DOCKER_DATA_ROOT:-}" ] \
   && { [ -z "$CONFIGURED_DOCKER_ROOT" ] || [ "$CONFIGURED_DOCKER_ROOT" = "/var/lib/docker" ]; } \
   && is_dedicated_mount /var/lib/docker; then
  DEDICATED_FREE_KB="$(path_free_kb /var/lib/docker)"
  if [ -n "$DEDICATED_FREE_KB" ] && [ "$DEDICATED_FREE_KB" -ge "$DISK_MIN_KB" ]; then
    PSSID_DOCKER_DATA_ROOT="/var/lib/docker"
    export PSSID_DOCKER_DATA_ROOT
    ok "detected dedicated local Docker volume at /var/lib/docker; containerd will use it too"
  fi
fi

if [ -n "${PSSID_DOCKER_DATA_ROOT:-}" ]; then
  # Operator chose where Docker + containerd storage will live. Both stores go
  # on this one volume (the Ansible role runs setup-docker-storage.sh), so a
  # single check on it covers the build.
  TARGET_FSTYPE="$(filesystem_type "$PSSID_DOCKER_DATA_ROOT")"
  if is_network_filesystem "$TARGET_FSTYPE"; then
    die "PSSID_DOCKER_DATA_ROOT=$PSSID_DOCKER_DATA_ROOT is on a ${TARGET_FSTYPE} network filesystem. Docker and containerd storage must use a local filesystem (for example ext4 or xfs)."
  fi
  mkdir -p "$PSSID_DOCKER_DATA_ROOT" 2>/dev/null \
    || die "Cannot create PSSID_DOCKER_DATA_ROOT=$PSSID_DOCKER_DATA_ROOT. Choose a writable local filesystem."
  check_disk_target "Docker (PSSID_DOCKER_DATA_ROOT)" "$PSSID_DOCKER_DATA_ROOT" \
    || die "PSSID_DOCKER_DATA_ROOT=$PSSID_DOCKER_DATA_ROOT is on a volume with too little free space for ${DISK_NEED_TEXT}. Pick a bigger local volume."
else
  # Docker not installed yet in a fresh bootstrap; honor a pre-staged
  # daemon.json data-root, else fall back to where /var/lib/docker will live.
  DISK_TARGET="${CONFIGURED_DOCKER_ROOT:-/var/lib/docker}"
  check_disk_target "Docker" "$DISK_TARGET" || disk_die "$DISK_TARGET"

  # `|| true`: containerd is absent on a fresh box (command not found = 127);
  # under `set -e -o pipefail` an unguarded failure here would silently kill
  # the whole bootstrap right after the first disk-check line.
  CONTAINERD_TARGET="$(containerd config dump 2>/dev/null | sed -n 's/^root[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1 || true)"
  [ -z "$CONTAINERD_TARGET" ] && [ -r /etc/containerd/config.toml ] && \
    CONTAINERD_TARGET="$(sed -n 's/^root[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' /etc/containerd/config.toml | head -n1)"
  [ -n "$CONTAINERD_TARGET" ] || CONTAINERD_TARGET="/var/lib/containerd"
  if [ "$CONTAINERD_TARGET" != "$DISK_TARGET" ]; then
    check_disk_target "containerd" "$CONTAINERD_TARGET" || disk_die "$CONTAINERD_TARGET"
  fi
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
    # Report the real outcome. The deploy still proceeds on the existing
    # checkout when the fast-forward is refused (a local edit to a tracked file
    # is enough), but claiming "Updated" regardless is how a VM ends up running
    # a revision nobody believes it is on: the edition, schema and fixes all
    # silently lag main while the output says the update succeeded.
    if git -C "$INSTALL_DIR" pull --ff-only --quiet origin "$VERSION"; then
      ok "Updated existing clone"
    else
      warn "Could not fast-forward $INSTALL_DIR (local changes, or a diverged branch)."
      warn "DEPLOYING THE EXISTING CHECKOUT at $(git -C "$INSTALL_DIR" rev-parse --short HEAD), not $VERSION."
      warn "To take the latest instead, discard local edits and re-run this script:"
      warn "  git -C $INSTALL_DIR checkout -- . && git -C $INSTALL_DIR pull --ff-only"
    fi
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
[ -n "${PSSID_DOCKER_DATA_ROOT:-}" ]   && EXTRA+=(-e "pssid_gui_docker_data_root=${PSSID_DOCKER_DATA_ROOT}")
[ "${PSSID_PULL:-false}" = "true" ]    && EXTRA+=(-e "pssid_gui_pull=true")

# ─── Deploy ───────────────────────────────────────────────────────────────────
step "Deploying (Ansible: docker + pssid_webgui roles)"
cd "$SRC/ansible"
# -i is passed explicitly rather than relying on ansible.cfg: Ansible ignores
# the cfg when the directory is world-writable (and the caller's environment
# can override it), and a lost inventory makes the play match no hosts and
# exit 0 -- a silent no-op deploy. Bootstrap always targets this machine.
# ${EXTRA[@]+...} keeps `set -u` happy when no settings were provided (older
# bash treats expanding an empty array as an unbound variable).
ansible-playbook -i inventories/local.ini site.yml ${EXTRA[@]+"${EXTRA[@]}"} "$@"
