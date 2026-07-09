#!/bin/bash
# Canonical demo data seeder for pSSID GUI.
#
# Inserts a coherent set of sample objects (schedules, SSID profiles, tests,
# jobs, batches, hosts, host groups, and settings) with the relations wired up.
# The inserted rows match the current GUI forms and the config generator, so the
# demo can be used both for clicking through the app and for previewing
# pssid_config.json.
#
# This is DEMO data, not production config. Safe to re-run: it removes the docs it
# owns (by name) before re-inserting. It never touches the mongo_db volume
# otherwise and never drops the database.
#
# Usage (on the host running the stack):  bash scripts/seed-demo.sh
set -euo pipefail

DB_NAME="gui"
MONGO_CONTAINER="$(docker ps --filter "name=mongo" --format '{{.Names}}' | head -n1)"
if [ -z "$MONGO_CONTAINER" ]; then
  echo "Could not find a running mongo container. Start the stack first (make dev or make up)." >&2
  exit 1
fi

echo "Seeding demo data into '$DB_NAME' via container '$MONGO_CONTAINER'..."

docker exec -i "$MONGO_CONTAINER" mongosh --quiet "$DB_NAME" <<'EOF'
// ---- idempotent cleanup of previous demo data -------------------------------
const demoNames = {
  schedules:     [
    'Every 5 minutes', 'Every 1 hour', 'Every 4 hours', 'Every day at 23:00',
    // Legacy demo names from older seed scripts; clean them up on re-run.
    // These are cleanup keys only, not the current displayed default schedules.
    'Every hour', 'every 5 minutes', 'every hour', 'every 4 hours', 'every day at 23:00',
    'every-5-min', 'hourly', 'nightly', 'every day at 16:00'
  ],
  ssid_profiles: [
    'MWireless', 'eduroam', 'MGuest',
    // Legacy demo names from older seed scripts; clean them up on re-run.
    'campus-wifi', 'guest-wifi'
  ],
  tests:         ['http-google', 'ping-gateway', 'dns-resolve', 'throughput-iperf'],
  // The archivers feature was removed from the GUI; purge the legacy demo doc so
  // old demo stacks do not keep a dead collection around.
  archivers:     ['rabbitmq-archive'],
  jobs:          ['connectivity-suite', 'throughput-suite'],
  batches:       [
    'edge-batch', 'core-batch',
    // Legacy leftover from the 'campus-wifi' era; the profile it references is
    // deleted by the cleanup above, so leaving this batch behind strands a
    // dangling reference that blocks config generation.
    'main-batch'
  ],
  hosts:         [
    'probe-library-01', 'probe-labs-02', 'probe-union-03', 'probe-dorms-04', 'probe-annex-05',
    // Legacy demo names from older seed scripts; clean them up on re-run.
    'rp-bbb-01', 'rp-eecs-02', 'rp-union-03', 'rp-li-04', 'rp-pierpont-05'
  ],
  host_groups:   ['campus-edge', 'campus-core'],
};
for (const [coll, names] of Object.entries(demoNames)) {
  db.getCollection(coll).deleteMany({ name: { $in: names } });
}
// Legacy dashboard/history demo data from older seed scripts.
db.provision_history.deleteMany({ caller: 'demo@seed' });

// ---- leaf objects -----------------------------------------------------------
const sIds = db.schedules.insertMany([
  { name: 'Every 5 minutes',    repeat: '*/5 * * * *' },
  { name: 'Every 1 hour',       repeat: '0 * * * *' },
  { name: 'Every 4 hours',      repeat: '0 */4 * * *' },
  { name: 'Every day at 23:00', repeat: '0 23 * * *' },
]).insertedIds;

