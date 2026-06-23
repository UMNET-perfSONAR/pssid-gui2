#!/bin/bash
# Demo data seeder for pSSID GUI.
#
# Inserts a coherent set of sample objects (schedules, SSID profiles, tests,
# archivers, jobs, batches, hosts, host groups) with the relations wired up, plus
# a realistic ~3-week provisioning-history log so every page, including the
# dashboard, Fleet Health, and Fleet Intelligence, shows meaningful data.
#
# This is DEMO data, not production config. Safe to re-run: it removes the docs it
# owns (by name, and history by caller "demo@seed") before re-inserting. It never
# touches the mongo_db volume otherwise and never drops the database.
#
# Usage (on the host running the stack):  bash scripts/seed-demo.sh
set -euo pipefail

DB_NAME="gui"
MONGO_CONTAINER="$(docker ps --filter "name=mongo" --format '{{.Names}}' | head -n1)"
if [ -z "$MONGO_CONTAINER" ]; then
  echo "Could not find a running mongo container." >&2
  exit 1
fi

echo "Seeding demo data into '$DB_NAME' via container '$MONGO_CONTAINER'..."

docker exec -i "$MONGO_CONTAINER" mongosh --quiet "$DB_NAME" <<'EOF'
// ---- idempotent cleanup of previous demo data -------------------------------
const DEMO_CALLER = 'demo@seed';
const demoNames = {
  schedules:     ['every-5-min', 'hourly', 'nightly'],
  ssid_profiles: ['MWireless', 'eduroam', 'MGuest'],
  tests:         ['http-google', 'ping-gateway', 'dns-resolve', 'throughput-iperf'],
  archivers:     ['rabbitmq-archive'],
  jobs:          ['connectivity-suite', 'throughput-suite'],
  batches:       ['edge-batch', 'core-batch'],
  hosts:         ['rp-bbb-01', 'rp-eecs-02', 'rp-union-03', 'rp-li-04', 'rp-pierpont-05'],
  host_groups:   ['campus-edge', 'campus-core'],
};
for (const [coll, names] of Object.entries(demoNames)) {
  db.getCollection(coll).deleteMany({ name: { $in: names } });
}
db.provision_history.deleteMany({ caller: DEMO_CALLER });

// ---- leaf objects -----------------------------------------------------------
const sIds = db.schedules.insertMany([
  { name: 'every-5-min', repeat: '*/5 * * * *' },
  { name: 'hourly',      repeat: '0 * * * *' },
  { name: 'nightly',     repeat: '0 2 * * *' },
]).insertedIds;

const pIds = db.ssid_profiles.insertMany([
  { name: 'MWireless', SSID: 'MWireless', min_signal: -73 },
  { name: 'eduroam',   SSID: 'eduroam',   min_signal: -75 },
  { name: 'MGuest',    SSID: 'MGuest',    min_signal: -78 },
]).insertedIds;

const tIds = db.tests.insertMany([
  { name: 'http-google',      type: 'http',       spec: { url: 'www.google.com' } },
  { name: 'ping-gateway',     type: 'rtt',        spec: { dest: '141.211.144.1' } },
  { name: 'dns-resolve',      type: 'dns',        spec: { query: 'umich.edu' } },
  { name: 'throughput-iperf', type: 'throughput', spec: { dest: 'perfsonar.umich.edu' } },
]).insertedIds;

db.archivers.insertOne({
  name: 'rabbitmq-archive',
  archiver: 'rabbitmq',
  data: { '_url': 'amqp://elastic:elastic@pssid-elk.miserver.it.umich.edu', 'routing-key': 'pscheduler_raw' },
});

// ---- jobs (reference tests by name + id) ------------------------------------
const jIds = db.jobs.insertMany([
  { name: 'connectivity-suite', parallel: true,  continue_if: true,
    tests: ['http-google', 'ping-gateway', 'dns-resolve'], test_ids: [tIds[0], tIds[1], tIds[2]] },
  { name: 'throughput-suite',   parallel: false, continue_if: true,
    tests: ['throughput-iperf'], test_ids: [tIds[3]] },
]).insertedIds;

