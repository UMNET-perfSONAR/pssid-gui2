#!/usr/bin/env bash
#
# pSSID GUI installer
#
# Collapses the manual deployment steps into a single command. It generates
# secrets and certificates, renders the nginx config for your hostname, selects
# the edition, and brings the Docker stack up, without weakening the
# existing security model (HTTPS, optional SSO, isolated Docker network).
#
# Usage:
#   ./install.sh                         # interactive
#   ./install.sh --hostname=pssid.example.edu --sso=true \
#       --issuer=https://idp.example.com --client-id=... --client-secret=... -y
#
# Run ./install.sh --help for all options.

set -euo pipefail

# ─── Pretty output ───────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_RESET='\033[0m'; C_BOLD='\033[1m'; C_DIM='\033[2m'
  C_BLUE='\033[34m'; C_GREEN='\033[32m'; C_YELLOW='\033[33m'; C_RED='\033[31m'; C_CYAN='\033[36m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_CYAN=''
fi
step()  { printf "\n${C_BOLD}${C_BLUE}▶ %s${C_RESET}\n" "$1"; }
info()  { printf "  ${C_DIM}%s${C_RESET}\n" "$1"; }
ok()    { printf "  ${C_GREEN}✓ %s${C_RESET}\n" "$1"; }
warn()  { printf "  ${C_YELLOW}! %s${C_RESET}\n" "$1"; }
die()   { printf "\n${C_RED}✗ %s${C_RESET}\n" "$1" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Defaults ────────────────────────────────────────────────────────────────
EDITION="default"
HOSTNAME_INPUT=""
SSO=""
TLS="self-signed"
ISSUER=""
CLIENT_ID=""
CLIENT_SECRET=""
# Write access when SSO is off. Empty here means "decide below": reuse whatever
# the existing .env has, so an operator's choice survives an upgrade, and fall
# back to the shipped read-only default on a first install.
OPEN_WRITE=""
LE_EMAIL=""
NON_INTERACTIVE="false"
DO_BUILD="true"
# --pull: fetch prebuilt images from a registry instead of building on this
# machine. Cuts the disk requirement from ~8-10 GB (build) to ~4 GB (pull) --
# the difference between failing and deploying on VMs with a small /var.
DO_PULL="false"
PULL_PREFIX_DEFAULT="ghcr.io/umnet-perfsonar/pssid-gui2"

usage() {
  cat <<EOF
${C_BOLD}pSSID GUI installer${C_RESET}

Options:
  --edition=NAME         Interface edition id                      (default: default)
  --hostname=HOST        Public hostname for this deployment
  --sso=true|false       Enable Single Sign-On (OIDC)
  --issuer=URL           OIDC issuer base URL          (SSO only)
  --client-id=ID         OIDC client id                (SSO only)
  --client-secret=SECRET OIDC client secret            (SSO only)
  --open-write=true|false  Allow writes when SSO is off. Preserved across
                         upgrades; defaults to false (read-only) on a new install
  --tls=MODE             self-signed | letsencrypt | none          (default: self-signed)
  --email=EMAIL          Contact email for Let's Encrypt (tls=letsencrypt)
  --no-build             Use existing images; skip docker build
  --pull                 Pull prebuilt images from the registry instead of
                         building (~4 GB disk instead of ~8-10 GB; falls back
                         to building if the pull fails)
  -y, --non-interactive  Never prompt; require flags/env for needed values
  -h, --help             Show this help

Environment variables (non-interactive): same names uppercased, e.g.
  EDITION, HOSTNAME, SSO, ISSUER, CLIENT_ID, CLIENT_SECRET, TLS, LE_EMAIL
EOF
}

# ─── Parse args ──────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --edition=*)       EDITION="${arg#*=}" ;;
    --hostname=*)      HOSTNAME_INPUT="${arg#*=}" ;;
    --sso=*)           SSO="${arg#*=}" ;;
    --issuer=*)        ISSUER="${arg#*=}" ;;
    --client-id=*)     CLIENT_ID="${arg#*=}" ;;
    --client-secret=*) CLIENT_SECRET="${arg#*=}" ;;
    --open-write=*)    OPEN_WRITE="${arg#*=}" ;;
    --tls=*)           TLS="${arg#*=}" ;;
    --email=*)         LE_EMAIL="${arg#*=}" ;;
    --no-build)        DO_BUILD="false" ;;
    --pull)            DO_PULL="true" ;;
    -y|--non-interactive) NON_INTERACTIVE="true" ;;
    -h|--help)         usage; exit 0 ;;
    *) die "Unknown option: $arg (try --help)" ;;
  esac
done

# Allow env-var fallbacks (handy for CI / non-interactive installs).
EDITION="${EDITION:-${PSSID_EDITION:-default}}"
HOSTNAME_INPUT="${HOSTNAME_INPUT:-${HOSTNAME_OVERRIDE:-}}"
ISSUER="${ISSUER:-${PSSID_ISSUER:-}}"
OPEN_WRITE="${OPEN_WRITE:-${PSSID_OPEN_WRITE:-}}"

# The OIDC client id and secret, by environment as well as by flag -- and the
# environment is the PREFERRED route for the secret.
#
# A value passed as --client-secret=... sits in this process's argv, which on
# Linux is world-readable through /proc/<pid>/cmdline: any local user can read it
# with a bare `ps aux` for as long as the install runs. The environment is not:
# /proc/<pid>/environ is readable only by the process owner. The Ansible role
# therefore hands the secret over this way, and --client-secret is kept for
# interactive use (where prompt_secret already avoids shell history).
CLIENT_ID="${CLIENT_ID:-${PSSID_OIDC_CLIENT_ID:-}}"
CLIENT_SECRET="${CLIENT_SECRET:-${PSSID_OIDC_CLIENT_SECRET:-}}"

prompt() { # prompt VAR "Question" "default"
  local __var="$1" __q="$2" __def="${3:-}" __ans
  if [ "$NON_INTERACTIVE" = "true" ]; then
    printf -v "$__var" '%s' "$__def"; return
  fi
  if [ -n "$__def" ]; then
    read -r -p "  $__q [$__def]: " __ans || true
    __ans="${__ans:-$__def}"
  else
    read -r -p "  $__q: " __ans || true
  fi
  printf -v "$__var" '%s' "$__ans"
}

