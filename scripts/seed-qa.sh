#!/bin/bash
# QA dataset for pSSID GUI: the pre-load plus the metadata/batch-assignment
# scenario agreed with Rayan.
#
# Starts from everything scripts/seed-defaults.sh loads (same schedules, eduroam,
# the google http/rtt tests, job-comprehensive, batch-comprehensive, and the
# "all"/"rpi4" groups) and adds on top:
#
#   - MWireless SSID profile
#   - test-http-to-MWireless: an http test whose url is the metadata reference
#     $dest, resolved per host from that host's metadata
#   - job-MWagree:    simulates a captive-portal visit (fetches $dest)
#   - job-MWireless:  QA-only MWireless suite (http to MWireless, http to
#     Google, rtt to Google)
#   - BatchMW: priority 1 (lower than batch-comprehensive's 0), test interface
#     $ifacename, MWireless, jobs job-MWagree + job-comprehensive, scheduled
#     hourly plus every 5 minutes for faster QA turnaround
#   - two Raspberry Pi probe hosts (names below)
#
# and wires the four assignment paths the QA run is meant to exercise:
#
#   1. group batch via REGEX:      "all" (.*) carries batch-comprehensive, so
#                                  every host picks it up through the regex
#   2. group hosts via SELECTION:  "rpi4" lists both probes by name, so the
#                                  group metadata ifacename=wlan0 reaches them
#                                  (which is what $ifacename resolves to)
#   3. HOST-level batch:           probe 1 carries BatchMW directly
#   4. HOST-level metadata:        probe 1 carries dest=<MW dest>, which
#                                  test-http-to-MWireless resolves via $dest
#
# Probe names and the MWireless destination are overridable; the probe names
# MUST match the probes' real hostnames or the daemon exits on them:
#
#   PSSID_QA_PROBE1=<hostname> PSSID_QA_PROBE2=<hostname> \
#   PSSID_QA_MW_DEST=<url> bash scripts/seed-qa.sh
#
# Safe to re-run: it removes the docs it owns (by name) before inserting,
# including the probes a previous run put in the rpi4 group, so renaming the
# probes does not leave stale hosts behind.
set -euo pipefail

DB_NAME="gui"

# The two Raspberry Pi 4 probes. Override with the real probe hostnames; the
# daemon on a probe exits if its own hostname is not in the generated config.
PSSID_QA_PROBE1="${PSSID_QA_PROBE1:-rpi4-probe-01}"
PSSID_QA_PROBE2="${PSSID_QA_PROBE2:-rpi4-probe-02}"
# Destination for the MWireless http test, stored as host metadata `dest` on
# probe 1 and referenced by the test as $dest.
PSSID_QA_MW_DEST="${PSSID_QA_MW_DEST:-www.umich.edu}"