const pIds = db.ssid_profiles.insertMany([
  { name: 'MWireless', SSID: 'MWireless', layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' },
  { name: 'eduroam',   SSID: 'eduroam',   layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' },
  { name: 'MGuest',    SSID: 'MGuest',    layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' },
]).insertedIds;

const tIds = db.tests.insertMany([
  { name: 'http-google',      type: 'http',       spec: [
      { type: 'text', name: 'url',     value: 'www.google.com' },
      { type: 'text', name: 'timeout', value: 'PT10S' },
  ] },
  { name: 'ping-gateway',     type: 'rtt',        spec: [
      { type: 'text',         name: 'dest',     value: '192.0.2.1' },
      { type: 'number',       name: 'length',   value: 512 },
      { type: 'singleselect', name: 'protocol', selected: { name: 'TCP' } },
  ] },
  { name: 'dns-resolve',      type: 'dns',        spec: [
      { type: 'text',         name: 'nameserver', value: '8.8.8.8' },
      { type: 'singleselect', name: 'record',     selected: { name: 'A' } },
      { key: 'query', value: 'example.edu' },
  ] },
  { name: 'throughput-iperf', type: 'throughput', spec: [ { type: 'text', name: 'dest',  value: 'perfsonar.example.edu' } ] },
]).insertedIds;

// ---- jobs (reference tests by name + id) ------------------------------------
const jIds = db.jobs.insertMany([
  { name: 'connectivity-suite', parallel: 'True', 'continue-if': 'true', backoff: 'PT1S',
    tests: ['http-google', 'ping-gateway', 'dns-resolve'], test_ids: [tIds[0], tIds[1], tIds[2]] },
  { name: 'throughput-suite',   parallel: 'True', 'continue-if': 'true', backoff: 'PT1S',
    tests: ['throughput-iperf'], test_ids: [tIds[3]] },
]).insertedIds;

// ---- batches (wire jobs, schedules, SSID profiles) --------------------------
const bIds = db.batches.insertMany([
  { name: 'edge-batch', priority: 10, test_interface: 'wlan0',
    ssid_profiles: ['MWireless', 'eduroam'], ssid_profile_ids: [pIds[0], pIds[1]],
    schedules: ['Every 5 minutes', 'Every 1 hour'],  schedule_ids: [sIds[0], sIds[1]],
    jobs: ['connectivity-suite'],            job_ids: [jIds[0]] },
  { name: 'core-batch', priority: 20, test_interface: 'wlan0',
    ssid_profiles: ['MWireless'], ssid_profile_ids: [pIds[0]],
    schedules: ['Every day at 23:00'],       schedule_ids: [sIds[3]],
    jobs: ['throughput-suite', 'connectivity-suite'], job_ids: [jIds[1], jIds[0]] },
]).insertedIds;

// ---- hosts (one left unconfigured for contrast) -----------------------------
const hIds = db.hosts.insertMany([
  { name: 'probe-library-01', batches: ['edge-batch'],               batch_ids: [bIds[0]],          data: { site: 'library' } },
  { name: 'probe-labs-02',    batches: ['edge-batch'],               batch_ids: [bIds[0]],          data: { site: 'labs' } },
  { name: 'probe-union-03',   batches: ['core-batch'],               batch_ids: [bIds[1]],          data: { site: 'union' } },
  { name: 'probe-dorms-04',   batches: ['edge-batch', 'core-batch'], batch_ids: [bIds[0], bIds[1]], data: { site: 'dorms' } },
  { name: 'probe-annex-05',   batches: [],                           batch_ids: [],                 data: { site: 'annex' } },
]).insertedIds;

// ---- host groups ------------------------------------------------------------
db.host_groups.insertMany([
  { name: 'campus-edge', batches: ['edge-batch'], batch_ids: [bIds[0]],
    hosts: ['probe-library-01', 'probe-labs-02', 'probe-dorms-04'], host_ids: [hIds[0], hIds[1], hIds[3]],
    hosts_regex: [], data: { region: 'edge' } },
  { name: 'campus-core', batches: ['core-batch'], batch_ids: [bIds[1]],
    hosts: ['probe-union-03', 'probe-dorms-04'], host_ids: [hIds[2], hIds[3]],
    hosts_regex: [], data: { region: 'core' } },
]);

// ---- settings ---------------------------------------------------------------
db.settings.updateOne({ key: 'global' }, { $set: { autoProvision: false } }, { upsert: true });

// ---- summary ----------------------------------------------------------------
print('Seeded:');
for (const coll of ['schedules', 'ssid_profiles', 'tests', 'jobs', 'batches', 'hosts', 'host_groups']) {
  print('  ' + coll.padEnd(15) + db.getCollection(coll).countDocuments());
}
EOF

echo ""
echo "Done. Refresh the GUI, then open Settings > Provisioning tools to preview the generated config."
