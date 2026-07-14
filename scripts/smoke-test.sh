#!/usr/bin/env bash
#
# End-to-end smoke test: walks through every action a user can take in the
# GUI, against a RUNNING stack, using the exact API calls the interface makes.
#
#   Usage:  scripts/smoke-test.sh [BASE_URL]      (default http://localhost:8888)
#           make smoke                             (dev stack)
#           make smoke SMOKE_URL=https://host -k   (prod stack)
#
# It creates its own objects (prefixed smoke-), exercises create/read/update/
# delete on every collection, the settings endpoint, and the config preview,
# then removes everything it created. Exit code 0 means every check passed.

set -u
BASE="${1:-http://localhost:8888}"
CURL="curl -sSk"
PASS=0; FAIL=0; FAILED_NAMES=()

if [ -t 1 ]; then G='\033[32m'; R='\033[31m'; D='\033[2m'; N='\033[0m'; else G=''; R=''; D=''; N=''; fi

check() { # check "name" expected_status actual_status [body_regex] [body]
  local name="$1" want="$2" got="$3" regex="${4:-}" body="${5:-}"
  if [ "$got" = "$want" ] && { [ -z "$regex" ] || printf '%s' "$body" | grep -Eq "$regex"; }; then
    PASS=$((PASS+1)); printf "  ${G}ok${N}   %s\n" "$name"
  else
    FAIL=$((FAIL+1)); FAILED_NAMES+=("$name")
    printf "  ${R}FAIL${N} %s (status %s, wanted %s)\n" "$name" "$got" "$want"
    [ -n "$body" ] && printf "       ${D}%.200s${N}\n" "$body"
  fi
}

req() { # req METHOD path [json] -> sets STATUS and BODY
  local method="$1" path="$2" data="${3:-}"
  local args=(-X "$method" -H 'Content-Type: application/json' -w '\n%{http_code}')
  [ -n "$data" ] && args+=(-d "$data")
  local out; out="$($CURL "${args[@]}" "$BASE$path")"
  STATUS="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
}

echo "Smoke test against $BASE"
echo

# ---- Health ------------------------------------------------------------------
req GET /api/health
check "health endpoint reports ok" 200 "$STATUS" '"status":"ok"' "$BODY"

# ---- Write access canary -------------------------------------------------------
# The suite exercises create/update/delete, so it needs a writable stack. Detect
# a read-only deployment up front and explain, instead of failing 30 checks.
req POST /api/schedules/create-schedule '{"name":"smoke-canary","repeat":"* * * * *"}'
if [ "$STATUS" = "403" ]; then
  printf "\n${R}The stack at %s is read-only (writes return 403).${N}\n" "$BASE"
  printf "For a local dev stack, set OPEN_WRITE: true in shared/config.ts (never commit it)\n"
  printf "or sign in with a write-enabled account when SSO is on, then re-run.\n"
  exit 2
fi
check "write access available (canary schedule)" 200 "$STATUS" '' "$BODY"
req DELETE /api/schedules/smoke-canary
check "canary cleanup" 200 "$STATUS" '' "$BODY"

# ---- Reads of every collection (what every page load does) --------------------
for p in hosts host-groups schedules ssid-profiles tests jobs batches; do
  req GET "/api/$p"
  check "GET /api/$p" 200 "$STATUS" '^\[' "$BODY"
done
req GET /api/tests/test-files;              check "test type templates list" 200 "$STATUS" '^\[' "$BODY"
req GET /api/layer-scripts/layer2-files;    check "layer 2 methods list" 200 "$STATUS" '^\[' "$BODY"
req GET /api/layer-scripts/layer3-files;    check "layer 3 methods list" 200 "$STATUS" '^\[' "$BODY"
req GET /api/layer-scripts/defaults;        check "layer method defaults" 200 "$STATUS" '' "$BODY"
req GET /api/settings;                      check "settings read" 200 "$STATUS" 'autoProvision' "$BODY"
req GET /api/nonexistent;                   check "unknown API path returns JSON 404" 404 "$STATUS" 'Not found' "$BODY"

