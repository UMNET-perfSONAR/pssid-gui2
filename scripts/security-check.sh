#!/usr/bin/env bash
#
# Verify the security posture of a RUNNING deployment.
#
# Everything here is checked from the outside, the way an auditor or an attacker
# would see it, plus the few host-side facts that matter (file permissions,
# container privileges). A hardening setting that is present in a config file but
# not in effect on the live site is worth nothing, and this is the difference.
#
#   Usage:  bash scripts/security-check.sh [BASE_URL]
#           make security-check
#
# Exit status: 0 if every check passed, 1 if any FAILED. Warnings do not fail the
# run: they flag a posture that is legitimate in some deployments (a self-signed
# certificate in a lab, open writes on an access-controlled network) but should
# never be a surprise.

set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || exit 1

if [ -t 1 ]; then
  R='\033[31m'; G='\033[32m'; Y='\033[33m'; D='\033[2m'; B='\033[1m'; N='\033[0m'
else
  R=''; G=''; Y=''; D=''; B=''; N=''
fi

PASS=0; FAIL=0; WARN=0
FAILED_NAMES=()

pass() { PASS=$((PASS+1)); printf "  ${G}ok${N}   %s\n" "$1"; }
fail() { FAIL=$((FAIL+1)); FAILED_NAMES+=("$1"); printf "  ${R}FAIL${N} %s\n" "$1"; [ -n "${2:-}" ] && printf "       ${D}%s${N}\n" "$2"; }
warn() { WARN=$((WARN+1)); printf "  ${Y}warn${N} %s\n" "$1"; [ -n "${2:-}" ] && printf "       ${D}%s${N}\n" "$2"; }
note() { printf "  ${D}%s${N}\n" "$1"; }
head2() { printf "\n${B}%s${N}\n" "$1"; }

# ─── Where to test ───────────────────────────────────────────────────────────
# Default to the hostname the deployment was installed with, so the checks run
# against the same origin real users reach. Fall back to localhost.
BASE="${1:-}"
if [ -z "$BASE" ] && [ -f services/server/.env ]; then
  BASE="$(sed -n 's/^BASE_URL=//p' services/server/.env | head -n1)"
fi
BASE="${BASE:-https://localhost}"
BASE="${BASE%/}"
HOST="${BASE#*://}"; HOST="${HOST%%/*}"; HOST="${HOST%%:*}"

printf "${B}Security check: %s${N}\n" "$BASE"

# Is this the local development stack rather than a deployment?
#
# It matters because the dev stack legitimately serves plain HTTP through
# nginx.local.conf, which deliberately carries none of the production TLS policy
# or security headers. Reporting those as failures would be accurate and useless:
# a dozen expected red lines is exactly how a check gets ignored, and then the one
# that matters is ignored with it. So they are reported as notes here, and the
# production configuration is validated separately by `nginx -t` in CI.
#
# Detected from the running IMAGES, not from the URL and not from the compose
# file. Two wrong ways to do this, both tried:
#
#   * By URL: a real deployment misconfigured onto plain HTTP would then excuse
#     itself, which is precisely the finding that must not be excused.
#   * By `docker compose -f docker-compose.local.yml ps`: Compose identifies a
#     project by its DIRECTORY name, not by the file it was given, so that
#     command lists the PRODUCTION containers just as happily. Verified: with the
#     production stack up it returned all seven. Every production check would
#     have been downgraded to a note on a live deployment.
#
# The image tag cannot be confused: only docker-compose.local.yml builds
# *_client-dev / *_server-dev.
DEV_STACK=false
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if docker ps --format '{{.Image}}' 2>/dev/null | grep -q -e '_server-dev:' -e '_client-dev:'; then
    DEV_STACK=true
  fi
fi
if [ "$DEV_STACK" = true ]; then
  printf "  ${C_DEV:-}${Y}Development stack detected${N} (docker-compose.local.yml is running).\n"
  printf "  ${D}Transport and header checks are reported as notes: the dev stack serves${N}\n"
  printf "  ${D}plain HTTP by design. Run this against a real deployment to gate on them.${N}\n"
fi

# In dev, a production-only expectation is a note rather than a failure.
prod_only() { # prod_only "<name>" "<detail>"
  if [ "$DEV_STACK" = true ]; then note "n/a on the dev stack: $1"; else fail "$1" "${2:-}"; fi
}

# -k: a self-signed certificate is a supported configuration, and is reported as
# its own check below rather than aborting every other one.
CURL="curl -sS -k --max-time 15"