prompt_secret() { # prompt_secret VAR "Question". Masked input, never echoed.
  local __var="$1" __q="$2" __ans
  if [ "$NON_INTERACTIVE" = "true" ]; then
    printf -v "$__var" '%s' ""; return
  fi
  read -r -s -p "  $__q: " __ans || true
  echo
  printf -v "$__var" '%s' "$__ans"
}

banner() {
  printf "${C_CYAN}${C_BOLD}"
  cat <<'EOF'
   ____  ____ ____ ___ ____     ____ _   _ ___
  |  _ \/ ___/ ___|_ _|  _ \   / ___| | | |_ _|
  | |_) \___ \___ \| || | | | | |  _| | | || |
  |  __/ ___) |__) | || |_| | | |_| | |_| || |
  |_|   |____/____/___|____/   \____|\___/|___|
EOF
  printf "${C_RESET}${C_DIM}  Installer${C_RESET}\n"
}

# ─── 1. Preflight ────────────────────────────────────────────────────────────
banner
step "Checking prerequisites"

if command -v docker >/dev/null 2>&1; then
  ok "docker found ($(docker --version | cut -d',' -f1))"
else
  die "Docker is not installed. See the Prerequisites section in docs/deployment.md."
fi

# Compose v2 only. The deprecated standalone docker-compose v1 is rejected rather
# than used as a fallback: it does not interpolate this project's image tags and
# fails mid-build with `invalid tag "..._client:${PSSID_IMAGE_TAG:-latest}":
# invalid reference format`. Failing here names the real problem instead of
# surfacing it several minutes later as a build error.
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  die "Only the standalone docker-compose (v1) was found, which this project does not support.
  v1 reached end of life in 2023 and cannot build this compose file.
  Install the Compose v2 plugin, then re-run:
      apt-get update && apt-get install -y docker-compose-plugin
  Verify with:  docker compose version"
else
  die "Docker Compose is not available. Install the docker-compose-plugin package."
fi
ok "compose command: $COMPOSE"

command -v openssl >/dev/null 2>&1 || die "openssl is required (for cert/secret generation)."
ok "openssl found"

# Disk space: building the images pulls several base images (node, mongo, nginx,
# certbot) and runs npm installs, needing several GB free on Docker's storage.
# Without this check a small or full disk fails deep in the build with a cryptic
# "no space left on device" (containerd) error, so check up front. The check
# itself lives in scripts/lib/preflight.sh, shared with the controller upgrade.
# shellcheck source=scripts/lib/preflight.sh
. "$SCRIPT_DIR/scripts/lib/preflight.sh"
if [ "$DO_PULL" = "true" ]; then
  # Pulling prebuilt images needs far less space than building from source.
  PREFLIGHT_MIN_GIB=4 PREFLIGHT_NEED_TEXT="Pulling the prebuilt images needs about 4 GB" \
    check_disk || die "Not enough disk space to pull the images (see the message above)."
else
  check_disk || die "Not enough disk space for the image build (see the message above)."
fi

# Warn (do not fail) on busy ports. Only nginx publishes ports to the host
# (80/443); everything else stays on the internal Docker network.
check_port() {
  local p="$1"
  if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":$p "; then
    warn "Port $p already in use; the stack may fail to bind it."
  fi
}
for p in 80 443; do check_port "$p"; done

# ─── 2. Gather configuration ─────────────────────────────────────────────────
step "Configuration"

# Editions are pluggable (see services/client/src/edition/editions.ts), so any
# id the client bundle defines is accepted; reject only shell-unsafe values. An
# id with no matching entry falls back to the default edition at runtime.
case "$EDITION" in
  ''|*[!a-zA-Z0-9_-]*) die "Invalid edition: $EDITION" ;;
esac
ok "Edition: $EDITION"

[ -n "$HOSTNAME_INPUT" ] || prompt HOSTNAME_INPUT "Public hostname (e.g. pssid.example.edu)" "localhost"
ok "Hostname: $HOSTNAME_INPUT"

# ─── Carry the auth posture across re-runs and upgrades ──────────────────────
#
# This script truncates BOTH .env and services/server/.env further down, so any
# setting not resolved here is destroyed on every run. That is exactly how a
# hand-enabled SSO used to disappear on the next `make upgrade` -- silently
# returning an authenticated site to anonymous, which is the same class of fault
# OPEN_WRITE already carries a guard against below, and a worse one. Precedence,
# deliberately identical to that guard:
#   1. --sso / --issuer / --client-id / --client-secret: explicit, this run
#   2. the values already on this host, so an operator's setting survives upgrade
#   3. the shipped default (SSO off)
#
# The OIDC values are preserved whatever the posture, and written back below the
# same way. That is what makes "configure the provider now, switch SSO on later"
# work: the credentials sit inert (the server only reads them when SSO is on)
# instead of being erased by every intervening deployment.
EXISTING_SERVER_ENV="services/server/.env"
if [ -z "$SSO" ] && [ -f .env ] && grep -q '^ENABLE_SSO=' .env; then
  SSO="$(sed -n 's/^ENABLE_SSO=//p' .env | tail -1)"
  info "Preserving ENABLE_SSO=${SSO} from the existing .env"
fi
if [ -r "$EXISTING_SERVER_ENV" ]; then
  [ -n "$ISSUER" ]        || ISSUER="$(sed -n 's/^ISSUER_BASE_URL=//p' "$EXISTING_SERVER_ENV" | tail -1)"
  [ -n "$CLIENT_ID" ]     || CLIENT_ID="$(sed -n 's/^CLIENT_ID=//p' "$EXISTING_SERVER_ENV" | tail -1)"
  [ -n "$CLIENT_SECRET" ] || CLIENT_SECRET="$(sed -n 's/^CLIENT_SECRET=//p' "$EXISTING_SERVER_ENV" | tail -1)"
  # A plain `[ ... ] && info ...` would evaluate to false when there is nothing
  # to preserve, and under `set -e` that ends the install right here.
  if [ -n "$ISSUER" ]; then
    info "Preserving the OIDC settings already in $EXISTING_SERVER_ENV"
  fi
fi

if [ -z "$SSO" ]; then
  prompt SSO "Enable Single Sign-On? (true/false)" "false"