# ---- Full user journey: build a working config from scratch -------------------
req POST /api/schedules/create-schedule '{"name":"smoke-schedule","repeat":"0 23 * * *"}'
check "create schedule" 200 "$STATUS" '' "$BODY"

req POST /api/ssid-profiles/create-ssidProfile '{"name":"smoke-ssid","SSID":"SmokeNet","layer2_script":"wpa_supplicant","layer3_script":"dhcp_client"}'
check "create SSID profile" 200 "$STATUS" '' "$BODY"

req POST /api/tests/create-test '{"name":"smoke-test-1","type":"latency","spec":[{"name":"dest","type":"text","value":"example.com"}]}'
check "create test" 200 "$STATUS" '' "$BODY"

req POST /api/jobs/create-job '{"name":"smoke-job","tests":["smoke-test-1"],"continue-if":"true","backoff":"PT1S"}'
check "create job" 200 "$STATUS" '' "$BODY"

req POST /api/batches/create-batch '{"name":"smoke-batch","test_interface":"wlan0","priority":0,"ssid_profiles":["smoke-ssid"],"jobs":["smoke-job"],"schedules":["smoke-schedule"]}'
check "create batch" 200 "$STATUS" '' "$BODY"

req POST /api/hosts/create-host '{"name":"smoke-probe-1","batches":["smoke-batch"],"data":{"iface":"wlan0"}}'
check "create host" 200 "$STATUS" '' "$BODY"

req POST /api/host-groups/create-hostgroup '{"name":"smoke-group","hosts":["smoke-probe-1"],"batches":["smoke-batch"],"data":{"site":"lab"},"hosts_regex":["smoke-.*"]}'
check "create host group" 200 "$STATUS" '' "$BODY"

# ---- Read back and verify presence --------------------------------------------
req GET /api/hosts;         check "created host listed" 200 "$STATUS" 'smoke-probe-1' "$BODY"
req GET /api/host-groups;   check "created group listed" 200 "$STATUS" 'smoke-group' "$BODY"
req GET /api/batches;       check "created batch listed" 200 "$STATUS" 'smoke-batch' "$BODY"
req GET /api/jobs/smoke-job;             check "single job read" 200 "$STATUS" 'smoke-job' "$BODY"
req GET /api/batches/smoke-batch;        check "single batch read" 200 "$STATUS" 'smoke-batch' "$BODY"
req GET /api/host-groups/smoke-group;    check "single group read" 200 "$STATUS" 'smoke-group' "$BODY"
req GET /api/ssid-profiles/smoke-ssid;   check "single SSID profile read" 200 "$STATUS" 'smoke-ssid' "$BODY"
req GET /api/hosts/smoke-probe-1;        check "single host read" 200 "$STATUS" 'smoke-probe-1' "$BODY"

# ---- Updates (what Edit + Update does) -----------------------------------------
req PUT /api/hosts/update-host '{"old_hostname":"smoke-probe-1","new_hostname":"smoke-probe-1","batches":["smoke-batch"],"data":{"iface":"wlan1"}}'
check "update host metadata" 200 "$STATUS" '' "$BODY"

req PUT /api/schedules/update-schedule '{"old_schedule":"smoke-schedule","new_schedule":"smoke-schedule","repeat":"30 6 * * *"}'
check "update schedule cron" 200 "$STATUS" '' "$BODY"

req PUT /api/jobs/update-job '{"old_job":"smoke-job","new_job":"smoke-job","continue-if":"true","tests":["smoke-test-1"],"backoff":"PT5S"}'
check "update job backoff" 200 "$STATUS" '' "$BODY"

req PUT /api/batches/update-batch '{"old_batchname":"smoke-batch","new_batchname":"smoke-batch","priority":2,"ssid_profiles":["smoke-ssid"],"schedules":["smoke-schedule"],"jobs":["smoke-job"],"test_interface":"wlan0"}'
check "update batch priority" 200 "$STATUS" '' "$BODY"

