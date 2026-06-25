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
#   ./install.sh --edition=umich --hostname=pssid.example.edu --sso=true \
#       --issuer=https://umich.okta.com --client-id=... --client-secret=... -y
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
LE_EMAIL=""
NON_INTERACTIVE="false"
DO_BUILD="true"

usage() {
  cat <<EOF
${C_BOLD}pSSID GUI installer${C_RESET}

Options:
  --edition=NAME         Edition: default | umich                  (default: default)
  --hostname=HOST        Public hostname for this deployment
  --sso=true|false       Enable Single Sign-On (OIDC)
  --issuer=URL           OIDC issuer base URL          (SSO only)
  --client-id=ID         OIDC client id                (SSO only)
  --client-secret=SECRET OIDC client secret            (SSO only)
  --tls=MODE             self-signed | letsencrypt | none          (default: self-signed)
  --email=EMAIL          Contact email for Let's Encrypt (tls=letsencrypt)
  --no-build             Use existing images; skip docker build
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
    --tls=*)           TLS="${arg#*=}" ;;
    --email=*)         LE_EMAIL="${arg#*=}" ;;
    --no-build)        DO_BUILD="false" ;;
    -y|--non-interactive) NON_INTERACTIVE="true" ;;
    -h|--help)         usage; exit 0 ;;
    *) die "Unknown option: $arg (try --help)" ;;
  esac
done

# Allow env-var fallbacks (handy for CI / non-interactive installs).
EDITION="${EDITION:-${PSSID_EDITION:-default}}"
HOSTNAME_INPUT="${HOSTNAME_INPUT:-${HOSTNAME_OVERRIDE:-}}"
ISSUER="${ISSUER:-${PSSID_ISSUER:-}}"

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

# Warn (do not fail) on busy ports.
check_port() {
  local p="$1"
  if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":$p "; then
    warn "Port $p already in use; the stack may fail to bind it."
  fi
}
for p in 80 443 8000 8080 27017; do check_port "$p"; done

# ─── 2. Gather configuration ─────────────────────────────────────────────────
step "Configuration"

if [ "$EDITION" != "default" ] && [ "$EDITION" != "umich" ]; then
  prompt EDITION "Edition (default/umich)" "default"
fi
[ "$EDITION" = "default" ] || [ "$EDITION" = "umich" ] || die "Invalid edition: $EDITION"
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
  [ -n "$ISSUER" ]        || prompt ISSUER "OIDC issuer base URL" "https://umich.okta.com"
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

SERVER_ENV="services/server/.env"
{
  echo "# Generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). Do not commit."
  echo "MONGODB_URI=${MONGODB_URI}"
  echo "REDIS_URL=redis://redis:6379"
  echo "BASE_URL=${BASE_URL}"
  echo "COOKIE_DOMAIN=${HOSTNAME_INPUT}"
  echo "SECRET=${SECRET}"
  if [ "$SSO" = "true" ]; then
    echo "ISSUER_BASE_URL=${ISSUER}"
    echo "CLIENT_ID=${CLIENT_ID}"
    echo "CLIENT_SECRET=${CLIENT_SECRET}"
  fi
} > "$SERVER_ENV"
ok "Wrote $SERVER_ENV (gitignored)"

# ─── 4. Root environment for compose interpolation ───────────────────────────
step "Writing deployment environment"
{
  echo "# Generated by install.sh. Read by Docker Compose. Do not commit."
  echo "EDITION=${EDITION}"
  echo "MONGO_USERNAME=${MONGO_USERNAME}"
  echo "MONGO_PASSWORD=${MONGO_PASSWORD}"
} > .env
ok "Wrote .env (edition + MongoDB credentials)"

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
gen_nginx_https() { # $1 cert path, $2 key path
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

        add_header Content-Security-Policy "upgrade-insecure-requests";
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
    gen_nginx_https \
      "/etc/nginx/certs/live/${HOSTNAME_INPUT}/fullchain.pem" \
      "/etc/nginx/certs/live/${HOSTNAME_INPUT}/privkey.pem"
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
    /var/lib/pssid/plugins/tests /var/lib/pssid/plugins/archivers \
    /var/lib/pssid/plugins/layer2 /var/lib/pssid/plugins/layer3 \
    /var/lib/pssid/output 2>/dev/null || warn "Could not create /var/lib/pssid (insufficient permissions)"
  ok "Runtime directories ready"

  # Seed the layer 2 / layer 3 plugin directories with the starter methods if
  # they are not already present. A layer2/layer3 method is required on every
  # batch, so the GUI cannot create a batch until at least one method exists to
  # select. -n never overwrites, so operator-added methods are preserved.
  STARTERS="$SCRIPT_DIR/services/server/starters"
  for L in layer2 layer3; do
    if [ -d "$STARTERS/$L" ]; then
      $SUDO sh -c "cp -n '$STARTERS/$L'/* '/var/lib/pssid/plugins/$L/' 2>/dev/null" || true
    fi
  done
  ok "Layer 2 / layer 3 starter methods seeded"
  if [ ! -x /usr/lib/exec/pssid/provision ]; then
    warn "No provision binary at /usr/lib/exec/pssid/provision."
    info "The GUI runs fine without it, but provisioning to probes needs your"
    info "Ansible-based provision script there (see docs/deployment.md)."
  fi
else
  info "Non-Linux host detected; skipping /var/lib/pssid setup (dev mode)."
fi

# ─── 8. Bring the stack up ───────────────────────────────────────────────────
step "Starting the stack"
COMPOSE_ARGS=""
[ "$SSO" = "true" ] && COMPOSE_ARGS="--profile sso"
BUILD_FLAG=""; [ "$DO_BUILD" = "true" ] && BUILD_FLAG="--build"
# shellcheck disable=SC2086
EDITION="$EDITION" $COMPOSE -f docker-compose.yml $COMPOSE_ARGS up -d $BUILD_FLAG
ok "Containers started"

# ─── 9. Health check ─────────────────────────────────────────────────────────
step "Waiting for the server to become healthy"
HEALTH_URL="http://localhost:8000/api/health"
HEALTHY="false"
for i in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then HEALTHY="true"; break; fi
  sleep 2
  printf "  ${C_DIM}…still starting (%s/30)${C_RESET}\r" "$i"
done
echo
if [ "$HEALTHY" = "true" ]; then
  ok "Server is healthy"
else
  warn "Health check did not pass in time. Recent server logs:"
  $COMPOSE -f docker-compose.yml logs --tail=40 server || true
fi

# ─── Done ────────────────────────────────────────────────────────────────────
printf "\n${C_GREEN}${C_BOLD}Deployment complete.${C_RESET}\n"
printf "  ${C_BOLD}URL:${C_RESET}   %s\n" "$BASE_URL"
printf "  ${C_BOLD}Edition:${C_RESET} %s\n" "$EDITION"
printf "  ${C_BOLD}SSO:${C_RESET}   %s\n" "$SSO"
[ "$TLS" = "self-signed" ] && printf "  ${C_DIM}(self-signed cert; your browser will warn. Choose Advanced, then Proceed.)${C_RESET}\n"
printf "\n  Manage with: ${C_CYAN}make up${C_RESET} | ${C_CYAN}make down${C_RESET} | ${C_CYAN}make logs${C_RESET} | ${C_CYAN}make doctor${C_RESET}\n\n"