fi
SSO="$(printf '%s' "$SSO" | tr '[:upper:]' '[:lower:]')"
[ "$SSO" = "true" ] || [ "$SSO" = "false" ] || die "Invalid --sso value: $SSO"
ok "SSO: $SSO"

if [ "$SSO" = "true" ]; then
  [ -n "$ISSUER" ]        || prompt ISSUER "OIDC issuer base URL" ""
  [ -n "$CLIENT_ID" ]     || prompt CLIENT_ID "OIDC client id" ""
  [ -n "$CLIENT_SECRET" ] || prompt_secret CLIENT_SECRET "OIDC client secret (input hidden)"
  [ -n "$ISSUER" ]        || die "ISSUER is required when SSO is enabled (e.g. https://your-tenant.okta.com)."
  [ -n "$CLIENT_ID" ]     || die "CLIENT_ID is required when SSO is enabled."
  [ -n "$CLIENT_SECRET" ] || die "CLIENT_SECRET is required when SSO is enabled."

  # Normalize and check the issuer here rather than letting the server discover
  # the problem at startup. Every fault below produces the same symptom -- a
  # sign-in that fails at the provider with an opaque error -- and the operator
  # is standing right here with the value in hand.
  ISSUER="${ISSUER%/}"
  case "$ISSUER" in
    https://*) ;;
    http://*) die "ISSUER must use https, not http: $ISSUER" ;;
    *) die "ISSUER must be an absolute https URL (e.g. https://your-tenant.okta.com), got: $ISSUER" ;;
  esac
  case "$ISSUER" in
    */.well-known*)
      die "ISSUER is the issuer base URL, not the discovery document. Drop the
  /.well-known/openid-configuration suffix: ${ISSUER%%/.well-known*}" ;;
  esac
  # Okta's ORG authorization server is the issuer this project documents. A
  # /oauth2/<id> path is a CUSTOM authorization server, which also works, but its
  # groups claim has to be configured separately on that server -- so this is a
  # warning, not an error: the operator may well mean it.
  case "$ISSUER" in
    *.okta.com/oauth2/*|*.oktapreview.com/oauth2/*)
      warn "ISSUER points at an Okta CUSTOM authorization server ($ISSUER)."
      warn "That works, but the groups claim must be configured on THAT server,"
      warn "not on the org server. See docs/deployment.md if sign-in yields no groups." ;;
  esac
  ok "OIDC issuer: $ISSUER"

  # With SSO on, the group -> permission mapping is the only thing between an
  # authenticated stranger and this deployment's data, and the server refuses to
  # start if it grants nothing. Say so now, while it is still cheap to fix.
  AUTH_GROUPS_PRECHECK="shared/auth-groups.config.json"
  if [ ! -f "$AUTH_GROUPS_PRECHECK" ]; then
    die "SSO is enabled but $AUTH_GROUPS_PRECHECK is missing. The server will not
  start without it: it maps your provider's groups to read/write access."
  fi
  if ! grep -q '"write"' "$AUTH_GROUPS_PRECHECK"; then
    warn "No group in $AUTH_GROUPS_PRECHECK is mapped to \"write\"."
    warn "The deployment will come up READ-ONLY for everyone. Add your admin"
    warn "group before handing it over. See docs/deployment.md."
  fi
  if grep -qE '"(pssid-gui|pssid-gui-users)"' "$AUTH_GROUPS_PRECHECK"; then
    warn "$AUTH_GROUPS_PRECHECK still contains the shipped example group names."
    warn "Replace them with YOUR provider's group names, exactly as it emits them,"
    warn "or nobody will have access."
  fi
fi

case "$TLS" in
  self-signed|letsencrypt|none) ;;
  *) die "Invalid --tls value: $TLS" ;;
esac
ok "TLS mode: $TLS"

# SSO's session cookie is always set with Secure (services/server/src/index.ts),
# which browsers never send back over plain HTTP. --sso=true --tls=none would
# still deploy, but sign-in would silently loop (the session cookie never
# round-trips) instead of failing with a clear cause. Reject the combination now.
if [ "$SSO" = "true" ] && [ "$TLS" = "none" ]; then
  die "--sso=true requires HTTPS (the session cookie is Secure-only). Use --tls=self-signed or --tls=letsencrypt, or disable SSO."
fi

SCHEME="https"; [ "$TLS" = "none" ] && SCHEME="http"
BASE_URL="${SCHEME}://${HOSTNAME_INPUT}"

# HSTS, for the header helmet sends on API responses. Same rule as the nginx
# header in section 6, and for the same reason: HSTS makes a certificate error
# NON-BYPASSABLE, so with a self-signed certificate it locks every user out for
# the whole max-age. CA-issued certificates only.
HSTS_ENABLED="false"; [ "$TLS" = "letsencrypt" ] && HSTS_ENABLED="true"

# ─── 3. Server environment (.env) ────────────────────────────────────────────
step "Writing server environment"
SECRET="$(openssl rand -hex 32)"

# MongoDB credentials. Reuse the ones already in .env if present, so re-running
# the installer does not lock out an existing database volume (the root user is
# only created when the data volume is first initialized).
if [ -f .env ] && grep -q '^MONGO_PASSWORD=' .env; then
  MONGO_USERNAME="$(sed -n 's/^MONGO_USERNAME=//p' .env)"
  MONGO_PASSWORD="$(sed -n 's/^MONGO_PASSWORD=//p' .env)"
  info "Reusing existing MongoDB credentials from .env"
else
  MONGO_USERNAME="pssid"
  MONGO_PASSWORD="$(openssl rand -hex 24)"
  # If a database volume already exists but no credentials were stored, enabling
  # auth now would lock the server out of that existing data.
  if docker volume ls --format '{{.Name}}' 2>/dev/null | grep -q 'mongo_db$'; then
    warn "An existing MongoDB volume was found but no credentials are stored."
    warn "Authentication applies only to a freshly initialized database. If the"
    warn "server cannot connect, remove the old volume (make clean) and re-run,"
    warn "or restore from a backup after the new database is up."
  fi
fi
MONGODB_URI="mongodb://${MONGO_USERNAME}:${MONGO_PASSWORD}@mongo:27017/pssid?authSource=admin"

# Redis holds the OIDC session store when SSO is on, so anything able to reach
# it can read or forge logged-in sessions. It is never published off the Docker
# network, but that is one misconfiguration away from being the only thing
# protecting it, so require a password as well. Unlike MongoDB this can be
# rotated freely: requirepass applies at server start, not at volume init, so
# the only consequence of a new value is that existing sessions stop resolving
# and users log in again.
if [ -f .env ] && grep -q '^REDIS_PASSWORD=' .env; then
  REDIS_PASSWORD="$(sed -n 's/^REDIS_PASSWORD=//p' .env)"
  info "Reusing existing Redis password from .env"
else
  REDIS_PASSWORD="$(openssl rand -hex 24)"
fi
# Hex only, so it needs no escaping inside the URL.
REDIS_URL="redis://:${REDIS_PASSWORD}@redis:6379"

SERVER_ENV="services/server/.env"
# Create the file and lock it down BEFORE a single secret goes into it. A plain
# `>` redirect creates with the umask default (usually 0644), so the MongoDB
# password and session secret would sit world-readable for the window between
# the first write and the chmod below.
# A DIRECTORY here is not an operator mistake, it is Docker's doing: a bind mount
# whose source does not exist is created as a directory, and an older dev compose
# mounted this path. The truncate below would then abort the whole install with a
# bare "Is a directory", after secrets have already been generated. It can only
# ever be empty (nothing writes into it), so replacing it loses nothing.
if [ -d "$SERVER_ENV" ]; then
  rmdir "$SERVER_ENV" 2>/dev/null \
    || die "$SERVER_ENV is a non-empty directory. Expected a file; move it aside and re-run."
  info "Replaced an empty directory at $SERVER_ENV (left by a Docker bind mount) with a file"
fi
: > "$SERVER_ENV"
chmod 600 "$SERVER_ENV" 2>/dev/null || warn "Could not chmod $SERVER_ENV"
{
  echo "# Generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). Do not commit."
  echo "MONGODB_URI=${MONGODB_URI}"
  echo "REDIS_URL=${REDIS_URL}"
  echo "BASE_URL=${BASE_URL}"
  # Deliberately EMPTY, which gives a host-only session cookie.
  #
  # Setting it to the hostname works, but is strictly worse in two ways. A cookie
  # with an explicit Domain is also sent to every SUBDOMAIN of it, so anything
  # that can get a name under this domain receives the session; host-only sends
  # it to exactly the host that set it. And a pinned domain breaks the loopback
  # access path -- nginx serves this application on localhost too (the health
  # checks depend on it), and a browser used on the VM would have the cookie
  # rejected as a domain mismatch and loop at sign-in forever.
  #
  # Set it only for a deployment that genuinely needs one session across several
  # hostnames; the server validates that it matches BASE_URL if you do.
  echo "COOKIE_DOMAIN="
  echo "SECRET=${SECRET}"
  echo "HSTS_ENABLED=${HSTS_ENABLED}"
  # Written whenever the provider details are known, NOT only when SSO is on.
  # This block truncates the file, so gating the write on the posture meant that
  # deploying with SSO off erased the credentials an operator had put in ready to
  # switch it on -- and `make sso-on` then refused, pointing at values it had
  # just destroyed. They are inert while SSO is off: the server reads them only
  # through resolveSsoSettings(), which runs behind the same flag.
  if [ -n "$ISSUER" ]; then
    echo "ISSUER_BASE_URL=${ISSUER}"
    echo "CLIENT_ID=${CLIENT_ID}"
    echo "CLIENT_SECRET=${CLIENT_SECRET}"
    echo ""
    echo "# --- SSO tunables. Edit and 'make restart' to change; the server"
    echo "# validates every one of these at startup and refuses to boot on a bad"
    echo "# value rather than running with a silently weakened setting."
    echo ""
    echo "# Scope requested at login. 'groups' is what Okta and Entra ID need in"
    echo "# order to release group membership. A provider that does not define a"
    echo "# scope by that name rejects the whole request with invalid_scope; a"
    echo "# federated eduPerson tenant wants \"openid profile email edumember groups\"."
    echo "SSO_SCOPE=openid profile email groups"
    echo ""
    echo "# Session lifetime. Absolute is the hard ceiling from the moment of"
    echo "# login; idle ends a session left open on an unattended workstation."
    echo "SESSION_ABSOLUTE_SECONDS=7200"
    echo "SESSION_IDLE_SECONDS=1800"
    echo ""
    echo "# Deny sign-in to an identity with no group mapped in"
    echo "# shared/auth-groups.config.json. Keep true: with it false, unentitled"
    echo "# users get a session and a dead interface instead of a clear refusal."
    echo "# Set false only to debug a groups claim that is not arriving."
    echo "SSO_REQUIRE_GROUP=true"
    echo ""
    echo "# Pushed Authorization Requests. Keeps authorization parameters out of"
    echo "# the browser URL entirely. The provider must advertise"
    echo "# pushed_authorization_request_endpoint or the server will not start."
    echo "SSO_PAR=false"
    echo ""
    echo "# Accept provider-initiated back-channel logout tokens. Requires the"
    echo "# provider to support it and to be pointed at <BASE_URL>/backchannel-logout."
    echo "SSO_BACKCHANNEL_LOGOUT=false"
  fi
} > "$SERVER_ENV"
# This file holds the session secret, the OIDC client secret and the MongoDB URI
# with its password. Compose bind-mounts it into the server container, and the
# server image runs as a NON-ROOT user, so host ownership decides what that
# process can read. Root-owned 0600 is invisible to it: dotenv loads nothing
# ("injecting env (0)") and the server falls back to an unauthenticated MongoDB
# URI with no SECRET, while still reporting healthy.
#
# The obvious fix, handing the file to uid/gid 1000 (the image's `node` user),
# is not an acceptable tradeoff on Debian/Ubuntu, where 1000 is the first human login account
# (typically `ubuntu`). That would give any shell user on this host the database
# password and the OIDC client secret.
#
# So: the file stays ROOT-OWNED (nothing running as the container's uid can
# rewrite, chmod or chown it) and read access is granted to a dedicated high gid
# that no human account belongs to. docker-compose.yml adds that gid to the
# server container as a supplementary group (`group_add`), which is enough for
# the process to read the file and grants nothing at all on the host.
#
# 61000 sits above Debian/Ubuntu's GID_MAX (60000), so adduser/useradd never
# hand it to a real account. Override with PSSID_SECRET_GID if it is taken here.
SECRET_GID="${PSSID_SECRET_GID:-61000}"
if [ "$(uname -s)" = "Linux" ]; then
  if chown "root:${SECRET_GID}" "$SERVER_ENV" 2>/dev/null \
     && chmod 640 "$SERVER_ENV" 2>/dev/null; then
    ok "Wrote $SERVER_ENV (gitignored, root-owned, mode 640, readable only via gid ${SECRET_GID})"
  else
    warn "Could not restrict $SERVER_ENV to root:${SECRET_GID} (mode 640)."
    warn "Leaving it root-owned 0600: the server container will NOT be able to read it."
  fi
else
  ok "Wrote $SERVER_ENV (gitignored, mode 600)"
fi

# ─── 4. Root environment for compose interpolation ───────────────────────────
step "Writing deployment environment"

# Resolve the write policy BEFORE the file is rewritten, because this block
# truncates .env: anything not written back here is destroyed. That is exactly
# how a hand-added OPEN_WRITE=true used to disappear on the next `make upgrade`,
# silently returning the site to read-only. Precedence:
#   1. --open-write / PSSID_OPEN_WRITE, an explicit choice for this run
#   2. the value already in .env, so an operator's setting survives upgrades
#   3. the compiled default in shared/config.ts (ships false = read-only)
if [ -z "$OPEN_WRITE" ] && [ -f .env ] && grep -q '^OPEN_WRITE=' .env; then
  OPEN_WRITE="$(sed -n 's/^OPEN_WRITE=//p' .env | tail -1)"
  info "Preserving OPEN_WRITE=${OPEN_WRITE} from the existing .env"
fi
if [ -z "$OPEN_WRITE" ]; then
  OPEN_WRITE="false"
fi
OPEN_WRITE="$(printf '%s' "$OPEN_WRITE" | tr '[:upper:]' '[:lower:]')"
[ "$OPEN_WRITE" = "true" ] || [ "$OPEN_WRITE" = "false" ] \
  || die "Invalid --open-write value: $OPEN_WRITE (expected true or false)"

# Same ordering rule as above: create and lock the file before the MongoDB
# password is written into it, not after.
: > .env
chmod 600 .env 2>/dev/null || warn "Could not chmod 600 .env"
{
  echo "# Generated by install.sh. Read by Docker Compose. Do not commit."
  echo "EDITION=${EDITION}"
  echo "MONGO_USERNAME=${MONGO_USERNAME}"
  echo "MONGO_PASSWORD=${MONGO_PASSWORD}"
  echo "REDIS_PASSWORD=${REDIS_PASSWORD}"
  # Auth posture, read by compose and passed to the server. Written on every run
  # so it survives the truncation above; the server and the browser both resolve
  # write access from this (see shared/accessControl.ts and /api/userinfo).
  echo "ENABLE_SSO=${SSO}"
  echo "OPEN_WRITE=${OPEN_WRITE}"
  # Supplementary gid the server container is given so it can read
  # services/server/.env. Kept here so compose and install.sh cannot disagree.
  echo "PSSID_SECRET_GID=${SECRET_GID}"
} > .env
# Read by Docker Compose, which runs as root, so nothing but root needs access.
ok "Wrote .env (edition + MongoDB credentials, root-owned, mode 600)"

# ─── 5. Toggle SSO flag (shared/config.ts) ───────────────────────────────────
# ENABLE_SSO lives in shared/config.ts and is read by both client and server.
# This is a deploy-time edit on this host (the file is not committed by tooling).
step "Applying SSO + base URL to shared/config.ts"
CONFIG_TS="shared/config.ts"
if [ -f "$CONFIG_TS" ]; then
  sed -i -E "s/(ENABLE_SSO:\s*)(true|false)/\1${SSO}/" "$CONFIG_TS"
  sed -i -E "s#(BASE_URL:\s*\")[^\"]*(\")#\1${BASE_URL}\2#" "$CONFIG_TS"
  ok "Set ENABLE_SSO=${SSO}, BASE_URL=${BASE_URL}"
else
  warn "shared/config.ts not found; skipping SSO toggle"
fi

# The server runs as non-root (uid 1000) and bind-mounts this file read-only
# (docker-compose.yml). accessControl.ts reads it at startup regardless of SSO,
# so the container user MUST be able to read it. A restrictive host umask (e.g.
# 027) leaves a freshly cloned file at mode 640 root:root, which that user cannot
# read, and the server crashes with EACCES before it reaches the database. The
# file holds only a group -> read/write mapping and no secrets, so it is made
# world-readable rather than exposed through the secret gid used for .env.
AUTH_GROUPS="shared/auth-groups.config.json"
if [ -f "$AUTH_GROUPS" ]; then
  chmod a+r "$AUTH_GROUPS" 2>/dev/null \
    || warn "Could not make $AUTH_GROUPS readable; the server container may fail to start."
fi

# ─── 6. TLS material + nginx config ──────────────────────────────────────────
step "Configuring TLS and nginx"
mkdir -p certs
# Hardening shared by both renders below, kept in one place so the HTTPS and
# plain-HTTP variants cannot drift apart. Mirrors the committed reference
# nginx.conf; change both together.

# Host names this deployment answers to. The public hostname, plus the loopback
# names, because `https://localhost/api/health` is how the health poll below,
# the Ansible role's wait, upgrade-controller.sh and the troubleshooting docs all
# check the stack -- and with the strict default server added below, a Host that
# is not listed here gets no response at all. Deduplicated because the installer
# default for the hostname is `localhost`, and nginx warns on a repeated name.
NGINX_SERVER_NAMES="${HOSTNAME_INPUT}"
for extra in localhost 127.0.0.1; do
  case " ${NGINX_SERVER_NAMES} " in
    *" ${extra} "*) ;;
    *) NGINX_SERVER_NAMES="${NGINX_SERVER_NAMES} ${extra}" ;;
  esac
done

NGINX_HTTP_HARDENING="\
    # Never advertise the nginx version: it turns a version-specific CVE
    # announcement into a list of hosts worth trying.
    server_tokens off;

    # Slow-request defences. A connection that dribbles out a body or header a
    # byte at a time holds a worker indefinitely otherwise. Deliberately NOT a
    # per-IP connection cap, which would also throttle a whole office behind one
    # NAT address.
    client_header_timeout 12s;
    client_body_timeout   12s;
    send_timeout          10s;
    keepalive_timeout     30s;

    # The server enforces its own 256kb JSON ceiling and answers with a JSON 413;
    # this drops anything wildly oversized at the edge instead.
    client_max_body_size 1m;

    # Volumetric shedding in front of the application's own per-IP limits (see
    # services/server/src/services/security.middleware.ts). Set ABOVE those on
    # purpose: policy lives in one place, this only absorbs a flood.
    limit_req_zone \$binary_remote_addr zone=api_zone:10m  rate=20r/s;
    limit_req_zone \$binary_remote_addr zone=auth_zone:10m rate=2r/s;
    limit_req_status 429;"

# Security response headers, shared. \$1 is appended (the HSTS line, or nothing).
nginx_headers() {
  cat <<EOF
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Content-Type-Options "nosniff" always;
        # frame-ancestors in the CSP is the modern control; this covers a browser
        # old enough to lack it, at no cost.
        add_header X-Frame-Options "DENY" always;
        # This application uses none of these APIs, so a permission prompt
        # appearing in it would be evidence of injected content, not a feature.
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), usb=(), payment=(), display-capture=()" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        # A network configuration tool has nothing to gain from being indexed.
        add_header X-Robots-Tag "noindex, nofollow" always;
        # nginx is the single authority for the headers above. add_header APPENDS
        # to what the upstream sent, and the API server runs helmet, which sets
        # four of these itself -- so without hiding them every /api/ response
        # carried two values of each, and for X-Frame-Options and Referrer-Policy
        # the two disagreed. Browsers do not resolve a conflicting
        # X-Frame-Options consistently; some discard it entirely.
        proxy_hide_header X-Frame-Options;
        proxy_hide_header Referrer-Policy;
        proxy_hide_header X-Content-Type-Options;
        proxy_hide_header Cross-Origin-Opener-Policy;
        proxy_hide_header Strict-Transport-Security;
        proxy_hide_header X-Powered-By;
EOF
}

# The OIDC endpoints, shared. /login and /logout are rate limited so a redirect
# loop cannot turn this deployment into a battering ram against the identity
# provider. /callback is deliberately NOT limited: it is already bound to a
# single-use state, nonce and PKCE verifier, and a user retrying a failed
# sign-in must not be locked out. /backchannel-logout must be proxied even when
# the feature is off, or it falls through to the client container and the
# provider's logout token is delivered to a static file server.
nginx_oidc_locations() {
  cat <<EOF
        location /login {
            limit_req zone=auth_zone burst=10 nodelay;
            proxy_pass http://server:8000/login;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
        location /logout {
            limit_req zone=auth_zone burst=10 nodelay;
            proxy_pass http://server:8000/logout;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
        location /callback {
            proxy_pass http://server:8000/callback;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
        location /backchannel-logout {
            proxy_pass http://server:8000/backchannel-logout;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
EOF
}

gen_nginx_https() { # $1 cert path, $2 key path, $3 "hsts" to enable HSTS
  # HSTS is opt-in per TLS mode, and only ever enabled for a CA-issued
  # certificate. It is genuinely dangerous with a self-signed one: HSTS makes
  # certificate errors NON-BYPASSABLE, so the browser stops offering
  # "Advanced -> Proceed" and every user is locked out of the site for the whole
  # max-age, with no server-side way to take it back. Trusted cert only.
  local hsts_header=""
  local stapling=""
  if [ "${3:-}" = "hsts" ]; then
    hsts_header='
        # One year, subdomains included. No `preload`: that is a submission to a
        # browser-vendor list which is slow and difficult to reverse.
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
    # OCSP stapling saves every visitor a round trip to the CA and stops the CA
    # learning who visits this site. Only meaningful for a CA-issued
    # certificate; with a self-signed one nginx logs a warning and ignores it.
    # The resolver is Docker's embedded DNS, which is what this container has.
    stapling='
        ssl_stapling on;
        ssl_stapling_verify on;
        resolver 127.0.0.11 valid=300s;
        resolver_timeout 5s;'
  fi
  cat > nginx.conf <<EOF
events {}

http {
${NGINX_HTTP_HARDENING}

    # A request whose Host this deployment does not serve is refused without a
    # response (444), and at the TLS layer for HTTPS, so the real hostname's
    # certificate is never presented to a client that did not ask for it by name.
    server {
        listen 80 default_server;
        server_name _;
        return 444;
    }
    server {
        listen 443 ssl default_server;
        server_name _;
        ssl_reject_handshake on;
    }

    server {
        listen 80;
        server_name ${NGINX_SERVER_NAMES};
        # \`^~\` stops the dotfile regex location below from capturing this path
        # (it contains \`/.\`) and 404ing every certificate renewal.
        location ^~ /.well-known/acme-challenge/ { root /var/www/certbot; }
        location / { return 301 https://\$host\$request_uri; }
    }

    server {
        listen 443 ssl;
        http2 on;
        server_name ${NGINX_SERVER_NAMES};

        ssl_certificate ${1};
        ssl_certificate_key ${2};

        # TLS 1.2 floor (1.0/1.1 are deprecated by RFC 8996), forward-secret AEAD
        # suites only, so a future key compromise cannot decrypt traffic captured
        # today. Session tickets are off because nginx cannot rotate the ticket
        # key, and one un-rotated key decrypts every session it issued.
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 1d;
        ssl_session_tickets off;${stapling}

        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;
$(nginx_headers)${hsts_header}
        proxy_busy_buffers_size 512k;
        proxy_buffers 4 512k;
        proxy_buffer_size 256k;

        # Dotfiles are never content: this stops a stray .env, .git or editor
        # backup from being served if one is ever left in a served path.
        location ~ /\\. { deny all; return 404; }

        location = / {
            proxy_pass http://server:8000/;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
        location / {
            proxy_pass http://client:8080;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            # One value only. This used to set \$scheme and then override it with
            # a literal https, so the upstream was told the protocol twice.
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
        location /api/ {
            limit_req zone=api_zone burst=40 nodelay;
            proxy_pass http://server:8000;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            # Provisioning runs Ansible against every probe and has no time limit
            # of its own -- how long it takes is not a constraint here. nginx's
            # DEFAULT proxy_read_timeout is 60s, which would return 504 to the
            # browser part way through while the run carried on server-side:
            # the operator sees a failure, retries, and starts a second run over
            # the first. Wait for the real answer instead.
            proxy_read_timeout 3600s;
            proxy_send_timeout 3600s;
        }
$(nginx_oidc_locations)
    }
}
EOF
}
gen_nginx_http() {
  cat > nginx.conf <<EOF
events {}

http {
${NGINX_HTTP_HARDENING}

    server {
        listen 80 default_server;
        server_name _;
        return 444;
    }

    server {
        listen 80;
        server_name ${NGINX_SERVER_NAMES};

        # No upgrade-insecure-requests here: this variant serves plain HTTP.
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
$(nginx_headers)

        location ~ /\\. { deny all; return 404; }

        location = / {
            proxy_pass http://server:8000/;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
        location / {
            proxy_pass http://client:8080;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
        location /api/ {
            limit_req zone=api_zone burst=40 nodelay;
            proxy_pass http://server:8000;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
$(nginx_oidc_locations)
    }
}
EOF
}

# Back up any existing host-specific nginx.conf before regenerating.
[ -f nginx.conf ] && cp nginx.conf nginx.conf.bak 2>/dev/null || true

case "$TLS" in
  self-signed)
    if [ ! -f certs/fullchain.pem ] || [ ! -f certs/privkey.pem ]; then
      openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout certs/privkey.pem -out certs/fullchain.pem \
        -subj "/CN=${HOSTNAME_INPUT}" >/dev/null 2>&1
      ok "Generated self-signed certificate for ${HOSTNAME_INPUT}"
    else
      info "Reusing existing certs/fullchain.pem"
    fi
    gen_nginx_https "/etc/nginx/certs/fullchain.pem" "/etc/nginx/certs/privkey.pem"
    ;;
  letsencrypt)
    [ -n "$LE_EMAIL" ] || prompt LE_EMAIL "Contact email for Let's Encrypt" ""
    # HSTS only here: the certificate is CA-issued, so a browser that is pinned
    # to HTTPS can still validate it. See gen_nginx_https for why self-signed
    # deployments must not send this header.
    gen_nginx_https \
      "/etc/nginx/certs/live/${HOSTNAME_INPUT}/fullchain.pem" \
      "/etc/nginx/certs/live/${HOSTNAME_INPUT}/privkey.pem" \
      hsts
    warn "Let's Encrypt selected: ensure ports 80/443 are publicly reachable."
    info "After the stack is up, issue a cert with the certbot service (see docs/deployment.md)."
    ;;
  none)
    gen_nginx_http
    warn "TLS disabled; use only for local testing, never production."
    ;;
esac
ok "Rendered nginx.conf for ${HOSTNAME_INPUT}"

# ─── 7. Probe runtime directories (Linux) ────────────────────────────────────
step "Preparing probe runtime directories"
if [ "$(uname -s)" = "Linux" ]; then
  SUDO=""; [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"
  $SUDO mkdir -p /usr/lib/exec/pssid \
    /var/lib/pssid/plugins/tests \
    /var/lib/pssid/plugins/layer2 /var/lib/pssid/plugins/layer3 \
    /var/lib/pssid/output 2>/dev/null || warn "Could not create /var/lib/pssid (insufficient permissions)"

  # The server container runs as the image's non-root `node` user (uid/gid 1000)
  # and writes into these bind mounts: it seeds the test/layer templates into
  # plugins/ and writes the generated pssid_config.json + hosts.ini into output/.
  # Without this they stay root-owned 0755 and every write is denied.
  $SUDO chown -R 1000:1000 /var/lib/pssid /usr/lib/exec/pssid 2>/dev/null \
    || warn "Could not chown /var/lib/pssid and /usr/lib/exec/pssid to uid 1000 (the server container may not be able to write there)"
  ok "Runtime directories ready"

  # Note: the layer 2 / layer 3 (and tests) starter methods are seeded
  # into these directories by the server container's entrypoint.sh on every start
  # (it copies services/server/starters/* into plugins/), so no host-side copy is
  # needed here. We only ensure the directories exist as bind-mount sources.
  if [ ! -x /usr/lib/exec/pssid/provision ]; then
    warn "No provision binary at /usr/lib/exec/pssid/provision."
    info "The GUI runs fine without it, but provisioning to probes needs your"
    info "Ansible-based provision script there (see docs/deployment.md)."
  fi
else
  info "Non-Linux host detected; skipping /var/lib/pssid setup (dev mode)."
fi

# ─── 8. Bring the stack up ───────────────────────────────────────────────────
COMPOSE_ARGS=""
[ "$SSO" = "true" ] && COMPOSE_ARGS="--profile sso"

if [ "$DO_PULL" = "true" ]; then
  # Pull the prebuilt images instead of building on this machine. On any pull
  # failure (registry unreachable, images not published yet) fall back to the
  # build path below so the deployment still succeeds.
  step "Pulling prebuilt images"
  export PSSID_IMAGE_PREFIX="${PSSID_IMAGE_PREFIX:-$PULL_PREFIX_DEFAULT}"
  export PSSID_IMAGE_TAG="${PSSID_IMAGE_TAG:-latest}"
  # The published client image is per edition (the brand is baked into the
  # bundle): the default edition is :latest, and any other edition is published
  # under its own tag (see .github/workflows/publish.yml).
  if [ "$EDITION" = "default" ]; then
    export PSSID_CLIENT_TAG="${PSSID_CLIENT_TAG:-$PSSID_IMAGE_TAG}"
  else
    export PSSID_CLIENT_TAG="${PSSID_CLIENT_TAG:-$EDITION}"
  fi
  info "Registry: ${PSSID_IMAGE_PREFIX}_{server,mongo}:${PSSID_IMAGE_TAG}, _client:${PSSID_CLIENT_TAG}"
  # shellcheck disable=SC2086
  if EDITION="$EDITION" $COMPOSE -f docker-compose.yml $COMPOSE_ARGS pull client server mongo; then
    # Persist the registry names in the root .env (compose reads it), so
    # make up / restart / upgrade keep using the pulled images.
    {
      echo "PSSID_IMAGE_PREFIX=${PSSID_IMAGE_PREFIX}"
      echo "PSSID_IMAGE_TAG=${PSSID_IMAGE_TAG}"
      echo "PSSID_CLIENT_TAG=${PSSID_CLIENT_TAG}"
    } >> .env
    step "Starting the stack (prebuilt images)"
    # shellcheck disable=SC2086
    EDITION="$EDITION" $COMPOSE -f docker-compose.yml $COMPOSE_ARGS up -d --no-build
    ok "Containers started"
  else
    warn "Pull failed; falling back to building the images from source."
    warn "(Building needs ~8-10 GB free on Docker's storage; the pull-mode disk check was smaller.)"
    unset PSSID_IMAGE_PREFIX PSSID_IMAGE_TAG PSSID_CLIENT_TAG
    DO_PULL="false"
  fi
fi

if [ "$DO_PULL" = "false" ]; then
  step "Building images and starting the stack"
  [ "$DO_BUILD" = "true" ] && info "Compiling the client bundle (vue-tsc + vite build); this takes a few minutes on first run."
  BUILD_FLAG=""; [ "$DO_BUILD" = "true" ] && BUILD_FLAG="--build"
  # shellcheck disable=SC2086
  EDITION="$EDITION" $COMPOSE -f docker-compose.yml $COMPOSE_ARGS up -d $BUILD_FLAG
  ok "Containers started"
fi

# ─── 9. Health check ─────────────────────────────────────────────────────────
step "Waiting for the stack to become healthy"
# Poll through nginx: it is the only published entry point (the server's port
# 8000 stays on the internal Docker network), and nginx itself only starts
# once the client and server containers report healthy, so a passing check
# here means the whole chain is up. -k accepts the self-signed certificate.
# The client image is pre-built (the bundle was compiled during the build step
# above), so containers start in seconds; this budget (150 x 2s = 5 min) covers
# server + database startup on a small VM and exits on the first success.
if [ "$TLS" = "none" ]; then
  HEALTH_URL="http://localhost/api/health"
else
  HEALTH_URL="https://localhost/api/health"
fi
HEALTHY="false"
for i in $(seq 1 150); do
  if curl -fsSk "$HEALTH_URL" >/dev/null 2>&1; then HEALTHY="true"; break; fi
  sleep 2
  printf "  ${C_DIM}…still starting (%s/150)${C_RESET}\r" "$i"
done
echo
if [ "$HEALTHY" = "true" ]; then
  ok "Server is healthy"
else
  warn "Health check did not pass in time. Recent client and server logs:"
  $COMPOSE -f docker-compose.yml logs --tail=40 client server || true
fi

# ─── Done ────────────────────────────────────────────────────────────────────
printf "\n${C_GREEN}${C_BOLD}Deployment complete.${C_RESET}\n"
printf "  ${C_BOLD}URL:${C_RESET}   %s\n" "$BASE_URL"
printf "  ${C_BOLD}Edition:${C_RESET} %s\n" "$EDITION"
printf "  ${C_BOLD}SSO:${C_RESET}   %s\n" "$SSO"
[ "$TLS" = "self-signed" ] && printf "  ${C_DIM}(self-signed cert; your browser will warn. Choose Advanced, then Proceed.)${C_RESET}\n"

# Security posture: with SSO off, write access is governed by OPEN_WRITE, and
# open writes mean ANYONE who can reach this site can change the probe
# configuration. Make that unmistakable so running without SSO is a deliberate
# choice, not a silent open door.
#
# Read $OPEN_WRITE, the value resolved in section 4 and written to .env, NOT the
# compiled default in shared/config.ts. Compose passes OPEN_WRITE to the server,
# where it overrides the compiled value -- so parsing config.ts here reported
# "false" and stayed silent on a deployment whose server was accepting writes
# from anyone, which is precisely the case this warning exists to catch.
if [ "$SSO" = "false" ]; then
  if [ "$OPEN_WRITE" = "true" ]; then
    printf "\n  ${C_YELLOW}${C_BOLD}! Security:${C_RESET} ${C_YELLOW}SSO is off and writes are open (OPEN_WRITE=true).${C_RESET}\n"
    printf "  ${C_YELLOW}  Anyone who can reach %s can change the probe configuration.${C_RESET}\n" "$BASE_URL"
    printf "  ${C_YELLOW}  Restrict access at the network layer, or enable SSO, before relying on this.${C_RESET}\n"
    printf "  ${C_DIM}  (For a read-only deployment: ./install.sh --open-write=false)${C_RESET}\n"
  else
    printf "\n  ${C_DIM}  SSO is off and writes are refused: the interface is read-only.${C_RESET}\n"
    printf "  ${C_DIM}  Enable writes with --open-write=true, or SSO with --sso=true.${C_RESET}\n"
  fi
else
  # SSO on. The server validates every OIDC setting at startup and refuses to
  # start on a bad one, so the first thing to check is that it came up at all.
  printf "\n  ${C_BOLD}Next, verify single sign-on:${C_RESET}\n"
  printf "    ${C_CYAN}docker compose logs server | grep -E 'SSO enabled|REFUSING TO START' -A3${C_RESET}\n"
  printf "  ${C_DIM}  Expect a line starting \"SSO enabled:\" reporting the posture in force.${C_RESET}\n"
  printf "  ${C_DIM}  \"REFUSING TO START\" names the setting at fault; fix it and 'make restart'.${C_RESET}\n"
  printf "    ${C_CYAN}%s/api/userinfo${C_RESET}  ${C_DIM}(signed in: confirms your groups and access level)${C_RESET}\n" "$BASE_URL"
  printf "  ${C_DIM}  Empty \"groups\" means the provider is not releasing the claim -- see${C_RESET}\n"
  printf "  ${C_DIM}  docs/deployment.md#single-sign-on (step 2 of the Okta example).${C_RESET}\n"
  if ! grep -q '"write"' shared/auth-groups.config.json 2>/dev/null; then
    printf "\n  ${C_YELLOW}${C_BOLD}! Security:${C_RESET} ${C_YELLOW}No group is mapped to \"write\"; nobody can edit anything.${C_RESET}\n"
    printf "  ${C_YELLOW}  Add your admin group to shared/auth-groups.config.json (no restart needed).${C_RESET}\n"
  fi
fi
printf "\n  Manage with: ${C_CYAN}make up${C_RESET} | ${C_CYAN}make down${C_RESET} | ${C_CYAN}make logs${C_RESET} | ${C_CYAN}make doctor${C_RESET}\n\n"