# ---- The config file: preview must include our objects and daemon fields ------
req GET /api/provision/preview
check "provision preview builds" 200 "$STATUS" '' "$BODY"
check "preview: host present with layered metadata"        200 "$STATUS" 'smoke-probe-1' "$BODY"
check "preview: batch present"                             200 "$STATUS" 'smoke-batch' "$BODY"
check "preview: ssid profile carries layer 2 method"       200 "$STATUS" 'wpa_supplicant' "$BODY"
check "preview: inventory carries the group section"       200 "$STATUS" 'smoke-group' "$BODY"
check "preview: metadata provenance block present"         200 "$STATUS" 'pssid_metadata' "$BODY"

# ---- Generate: write the validated files to disk (Settings > Configuration) -------
# Same build + daemon validation as preview, but this actually writes
# pssid_config.json + hosts.ini to the controller. The smoke objects are valid
# here, so the empty-array body (provision all, '*') must succeed with 200.
req POST /api/hosts/config '[]'
check "generate writes the config files" 200 "$STATUS" '' "$BODY"

# ---- Per-probe effective configuration -------------------------------------------
# The Hosts page shows what one probe will run, sliced from the same generated
# payload the daemon receives (batches via direct assignment and group
# membership, with schedules/jobs/tests/SSID profiles expanded).
req GET /api/hosts/host-config/smoke-probe-1
check "probe config includes its batch" 200 "$STATUS" '"smoke-batch"' "$BODY"
check "probe config lists its group" 200 "$STATUS" '"smoke-group"' "$BODY"
req GET /api/hosts/host-config/no-such-probe
check "probe config for unknown host returns 404" 404 "$STATUS" '' "$BODY"

# ---- Settings endpoint (persists the server-side autoProvision flag) -------------
# The GUI no longer exposes an auto-provision toggle, but the endpoint still
# round-trips the flag for the server-side auto-provision service, so it stays
# covered here.
req PUT /api/settings '{"autoProvision":true}'
check "settings write persists autoProvision=true" 200 "$STATUS" '' "$BODY"
req GET /api/settings
check "settings read back autoProvision=true" 200 "$STATUS" '"autoProvision":\s*true' "$BODY"
req PUT /api/settings '{"autoProvision":false}'
check "settings write persists autoProvision=false" 200 "$STATUS" '' "$BODY"

# ---- Validation must reject a config-breaking write -----------------------------
req POST /api/ssid-profiles/create-ssidProfile '{"name":"smoke-bad","SSID":"x","layer2_script":"../etc/passwd","layer3_script":"dhcp_client"}'
if [ "$STATUS" -ge 400 ]; then
  check "server rejects traversal in layer 2 method" "$STATUS" "$STATUS" '' ''
else
  # If it was accepted, the render-time sanitizer must strip it from the preview.
  req GET /api/provision/preview
  if printf '%s' "$BODY" | grep -q '\.\./etc/passwd'; then
    check "traversal value must never reach the generated config" 200 500 '' "$BODY"
  else
    check "traversal value stripped from generated config" 200 "$STATUS" '' ''
  fi
  req DELETE /api/ssid-profiles/smoke-bad
fi

# ---- API floor: field rules hold even for direct API calls ----------------------
# The forms enforce these client-side; the server must enforce the same rules so
# a hand-crafted request cannot store values the daemon would choke on.
req POST /api/batches/create-batch '{"name":"smoke-bad-batch","test_interface":"eth0.100","priority":0,"ssid_profiles":[],"jobs":[],"schedules":[]}'
check "server rejects dotted test interface" 400 "$STATUS" '' "$BODY"
req POST /api/batches/create-batch '{"name":"smoke-bad-batch","test_interface":"wlan0","priority":-1,"ssid_profiles":[],"jobs":[],"schedules":[]}'
check "server rejects negative priority" 400 "$STATUS" '' "$BODY"
req POST /api/jobs/create-job '{"name":"smoke-bad-job","tests":[],"backoff":"30 seconds","continue-if":"true"}'
check "server rejects non-ISO-8601 backoff" 400 "$STATUS" '' "$BODY"
req POST /api/jobs/create-job '{"name":"smoke-bad-job","tests":[],"backoff":"PT30S","continue-if":"(.a"}'
check "server rejects unbalanced continue-if" 400 "$STATUS" '' "$BODY"
req POST /api/ssid-profiles/create-ssidProfile '{"name":"smoke-bad-ssid","SSID":"0123456789012345678901234567890123","layer2_script":"wpa_supplicant","layer3_script":"dhcp_client"}'
check "server rejects SSID over 32 bytes" 400 "$STATUS" '' "$BODY"
req POST /api/hosts/create-host '{"name":"999.1.2.3","batches":[],"data":{}}'
check "server rejects mistyped IPv4 host" 400 "$STATUS" '' "$BODY"
req POST /api/host-groups/create-hostgroup '{"name":"smoke_bad_group","batches":[],"hosts":[],"hosts_regex":[],"data":{}}'
check "server rejects non-hostname group name" 400 "$STATUS" '' "$BODY"
req POST /api/tests/create-test '{"name":"smoke-bad-test","type":"no-such-template","spec":[]}'
check "server rejects unknown test type" 400 "$STATUS" '' "$BODY"