// ---- batches (wire jobs, schedules, SSID profiles, connection methods) ------
const bIds = db.batches.insertMany([
  { name: 'edge-batch', priority: 10, test_interface: 'wlan0',
    ssid_profiles: ['MWireless', 'eduroam'], ssid_profile_ids: [pIds[0], pIds[1]],
    schedules: ['every-5-min', 'hourly'],    schedule_ids: [sIds[0], sIds[1]],
    jobs: ['connectivity-suite'],            job_ids: [jIds[0]],
    layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client', script: '' },
  { name: 'core-batch', priority: 20, test_interface: 'eth0',
    ssid_profiles: ['MWireless'], ssid_profile_ids: [pIds[0]],
    schedules: ['nightly'],       schedule_ids: [sIds[2]],
    jobs: ['throughput-suite', 'connectivity-suite'], job_ids: [jIds[1], jIds[0]],
    layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client', script: '' },
]).insertedIds;

// ---- hosts (one left unconfigured for contrast) -----------------------------
const hIds = db.hosts.insertMany([
  { name: 'rp-bbb-01',      batches: ['edge-batch'],               batch_ids: [bIds[0]],          data: [] },
  { name: 'rp-eecs-02',     batches: ['edge-batch'],               batch_ids: [bIds[0]],          data: [] },
  { name: 'rp-union-03',    batches: ['core-batch'],               batch_ids: [bIds[1]],          data: [] },
  { name: 'rp-li-04',       batches: ['edge-batch', 'core-batch'], batch_ids: [bIds[0], bIds[1]], data: [] },
  { name: 'rp-pierpont-05', batches: [],                           batch_ids: [],                 data: [] },
]).insertedIds;

// ---- host groups ------------------------------------------------------------
db.host_groups.insertMany([
  { name: 'campus-edge', batches: ['edge-batch'], batch_ids: [bIds[0]],
    hosts: ['rp-bbb-01', 'rp-eecs-02', 'rp-li-04'], host_ids: [hIds[0], hIds[1], hIds[3]],
    hosts_regex: '', data: [] },
  { name: 'campus-core', batches: ['core-batch'], batch_ids: [bIds[1]],
    hosts: ['rp-union-03', 'rp-li-04'], host_ids: [hIds[2], hIds[3]],
    hosts_regex: '', data: [] },
]);

// ---- provisioning history: ~3 weeks so Fleet Health/Intelligence have signal -
// Per-host profile drives the demo story: healthy, degrading (anomaly), critical,
// and a stale probe whose newest event is well in the past.
const DAY = 86400000;
const now = Date.now();
const profiles = {
  'rp-bbb-01':      { base: 0.04, recentBad: false, stale: false },  // healthy
  'rp-eecs-02':     { base: 0.10, recentBad: false, stale: false },  // mostly healthy
  'rp-union-03':    { base: 0.12, recentBad: true,  stale: false },  // drifting worse (anomaly)
  'rp-li-04':       { base: 0.55, recentBad: true,  stale: false },  // critical
  'rp-pierpont-05': { base: 0.03, recentBad: false, stale: true  },  // healthy but stale
};
const errors = ['SSH timeout to probe', 'Ansible task failed: wpa_supplicant',
                'pScheduler unreachable', 'DHCP lease failed'];
const EVENTS_PER_HOST = 18;
const events = [];
for (const [host, p] of Object.entries(profiles)) {
  for (let i = 0; i < EVENTS_PER_HOST; i++) {
    // Newest event (i=0) is "now" for active hosts; the stale host's newest is ~10 days old.
    const ageDays = p.stale ? (10 + i * 0.7) : (i * (21 / EVENTS_PER_HOST));
    let failProb = p.base;
    if (p.recentBad && ageDays < 5) failProb = Math.min(0.9, p.base + 0.5);
    const success = Math.random() > failProb;
    const ev = {
      timestamp: new Date(now - ageDays * DAY),
      caller: DEMO_CALLER,
      caller_role: 'demo',
      target_name: host,
      click_context: (i % 4 === 0) ? 'auto' : 'host',
      trigger: (i % 4 === 0) ? 'auto' : 'manual',
      success,
    };
    if (!success) ev.error = errors[i % errors.length];
    events.push(ev);
  }
}
db.provision_history.insertMany(events);

// ---- summary ----------------------------------------------------------------
print('Seeded:');
for (const coll of ['schedules', 'ssid_profiles', 'tests', 'archivers', 'jobs', 'batches', 'hosts', 'host_groups']) {
  print('  ' + coll.padEnd(15) + db.getCollection(coll).countDocuments());
}
print('  provision_history (demo) ' + db.provision_history.countDocuments({ caller: DEMO_CALLER }));
EOF

echo ""
echo "Done. Refresh the GUI (every page should now be populated)."