# Values are passed into mongosh via the environment (never spliced into the
# script), so validate them only for sanity: host-name characters for probes,
# no whitespace for the destination.
for v in "$PSSID_QA_PROBE1" "$PSSID_QA_PROBE2"; do
  if ! [[ "$v" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
    echo "Invalid probe hostname: '$v'" >&2
    exit 1
  fi
done
if [[ -z "$PSSID_QA_MW_DEST" || "$PSSID_QA_MW_DEST" =~ [[:space:]] ]]; then
  echo "Invalid PSSID_QA_MW_DEST: '$PSSID_QA_MW_DEST'" >&2
  exit 1
fi

MONGO_CONTAINER="$(docker ps --filter "name=mongo" --format '{{.Names}}' | head -n1)"
if [ -z "$MONGO_CONTAINER" ]; then
  echo "Could not find a running mongo container. Start the stack first (make dev or make up)." >&2
  exit 1
fi

echo "Seeding QA data into '$DB_NAME' via container '$MONGO_CONTAINER'..."
echo "  probes: $PSSID_QA_PROBE1, $PSSID_QA_PROBE2   MW dest: $PSSID_QA_MW_DEST"

docker exec -i \
  -e PSSID_QA_PROBE1="$PSSID_QA_PROBE1" \
  -e PSSID_QA_PROBE2="$PSSID_QA_PROBE2" \
  -e PSSID_QA_MW_DEST="$PSSID_QA_MW_DEST" \
  "$MONGO_CONTAINER" mongosh --quiet "$DB_NAME" <<'EOF'
const PROBE1 = process.env.PSSID_QA_PROBE1;
const PROBE2 = process.env.PSSID_QA_PROBE2;
const MW_DEST = process.env.PSSID_QA_MW_DEST;

// ---- idempotent cleanup of the docs this script owns -------------------------
// Superset of the pre-load's names (this dataset contains the pre-load), plus
// the QA-only objects and probes.
const ownedNames = {
  schedules:     [
    'Every 5 minutes', 'Every 1 hour', 'Every 4 hours', 'Every day at 23:00',
    // Earlier wordings of the same defaults; removed on re-run so a reseed
    // upgrades an existing database instead of duplicating schedules.
    'Every hour', 'every 5 minutes', 'every hour', 'every 4 hours', 'every day at 23:00', 'every day at 16:00'
  ],
  ssid_profiles: [
    'eduroam', 'MWireless',
    // Earlier starter names; removed on re-run.
    'MWireless1', 'MWireless2', 'campus-wifi', 'guest-wifi'
  ],
  tests:         [
    'test-http-to-google', 'test-rtt-to-google', 'test-http-to-MWireless',
    // Earlier starter test; removed on re-run.
    'throughput-by-metadata'
  ],
  jobs:          ['job-comprehensive', 'job-MWagree', 'job-MWireless'],
  batches:       ['batch-comprehensive', 'BatchMW'],
  host_groups:   ['all', 'rpi4'],
  hosts:         [PROBE1, PROBE2],
};
// Also own the probes a previous QA run placed in the rpi4 group, so re-running
// with different probe names does not leave stale hosts behind.
const previousRpi4 = db.host_groups.findOne({ name: 'rpi4' });
ownedNames.hosts.push(...(previousRpi4?.hosts ?? []));
// The example_script test type was retired: also delete any tests saved with
// that type, whatever they were named, so they cannot linger in jobs.
const exampleScriptTests = db.tests.find({ type: 'example_script' })
  .toArray().map((t) => t.name);
ownedNames.tests.push(...exampleScriptTests);
for (const [coll, ns] of Object.entries(ownedNames)) {
  if (ns.length > 0) db.getCollection(coll).deleteMany({ name: { $in: ns } });
}

// ---- schedules (same as the pre-load) ------------------------------------------
const sIds = db.schedules.insertMany([
  { name: 'Every 5 minutes',    repeat: '*/5 * * * *' },
  { name: 'Every 1 hour',       repeat: '0 * * * *' },
  { name: 'Every 4 hours',      repeat: '0 */4 * * *' },
  { name: 'Every day at 23:00', repeat: '0 23 * * *' },
]).insertedIds;

// ---- SSID profiles: eduroam (pre-load) + MWireless (QA) --------------------------
const pIds = db.ssid_profiles.insertMany([
  { name: 'eduroam',   SSID: 'eduroam',   layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' },
  { name: 'MWireless', SSID: 'MWireless', layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' },
]).insertedIds;

// ---- tests: the pre-load pair + the MWireless http test --------------------------
// test-http-to-MWireless's url is the metadata reference $dest: the daemon
// substitutes it per host from that host's effective metadata (probe 1 below
// carries dest at the HOST level).
const tIds = db.tests.insertMany([
  { name: 'test-http-to-google',    type: 'http', spec: [
      { type: 'text', name: 'url',     value: 'www.google.com' },
      { type: 'text', name: 'timeout', value: 'PT10S' },
  ] },
  { name: 'test-rtt-to-google',     type: 'rtt',  spec: [
      { type: 'text',         name: 'dest',     value: 'www.google.com' },
      { type: 'number',       name: 'length',   value: 512 },
      { type: 'singleselect', name: 'protocol', selected: { name: 'TCP' } },
  ] },
  { name: 'test-http-to-MWireless', type: 'http', spec: [
      { type: 'text', name: 'url',     value: '$dest' },
      { type: 'text', name: 'timeout', value: 'PT10S' },
  ] },
]).insertedIds;

// ---- jobs -------------------------------------------------------------------------
// job-comprehensive: same as the pre-load.
// job-MWagree:       simulates a captive-portal visit (the "agree" page) by
//                    fetching the host-resolved $dest.
// job-MWireless:     QA-only MWireless suite; kept unattached so QA can assign
//                    it deliberately in the GUI.
const jIds = db.jobs.insertMany([
  { name: 'job-comprehensive', parallel: 'True', 'continue-if': 'true', backoff: 'PT1S',
    tests: ['test-http-to-google', 'test-rtt-to-google'], test_ids: [tIds[0], tIds[1]] },
  { name: 'job-MWagree',       parallel: 'True', 'continue-if': 'true', backoff: 'PT1S',
    tests: ['test-http-to-MWireless'],                    test_ids: [tIds[2]] },
  { name: 'job-MWireless',     parallel: 'True', 'continue-if': 'true', backoff: 'PT1S',
    tests: ['test-http-to-MWireless', 'test-http-to-google', 'test-rtt-to-google'],
    test_ids: [tIds[2], tIds[0], tIds[1]] },
]).insertedIds;

// ---- batches ------------------------------------------------------------------------
// batch-comprehensive: the pre-load batch, assigned to the "all" group below.
// BatchMW: the HOST-level batch for probe 1. Priority 1 = lower than
// batch-comprehensive's 0. Runs hourly, plus every 5 minutes so QA does not
// have to wait an hour per iteration; drop the 5-minute schedule when done.
const bIds = db.batches.insertMany([
  { name: 'batch-comprehensive', priority: 0, test_interface: '$ifacename',
    ssid_profiles: ['eduroam'],   ssid_profile_ids: [pIds[0]],
    schedules: ['Every 1 hour'],  schedule_ids: [sIds[1]],
    jobs: ['job-comprehensive'],  job_ids: [jIds[0]] },
  { name: 'BatchMW',             priority: 1, test_interface: '$ifacename',
    ssid_profiles: ['MWireless'], ssid_profile_ids: [pIds[1]],
    schedules: ['Every 1 hour', 'Every 5 minutes'], schedule_ids: [sIds[1], sIds[0]],
    jobs: ['job-MWagree', 'job-comprehensive'],     job_ids: [jIds[1], jIds[0]] },
]).insertedIds;

// ---- hosts: the two Raspberry Pi probes ------------------------------------------------
// Probe 1 exercises the HOST level of both assignment mechanisms: it carries
// BatchMW directly (the host batch) and the metadata dest=<MW dest> that
// test-http-to-MWireless resolves via $dest.
const hIds = db.hosts.insertMany([
  { name: PROBE1, batches: ['BatchMW'], batch_ids: [bIds[1]], data: { dest: MW_DEST } },
  { name: PROBE2, batches: [],          batch_ids: [],        data: {} },
]).insertedIds;

// ---- host groups -------------------------------------------------------------------------
// "all" exercises the REGEX path: no hosts listed, ".*" matches every host, and
// the group carries batch-comprehensive, so every probe should pick it up
// through the regex alone.
// "rpi4" exercises the SELECTION path: both probes listed by name, which is
// also what delivers the group metadata ifacename=wlan0 to them (group
// metadata only reaches hosts listed by name, not regex matches).
db.host_groups.insertMany([
  { name: 'all',  batches: ['batch-comprehensive'], batch_ids: [bIds[0]],
    hosts: [], host_ids: [],
    hosts_regex: ['.*'], data: {} },
  { name: 'rpi4', batches: [], batch_ids: [],
    hosts: [PROBE1, PROBE2], host_ids: [hIds[0], hIds[1]],
    hosts_regex: [], data: { ifacename: 'wlan0' } },
]);

// ---- scrub dangling references left by the cleanup ------------------------------
// The deleteMany calls at the top are raw removals; unlike the GUI's delete
// handlers they do not scrub the arrays that reference the deleted names. The
// QA documents are recreated above with clean references, but any OTHER
// document (hand-made in the GUI) that referenced a removed name would be left
// pointing at nothing, which blocks config generation. Remove every reference
// to a cleaned-up name that was not recreated, keeping the parallel *_ids
// arrays in step.
const dead = {};
for (const coll of Object.keys(ownedNames)) {
  dead[coll] = ownedNames[coll].filter(n => !db.getCollection(coll).findOne({ name: n }));
}
const scrub = (coll, field, idField, deadNames) => {
  if (deadNames.length === 0) return;
  db.getCollection(coll).find().forEach((doc) => {
    const names = doc[field];
    if (!Array.isArray(names)) return;
    const keep = [], keepIds = [];
    names.forEach((n, i) => {
      if (deadNames.includes(n)) return;
      keep.push(n);
      if (Array.isArray(doc[idField]) && i < doc[idField].length) keepIds.push(doc[idField][i]);
    });
    if (keep.length !== names.length) {
      const set = { [field]: keep };
      if (Array.isArray(doc[idField])) set[idField] = keepIds;
      db.getCollection(coll).updateOne({ _id: doc._id }, { $set: set });
      print('  scrubbed ' + (names.length - keep.length) + ' dangling ' + field + ' reference(s) from ' + coll + ' "' + doc.name + '"');
    }
  });
};
scrub('hosts',       'batches',       'batch_ids',        dead.batches);
scrub('host_groups', 'batches',       'batch_ids',        dead.batches);
scrub('host_groups', 'hosts',         'host_ids',         dead.hosts);
scrub('batches',     'ssid_profiles', 'ssid_profile_ids', dead.ssid_profiles);
scrub('batches',     'schedules',     'schedule_ids',     dead.schedules);
scrub('batches',     'jobs',          'job_ids',          dead.jobs);
scrub('jobs',        'tests',         'test_ids',         dead.tests);

// ---- summary ---------------------------------------------------------------------
print('QA seed complete:');
for (const coll of ['schedules', 'ssid_profiles', 'tests', 'jobs', 'batches', 'hosts', 'host_groups']) {
  print('  ' + coll.padEnd(15) + db.getCollection(coll).countDocuments());
}
EOF

# ---- retire the example_script test TYPE (template file) -------------------------
# Same cleanup as the pre-load script; see the note there.
SERVER_CONTAINER="$(docker ps --filter "name=server" --format '{{.Names}}' | head -n1)"
if [ -n "$SERVER_CONTAINER" ]; then
  docker exec "$SERVER_CONTAINER" rm -f plugins/tests/example_script.json \
    && echo "Removed retired test type example_script from '$SERVER_CONTAINER' (if present)."
else
  echo "WARNING: no running server container found; could not remove the retired" >&2
  echo "example_script test type. It will be removed on the next server container start." >&2
fi

echo ""
echo "Done. The QA scenario is wired as follows:"
echo "  1. group batch via regex:     'all' (.*) carries batch-comprehensive"
echo "  2. group hosts via selection: 'rpi4' lists $PSSID_QA_PROBE1 + $PSSID_QA_PROBE2"
echo "     by name, delivering group metadata ifacename=wlan0 (used by \$ifacename)"
echo "  3. host-level batch:          $PSSID_QA_PROBE1 carries BatchMW"
echo "  4. host-level metadata:       $PSSID_QA_PROBE1 carries dest=$PSSID_QA_MW_DEST"
echo "     (used by test-http-to-MWireless via \$dest)"
echo ""
echo "job-MWireless is seeded but deliberately unattached; assign it in the GUI"
echo "when QA needs it. Verify with Settings > Provisioning tools > Preview, and"
echo "per host with the 'Probe configuration' panel on the Hosts page."
echo ""
echo "NOTE: the probe host names must exactly match the probes' hostnames"
echo "(override with PSSID_QA_PROBE1/PSSID_QA_PROBE2). The daemon on a probe"
echo "exits if its hostname is not present in the deployed config."