# ---- Reference scrubbing: deleting an object cleans up references to it ---------
# smoke-probe-1 and smoke-group still reference smoke-batch here; deleting the
# batch must remove it from both (otherwise the generated config would carry a
# dangling name and fail daemon validation).
req DELETE /api/batches/smoke-batch;           check "delete referenced batch" 200 "$STATUS" '' "$BODY"
req GET /api/hosts
if printf '%s' "$BODY" | grep -Eq '"name":"smoke-probe-1"[^]]*smoke-batch'; then
  FAIL=$((FAIL+1)); FAILED_NAMES+=("batch reference scrubbed from host")
  printf "  ${R}FAIL${N} batch reference scrubbed from host (still present)\n"
else
  PASS=$((PASS+1)); printf "  ${G}ok${N}   batch reference scrubbed from host\n"
fi
req GET /api/host-groups
if printf '%s' "$BODY" | grep -q 'smoke-batch'; then
  FAIL=$((FAIL+1)); FAILED_NAMES+=("batch reference scrubbed from group")
  printf "  ${R}FAIL${N} batch reference scrubbed from group (still present)\n"
else
  PASS=$((PASS+1)); printf "  ${G}ok${N}   batch reference scrubbed from group\n"
fi
# Recreate so the delete sequence below still exercises a fresh batch delete.
req POST /api/batches/create-batch '{"name":"smoke-batch","test_interface":"wlan0","priority":0,"ssid_profiles":["smoke-ssid"],"jobs":["smoke-job"],"schedules":["smoke-schedule"]}'
check "recreate batch for cleanup pass" 200 "$STATUS" '' "$BODY"

# ---- Deletes (cleanup is also the delete-path test) ------------------------------
req DELETE /api/hosts/smoke-probe-1;           check "delete host" 200 "$STATUS" '' "$BODY"
req DELETE /api/host-groups/smoke-group;       check "delete host group" 200 "$STATUS" '' "$BODY"
req DELETE /api/batches/smoke-batch;           check "delete batch" 200 "$STATUS" '' "$BODY"
req DELETE /api/jobs/smoke-job;                check "delete job" 200 "$STATUS" '' "$BODY"
req DELETE /api/tests/smoke-test-1;            check "delete test" 200 "$STATUS" '' "$BODY"
req DELETE /api/ssid-profiles/smoke-ssid;      check "delete SSID profile" 200 "$STATUS" '' "$BODY"
req DELETE /api/schedules/smoke-schedule;      check "delete schedule" 200 "$STATUS" '' "$BODY"

req GET /api/hosts
check "deleted host is gone" 200 "$STATUS" '' "$BODY"
if printf '%s' "$BODY" | grep -q 'smoke-probe-1'; then
  FAIL=$((FAIL+1)); FAILED_NAMES+=("deleted host is gone (still listed)")
  printf "  ${R}FAIL${N} deleted host still listed\n"
fi

# ---- Summary --------------------------------------------------------------------
echo
if [ "$FAIL" -eq 0 ]; then
  printf "${G}All %d checks passed.${N}\n" "$PASS"
  exit 0
else
  printf "${R}%d of %d checks failed:${N}\n" "$FAIL" "$((PASS+FAIL))"
  for n in "${FAILED_NAMES[@]}"; do printf "  ${R}- %s${N}\n" "$n"; done
  exit 1
fi