head2 "Reachability"
if ! $CURL -o /dev/null "$BASE/api/health" 2>/dev/null; then
  fail "the deployment answers at $BASE" "Is the stack up? Try: make ps"
  printf "\n${R}Cannot continue without a reachable deployment.${N}\n\n"
  exit 1
fi
pass "the deployment answers at $BASE"

# ─── Transport ───────────────────────────────────────────────────────────────
head2 "Transport"

if [ "${BASE%%:*}" = "https" ]; then
  # -servername is NOT optional here, and leaving it off is a trap this script
  # fell into: without SNI, nginx hands the connection to the default server,
  # which sets ssl_reject_handshake and answers every version with an
  # `unrecognized_name` alert. Every probe below then "passes" -- including on a
  # server that happily speaks TLS 1.0 -- because the handshake failed for an
  # entirely unrelated reason. A check that cannot fail is worse than no check.
  SNI="-servername ${HOST}"
  tls_probe() { openssl s_client -connect "${HOST}:443" $SNI "-$1" </dev/null >/dev/null 2>&1; }

  # Confirm the probe itself works before trusting what it reports.
  if ! tls_probe tls1_2 && ! tls_probe tls1_3; then
    fail "the TLS probe can reach the server" \
      "Neither TLS 1.2 nor 1.3 negotiated for SNI ${HOST}. The version checks below would be meaningless, so they are skipped."
  else
    # Deprecated by RFC 8996. A server that still negotiates them undermines
    # everything above it.
    for proto in tls1 tls1_1; do
      case "$proto" in tls1) label="1.0" ;; tls1_1) label="1.1" ;; esac
      if tls_probe "$proto"; then
        fail "TLS ${label} is refused" "The server negotiated a deprecated protocol version."
      else
        pass "TLS ${label} is refused"
      fi
    done
    tls_probe tls1_2 \
      && pass "TLS 1.2 is available" \
      || warn "TLS 1.2 did not negotiate" "Only 1.3? That is stricter than required, and fine."
    # Forward secrecy: a key compromise later must not decrypt traffic captured
    # today, so the negotiated suite has to be ECDHE.
    NEG="$(openssl s_client -connect "${HOST}:443" $SNI </dev/null 2>/dev/null | grep -m1 'Cipher *:' | awk '{print $3}')"
    case "$NEG" in
      ECDHE*|TLS_*) pass "the negotiated cipher is forward-secret (${NEG})" ;;
      "")           warn "could not read the negotiated cipher" ;;
      *)            fail "the negotiated cipher is forward-secret" "Negotiated ${NEG}, which is not ECDHE." ;;
    esac
  fi

  # A self-signed certificate is legitimate for a lab, but HSTS must then stay
  # off, so which one is in use decides whether the next check is a failure.
  if curl -sS --max-time 15 -o /dev/null "$BASE/api/health" 2>/dev/null; then
    CA_ISSUED=true;  pass "the certificate is trusted by this host's CA store"
  else
    CA_ISSUED=false; warn "the certificate is NOT CA-trusted (self-signed)" \
      "Fine for a lab. Browsers will warn, and HSTS must stay off."
  fi
else
  CA_ISSUED=false
  prod_only "the site is served over HTTPS" \
    "$BASE is plain HTTP. SSO cannot work: the session cookie is Secure-only."
fi

# ─── Security headers ────────────────────────────────────────────────────────
head2 "Response headers"
HEADERS="$($CURL -D - -o /dev/null "$BASE/" 2>/dev/null | tr -d '\r')"
have_header() { printf '%s' "$HEADERS" | grep -qi "^$1:"; }

for h in Content-Security-Policy X-Content-Type-Options Referrer-Policy \
         X-Frame-Options Permissions-Policy Cross-Origin-Opener-Policy; do
  have_header "$h" \
    && pass "$h is sent" \
    || prod_only "$h is sent" "Missing from the response for $BASE/"
done

# Exactly one of each: nginx hides the upstream's copies (proxy_hide_header) so a
# browser never sees two conflicting values, which some discard entirely.
for h in X-Frame-Options Referrer-Policy Content-Security-Policy; do
  count="$(printf '%s' "$HEADERS" | grep -ci "^$h:")"
  if [ "${count:-0}" -gt 1 ]; then
    fail "$h is sent exactly once" "Sent $count times; conflicting duplicates are resolved inconsistently by browsers."
  elif [ "${count:-0}" -eq 1 ]; then
    pass "$h is sent exactly once"
  fi
done

if printf '%s' "$HEADERS" | grep -qi "^Content-Security-Policy:.*frame-ancestors 'none'"; then
  pass "CSP forbids framing (frame-ancestors 'none')"
else
  prod_only "CSP forbids framing" "frame-ancestors 'none' not found in the policy."
