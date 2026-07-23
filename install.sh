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

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  die "Docker Compose is not available. Install the docker-compose-plugin."
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
  [ -n "$CLIENT_ID" ]     || die "CLIENT_ID is required when SSO is enabled."
  [ -n "$CLIENT_SECRET" ] || die "CLIENT_SECRET is required when SSO is enabled."
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
: > "$SERVER_ENV"
chmod 600 "$SERVER_ENV" 2>/dev/null || warn "Could not chmod $SERVER_ENV"
{
  echo "# Generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). Do not commit."
  echo "MONGODB_URI=${MONGODB_URI}"
  echo "REDIS_URL=${REDIS_URL}"
  echo "BASE_URL=${BASE_URL}"
  echo "COOKIE_DOMAIN=${HOSTNAME_INPUT}"
  echo "SECRET=${SECRET}"
  if [ "$SSO" = "true" ]; then
    echo "ISSUER_BASE_URL=${ISSUER}"
    echo "CLIENT_ID=${CLIENT_ID}"
    echo "CLIENT_SECRET=${CLIENT_SECRET}"
  fi
} > "$SERVER_ENV"
# This file holds the session secret, the OIDC client secret and the MongoDB URI
# with its password. Compose bind-mounts it into the server container, and the
# server image runs as a NON-ROOT user, so host ownership decides what that
# process can read. Root-owned 0600 is invisible to it: dotenv loads nothing
# ("injecting env (0)") and the server falls back to an unauthenticated MongoDB
# URI with no SECRET, while still reporting healthy.
#
# The obvious fix — handing the file to uid/gid 1000, the image's `node` user —
# is a bad trade on Debian/Ubuntu, where 1000 is the first human login account
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

# ─── 6. TLS material + nginx config ──────────────────────────────────────────
step "Configuring TLS and nginx"
mkdir -p certs
gen_nginx_https() { # $1 cert path, $2 key path, $3 "hsts" to enable HSTS
  # HSTS is opt-in per TLS mode, and only ever enabled for a CA-issued
  # certificate. It is genuinely dangerous with a self-signed one: HSTS makes
  # certificate errors NON-BYPASSABLE, so the browser stops offering
  # "Advanced -> Proceed" and every user is locked out of the site for the whole
  # max-age, with no server-side way to take it back. Trusted cert only.
  local hsts_header=""
  if [ "${3:-}" = "hsts" ]; then
    hsts_header='
        # One year, subdomains included. No `preload`: that is a submission to a
        # browser-vendor list which is slow and painful to reverse.
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
  fi
  cat > nginx.conf <<EOF
events {}

http {
    server {
        listen 80;
        server_name ${HOSTNAME_INPUT};
        location /.well-known/acme-challenge/ { root /var/www/certbot; }
        location / { return 301 https://\$host\$request_uri; }
    }

    server {
        listen 443 ssl;
        server_name ${HOSTNAME_INPUT};

        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Content-Type-Options "nosniff" always;${hsts_header}
        proxy_busy_buffers_size 512k;
        proxy_buffers 4 512k;
        proxy_buffer_size 256k;

        ssl_certificate ${1};
        ssl_certificate_key ${2};

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
            proxy_set_header X-Forwarded-Proto https;
        }
        location /api/ {
            proxy_pass http://server:8000;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
        location /login    { proxy_pass http://server:8000/login;    proxy_set_header Host \$host; proxy_set_header X-Forwarded-Proto \$scheme; }
        location /logout   { proxy_pass http://server:8000/logout;   proxy_set_header Host \$host; proxy_set_header X-Forwarded-Proto \$scheme; }
        location /callback { proxy_pass http://server:8000/callback; proxy_set_header Host \$host; proxy_set_header X-Forwarded-Proto \$scheme; }
    }
}
EOF
}
gen_nginx_http() {
  cat > nginx.conf <<EOF
events {}

http {
    server {
        listen 80;
        server_name ${HOSTNAME_INPUT};

        # No upgrade-insecure-requests here: this variant serves plain HTTP.
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Content-Type-Options "nosniff" always;

        location = / {
            proxy_pass http://server:8000/;
            proxy_set_header Host \$host;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
        location / {
            proxy_pass http://client:8080;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
        }
        location /api/ {
            proxy_pass http://server:8000;
            proxy_set_header Host \$host;
        }
        location /login    { proxy_pass http://server:8000/login;    proxy_set_header Host \$host; }
        location /logout   { proxy_pass http://server:8000/logout;   proxy_set_header Host \$host; }
        location /callback { proxy_pass http://server:8000/callback; proxy_set_header Host \$host; }
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

# Security posture: with SSO off, write access is governed by OPEN_WRITE in
# shared/config.ts. The shipped default is OPEN_WRITE=true, so ANYONE who can
# reach this site can change the probe configuration. Make that unmistakable so
# running without SSO is a deliberate choice, not a silent open door.
if [ "$SSO" = "false" ]; then
  OPEN_WRITE_VAL="$(sed -n -E 's/.*OPEN_WRITE:[[:space:]]*(true|false).*/\1/p' "$CONFIG_TS" 2>/dev/null | head -n1)"
  if [ "${OPEN_WRITE_VAL:-true}" != "false" ]; then
    printf "\n  ${C_YELLOW}${C_BOLD}! Security:${C_RESET} ${C_YELLOW}SSO is off and writes are open (OPEN_WRITE=true).${C_RESET}\n"
    printf "  ${C_YELLOW}  Anyone who can reach %s can change the probe configuration.${C_RESET}\n" "$BASE_URL"
    printf "  ${C_YELLOW}  Restrict access at the network layer, or enable SSO, before relying on this.${C_RESET}\n"
    printf "  ${C_DIM}  (For a read-only deployment, set OPEN_WRITE: false in shared/config.ts and run 'make up'.)${C_RESET}\n"
  fi
fi
printf "\n  Manage with: ${C_CYAN}make up${C_RESET} | ${C_CYAN}make down${C_RESET} | ${C_CYAN}make logs${C_RESET} | ${C_CYAN}make doctor${C_RESET}\n\n"
