#!/bin/bash
# Config-generation demo seeder for pSSID GUI.
#
# Unlike scripts/seed-demo.sh (which populates the GUI's *display* pages with
# loosely-shaped sample data), this seeder inserts objects in the EXACT shape the
# config generator (build_config_payload) and the pSSID daemon consume, so that
# `GET /api/provision/preview` produces a clean, daemon-valid pssid_config.json on
# the first try. Use this when you want to demonstrate / verify the generated
# config file.
#
# Key shape requirements baked in here (from the daemon contract):
#   - test.spec is an ARRAY of form elements ({type,name,value} | {type,selected}
#     | {key,value}), because formatTestSpec() iterates it. A plain object crashes
#     config generation.
#   - job.parallel is the STRING "True"; the field is "continue-if" (hyphen),
#     value a STRING "true"/"false".
#   - every batch carries priority, test_interface, ssid_profiles, schedules, jobs.
#   - schedules use "repeat" with a 5-field cron string.
#
# Usage (on the host running the stack):  bash scripts/seed-config-demo.sh
set -euo pipefail

DB_NAME="gui"
MONGO_CONTAINER="$(docker ps --filter "name=mongo" --format '{{.Names}}' | head -n1)"
if [ -z "$MONGO_CONTAINER" ]; then
  echo "Could not find a running mongo container. Start the stack first (make dev or make up)." >&2
  exit 1
fi

echo "Seeding config-demo data into '$DB_NAME' via container '$MONGO_CONTAINER'..."

docker exec -i "$MONGO_CONTAINER" mongosh --quiet "$DB_NAME" <<'EOF'
// ---- idempotent cleanup of previous config-demo data ------------------------
const demoNames = {
  schedules:     ['every-5-min', 'hourly', 'nightly'],
  ssid_profiles: ['MWireless', 'eduroam', 'MGuest'],
  tests:         ['http-google', 'ping-gateway', 'dns-resolve', 'throughput-iperf'],
  jobs:          ['connectivity-suite', 'throughput-suite'],
  batches:       ['edge-batch', 'core-batch'],
  hosts:         ['rp-bbb-01', 'rp-eecs-02', 'rp-union-03', 'rp-li-04'],
  host_groups:   ['campus-edge', 'campus-core'],
};
for (const [coll, names] of Object.entries(demoNames)) {
  db.getCollection(coll).deleteMany({ name: { $in: names } });
}

// ---- schedules: {name, repeat} with 5-field cron ----------------------------
db.schedules.insertMany([
  { name: 'every-5-min', repeat: '*/5 * * * *' },
  { name: 'hourly',      repeat: '0 * * * *'   },
  { name: 'nightly',     repeat: '0 2 * * *'   },
]);

// ---- ssid_profiles: name is required; extra fields are ignored by daemon ----
db.ssid_profiles.insertMany([
  { name: 'MWireless', ssid: 'MWireless', min_signal: -73 },
  { name: 'eduroam',   ssid: 'eduroam',   min_signal: -75 },
  { name: 'MGuest',    ssid: 'MGuest',    min_signal: -78 },
]);

// ---- tests: spec is an ARRAY of form elements (what formatTestSpec expects) --
//   text/number/float -> {type, name, value};  singleselect -> {type, name, selected:{name}}
db.tests.insertMany([
  { name: 'http-google', type: 'http', spec: [
      { type: 'text', name: 'url', value: 'www.google.com' },
  ]},
  { name: 'ping-gateway', type: 'rtt', spec: [
      { type: 'text',         name: 'dest',     value: '141.211.144.1' },
      { type: 'number',       name: 'length',   value: 512 },
      { type: 'singleselect', name: 'protocol', selected: { name: 'TCP' } },
  ]},
  { name: 'dns-resolve', type: 'dns', spec: [
      { type: 'text', name: 'query', value: 'umich.edu' },
  ]},
  { name: 'throughput-iperf', type: 'throughput', spec: [
      { type: 'text', name: 'dest', value: 'perfsonar.umich.edu' },
  ]},
]);

// ---- jobs: parallel "True" (string), "continue-if" hyphen + string value ----
db.jobs.insertMany([
  { name: 'connectivity-suite', parallel: 'True', 'continue-if': 'true',
    backoff: 'PT1S', tests: ['http-google', 'ping-gateway', 'dns-resolve'] },
  { name: 'throughput-suite',   parallel: 'True', 'continue-if': 'false',
    backoff: 'PT1S', tests: ['throughput-iperf'] },
]);

// ---- batches: priority, test_interface, ssid_profiles, schedules, jobs -------
//   (layer2/layer3_script are inert for the daemon; archivers added by the
//    generator. Two SSIDs on edge-batch satisfies "more than one SSID".)
db.batches.insertMany([
  { name: 'edge-batch', priority: 10, test_interface: 'wlan0',
    ssid_profiles: ['MWireless', 'eduroam'], schedules: ['every-5-min', 'hourly'],
    jobs: ['connectivity-suite'],
    layer2_script: '', layer3_script: '', script: '' },
  { name: 'core-batch', priority: 20, test_interface: 'wlan0',
    ssid_profiles: ['MWireless', 'MGuest'], schedules: ['nightly'],
    jobs: ['throughput-suite', 'connectivity-suite'],
    layer2_script: '', layer3_script: '', script: '' },
]);

// ---- hosts: name, batches, data (object) ------------------------------------
db.hosts.insertMany([
  { name: 'rp-bbb-01',   batches: ['edge-batch'],               data: {} },
  { name: 'rp-eecs-02',  batches: ['edge-batch'],               data: {} },
  { name: 'rp-union-03', batches: ['core-batch'],               data: {} },
  { name: 'rp-li-04',    batches: ['edge-batch', 'core-batch'], data: {} },
]);

// ---- host groups: name, batches, hosts, hosts_regex, data --------------------
db.host_groups.insertMany([
  { name: 'campus-edge', batches: ['edge-batch'],
    hosts: ['rp-bbb-01', 'rp-eecs-02', 'rp-li-04'], hosts_regex: [], data: {} },
  { name: 'campus-core', batches: ['core-batch'],
    hosts: ['rp-union-03', 'rp-li-04'], hosts_regex: [], data: {} },
]);

// ---- summary ----------------------------------------------------------------
print('Seeded (config-demo):');
for (const coll of ['schedules', 'ssid_profiles', 'tests', 'jobs', 'batches', 'hosts', 'host_groups']) {
  print('  ' + coll.padEnd(15) + db.getCollection(coll).countDocuments());
}
EOF

echo ""
echo "Done. Now generate the config with:"
echo "  curl -sk https://localhost:8888/api/provision/preview | jq -r '.proposed.config' > pssid_config.json"
echo "(or whatever host/port your stack runs on)"