fi

if have_header Strict-Transport-Security; then
  if [ "$CA_ISSUED" = true ]; then
    pass "HSTS is sent (CA-issued certificate)"
  else
    fail "HSTS is NOT sent with an untrusted certificate" \
      "HSTS makes certificate errors non-bypassable: every user is locked out for the whole max-age."
  fi
else
  if [ "$CA_ISSUED" = true ]; then
    warn "HSTS is not sent" "The certificate is trusted, so HSTS is safe here. Set HSTS_ENABLED=true and use --tls=letsencrypt."
  else
    pass "HSTS is correctly withheld (untrusted certificate)"
  fi
fi

# The version banner turns a CVE announcement into a list of hosts worth trying.
if printf '%s' "$HEADERS" | grep -qiE '^Server:.*[0-9]+\.[0-9]+'; then
  fail "no software version in the Server header" "$(printf '%s' "$HEADERS" | grep -i '^Server:')"
else
  pass "no software version in the Server header"
fi
have_header X-Powered-By && fail "X-Powered-By is suppressed" || pass "X-Powered-By is suppressed"

# ─── Host handling ───────────────────────────────────────────────────────────
head2 "Host handling"
# nginx should refuse a Host it does not serve, rather than generating links or
# redirects for an attacker-chosen name.
UNKNOWN="$($CURL -o /dev/null -w '%{http_code}' -H 'Host: not-this-deployment.example' "$BASE/api/health" 2>/dev/null || echo "000")"
# What "refused" looks like differs by listener, and both are correct:
#   000/444  the plain-HTTP default server drops the connection outright.
#   404      the HTTPS listener. Its default server sets ssl_reject_handshake and
#            so cannot serve HTTP at all, and nginx answers 404 rather than
#            dropping a connection whose TLS handshake already completed.
#   421      Misdirected Request.
# The thing that matters is that the application never answers for a Host it does
# not serve, so 200 is the failure -- content served under an attacker-chosen
# hostname, from which the app would also generate links and redirects.
case "$UNKNOWN" in
  000|444|421|404)
    pass "an unrecognised Host header is refused (HTTP ${UNKNOWN/000/none})" ;;
  200)
    # prod_only, like the header and TLS expectations above: nginx.local.conf
    # deliberately omits the strict default server, and says so in a comment.
    # Adding one there is not free -- it would answer 444 for a developer
    # reaching the stack as http://127.0.0.1:8888 rather than localhost -- so on
    # the dev stack this is a note. On a real deployment it stays a failure: the
    # app serving content under an attacker-chosen hostname is exactly what
    # enforceSameOrigin's CSRF reasoning assumes nginx has already prevented.
    prod_only "an unrecognised Host header is refused" \
      "The application answered 200 for Host: not-this-deployment.example. Check server_name and the default server in nginx.conf." ;;
  *)
    warn "an unrecognised Host header returned HTTP $UNKNOWN" \
      "Not obviously wrong, but check server_name in nginx.conf." ;;
esac

# ─── Cache and API behaviour ─────────────────────────────────────────────────
head2 "API"
UI_HEADERS="$($CURL -D - -o /dev/null "$BASE/api/userinfo" 2>/dev/null | tr -d '\r')"
printf '%s' "$UI_HEADERS" | grep -qi '^Cache-Control:.*no-store' \
  && pass "API responses are marked no-store" \
  || fail "API responses are marked no-store" "/api/userinfo may be cached by a shared proxy."

# An unknown API path must not return an HTML error page or a stack trace.
NOT_FOUND="$($CURL "$BASE/api/definitely-not-a-route" 2>/dev/null)"
if printf '%s' "$NOT_FOUND" | grep -q '"message"'; then
  pass "unknown API paths return JSON, not HTML"
else
  fail "unknown API paths return JSON" "Got: $(printf '%s' "$NOT_FOUND" | head -c 120)"
fi
printf '%s' "$NOT_FOUND" | grep -qiE 'at [A-Za-z]+\.|node_modules|\.ts:[0-9]+' \
  && fail "no stack trace in error responses" || pass "no stack trace in error responses"

# ─── Authentication and authorization ────────────────────────────────────────
head2 "Access control"
USERINFO="$($CURL "$BASE/api/userinfo" 2>/dev/null)"
SSO_ON=false
printf '%s' "$USERINFO" | grep -q '"sso_enabled":true' && SSO_ON=true

CODE_READ="$($CURL -o /dev/null -w '%{http_code}' "$BASE/api/hosts" 2>/dev/null)"

# Probe write access WITHOUT writing anything.
#
# The payload is deliberately invalid (no name), and the controller validates the
# name before it touches the database, while authorize('write') runs before the
# controller. So the status alone distinguishes the two cases with no side effect:
#
#   403  the write was refused          -> no access
#   400  the request reached validation -> access granted, nothing written
#
# An earlier version posted a real host named security-check-probe and deleted it
# afterwards. On a deployment with auto-provision enabled that is not a read-only
# check at all: the create fires a debounced Ansible run that pushes a config
# containing a bogus host to every real probe, and the delete fires another. A
# security check must never change the thing it is inspecting.
CODE_WRITE="$($CURL -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{}' "$BASE/api/hosts/create-host" 2>/dev/null)"

if [ "$SSO_ON" = true ] || [ "$CODE_READ" = "401" ]; then
  note "single sign-on is ENABLED"
  [ "$CODE_READ" = "401" ] \
    && pass "unauthenticated reads are refused (401)" \
    || fail "unauthenticated reads are refused" "GET /api/hosts returned $CODE_READ, expected 401."
  if [ "$CODE_WRITE" = "401" ] || [ "$CODE_WRITE" = "403" ]; then
    pass "unauthenticated writes are refused ($CODE_WRITE)"
  else
    fail "unauthenticated writes are refused" "POST returned $CODE_WRITE, expected 401 or 403."
  fi
  printf '%s' "$($CURL "$BASE/api/hosts" 2>/dev/null)" | grep -q 'login_url' \
    && pass "the 401 carries a sign-in URL the interface can use" \
    || warn "the 401 carries no login_url" "The interface cannot start the sign-in flow automatically."
  # A 302 to the provider here would be unusable to the browser's fetch().
  REDIR="$($CURL -o /dev/null -w '%{http_code}' "$BASE/api/hosts" 2>/dev/null)"
  [ "$REDIR" = "302" ] && fail "API calls are not redirected to the provider" \
    "A cross-origin redirect cannot be followed by fetch() with credentials." \
    || pass "API calls are not redirected to the provider"
else
  note "single sign-on is DISABLED"
  warn "single sign-on is not enabled" "Anyone who can reach $BASE is unauthenticated. See docs/deployment.md#single-sign-on."
  if [ "$CODE_WRITE" = "403" ]; then
    pass "unauthenticated writes are refused (read-only deployment)"
  else
    # 400 means the request got past authorization and into validation, i.e. a
    # well-formed one would have been accepted. Nothing was created either way.
    warn "unauthenticated writes are ACCEPTED (OPEN_WRITE=true)" \
      "Anyone who can reach $BASE can change the probe configuration. Restrict at the network layer or enable SSO."
  fi
fi

# ─── CSRF ────────────────────────────────────────────────────────────────────
head2 "Cross-origin protection"
# Same invalid payload as above: this must be refused before it reaches any
# handler, but if the CSRF guard were ever removed it must still not write.
CSRF="$($CURL -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -H 'Origin: https://evil.example' \
  -d '{}' "$BASE/api/hosts/create-host" 2>/dev/null)"
[ "$CSRF" = "403" ] \
  && pass "a write from a foreign Origin is refused (403)" \
  || fail "a write from a foreign Origin is refused" "Got $CSRF, expected 403."

# A wildcard here would let any site a signed-in user visits read this API.
ACAO="$($CURL -D - -o /dev/null -H 'Origin: https://evil.example' "$BASE/api/userinfo" 2>/dev/null \
  | tr -d '\r' | grep -i '^Access-Control-Allow-Origin:' || true)"
if [ -z "$ACAO" ]; then
  pass "no CORS headers are sent to a foreign origin"
elif printf '%s' "$ACAO" | grep -q '\*'; then
  fail "CORS does not allow any origin" "$ACAO"
else
  pass "CORS is restricted to a single origin"
fi

# ─── Rate limiting ───────────────────────────────────────────────────────────
head2 "Rate limiting"
LIMITED=false
for _ in $(seq 1 40); do
  [ "$($CURL -o /dev/null -w '%{http_code}' "$BASE/api/health" 2>/dev/null)" = "429" ] && { LIMITED=true; break; }
done
if [ "$LIMITED" = true ]; then
  pass "the API rate-limits a burst"
else
  # 40 requests is well inside the configured ceiling, so this is expected;
  # the presence of the standard headers is the real evidence.
  $CURL -D - -o /dev/null "$BASE/api/health" 2>/dev/null | tr -d '\r' | grep -qi '^RateLimit' \
    && pass "the API advertises rate-limit headers" \
    || warn "no rate-limit headers seen" "Check RATE_LIMIT_* and that nginx forwards X-Forwarded-For."
fi

# ─── Host-side facts ─────────────────────────────────────────────────────────
head2 "Host configuration"
if [ -f services/server/.env ]; then
  PERM="$(stat -c '%a' services/server/.env 2>/dev/null || stat -f '%Lp' services/server/.env 2>/dev/null || echo '?')"
  case "$PERM" in
    600|640) pass "services/server/.env is mode $PERM" ;;
    '?')     warn "could not read the mode of services/server/.env" ;;
    *)       prod_only "services/server/.env is mode $PERM" \
               "It holds the OIDC client secret, the session secret and the database password. Expected 600 or 640." ;;
  esac
  SECRET_LEN="$(sed -n 's/^SECRET=//p' services/server/.env | head -n1 | tr -d '\n' | wc -c)"
  if [ "${SECRET_LEN:-0}" -ge 32 ]; then
    pass "SECRET is ${SECRET_LEN} characters"
  else
    prod_only "SECRET is long enough" \
      "${SECRET_LEN} characters; 32 or more are required to sign session cookies safely."
  fi
  # Only meaningful when SSO is on; without it the server never connects to Redis.
  if [ "$SSO_ON" = true ]; then
    grep -q '^REDIS_URL=redis://:[^@]\+@' services/server/.env \
      && pass "the Redis session store requires a password" \
      || fail "the Redis session store requires a password" \
           "Anything reaching Redis could read or forge a signed-in session."
  fi
else
  note "services/server/.env not present here (checking a remote deployment?)"
fi

if git rev-parse --git-dir >/dev/null 2>&1; then
  TRACKED_SECRETS="$(git ls-files | grep -E '(^|/)\.env$|\.pem$|\.key$' || true)"
  [ -z "$TRACKED_SECRETS" ] \
    && pass "no secrets or private keys are tracked in git" \
    || fail "no secrets are tracked in git" "$TRACKED_SECRETS"
fi

# ─── Containers ──────────────────────────────────────────────────────────────
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  head2 "Container privileges"
  for c in $(docker compose ps --format '{{.Name}}' 2>/dev/null); do
    INSPECT="$(docker inspect "$c" --format '{{.HostConfig.SecurityOpt}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.Privileged}}|{{.HostConfig.CapDrop}}|{{.HostConfig.ReadonlyRootfs}}' 2>/dev/null || true)"
    [ -z "$INSPECT" ] && continue
    IFS='|' read -r SECOPT PIDS PRIV CAPDROP READONLY <<< "$INSPECT"
    [ "$PRIV" = "false" ] || fail "$c is not privileged" "Running --privileged."
    printf '%s' "$SECOPT" | grep -q 'no-new-privileges' \
      && pass "$c: no-new-privileges" \
      || fail "$c: no-new-privileges" "Not set; a setuid binary in the image could escalate."
    # pids_limit and cap_drop are production-only: the dev stack runs the watch
    # toolchain (more processes) on the full build images, and deliberately
    # carries only no-new-privileges. See docker-compose.local.yml.
    if [ "$DEV_STACK" = true ]; then
      continue
    fi
    [ "${PIDS:-0}" -gt 0 ] 2>/dev/null \
      && pass "$c: pids limit ${PIDS}" \
      || warn "$c: no pids limit" "A fork bomb in this container could exhaust the host."
    # Without this, code execution inside a container becomes persistence: a
    # payload can be dropped, application files rewritten, and both survive a
    # restart.
    [ "$READONLY" = "true" ] \
      && pass "$c: read-only root filesystem" \
      || warn "$c: root filesystem is writable" "Set read_only:true with tmpfs for the paths it genuinely needs."
    case "$c" in
      *client*|*server*)
        printf '%s' "$CAPDROP" | grep -qi 'ALL' \
          && pass "$c: all capabilities dropped" \
          || warn "$c: capabilities not fully dropped" "This service needs none." ;;
    esac
  done
else
  note "docker not available here; skipping container privilege checks"
fi

# ─── Result ──────────────────────────────────────────────────────────────────
printf "\n${B}%s${N}  ${G}%d passed${N}, ${R}%d failed${N}, ${Y}%d warnings${N}\n" "Result:" "$PASS" "$FAIL" "$WARN"
if [ "$FAIL" -gt 0 ]; then
  printf "\n${R}Failed:${N}\n"
  for n in "${FAILED_NAMES[@]}"; do printf "  - %s\n" "$n"; done
  printf "\n"
  exit 1
fi
printf "\n${G}No failures.${N} Review any warnings above: each is legitimate in some\n"
printf "deployments, but none should be a surprise.\n\n"
