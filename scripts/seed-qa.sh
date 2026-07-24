#!/bin/bash
# QA dataset for pSSID GUI. Layers ON TOP of scripts/seed-defaults.sh.
#
# ADDITIVE by design: this script owns only the documents listed below and never
# deletes, rewrites or resets anything the pre-load owns. The four schedules,
# eduroam, the two Google tests and job-comprehensive are reused by name, not
# recreated. The pre-load's "all" group keeps its regex and gains one batch.
#
# Run the pre-load FIRST (the Ansible role does this on a first install), then
# this. See docs/QA.md for the full walkthrough and expected output.
#
# What it ADDS:
#   - SSID profile:  MWireless (eduroam comes from the pre-load)
#   - tests:         test-http-to-external  (url $external_dest -> host metadata)
#                    test-http-to-example   (a second, different http target)
#                    test-rtt-to-external   (rtt, uses $external_dest)
#                    test-dns-to-external   (dns, exercises singleselect + a
#                                            user-defined optional key/value)
#                    test-trace-to-external (trace, uses $external_dest)
#   - jobs:          job-comprehensive-1  http only
#                    job-comprehensive-2  rtt + a different http test
#                    job-group-1          rtt
#                    job-host-1           rtt
#   - batches:       batch-comprehensive  priority 0  eduroam    (-> "all" group)
#                    batch-host           priority 1  MWireless  (UNASSIGNED)
#                    batch-group          priority 2  MWireless  (-> rpi4 group)
#   - hosts:         four probes, each with the SAME metadata key
#                    (external_dest) holding a DIFFERENT value
#   - host group:    rpi4 - every probe listed BY NAME (the GUI's "Select all",
#                    not a regex), carrying group metadata ifacename=wlan0
#
# PRIORITY: lower number = higher priority. All three batches share the "Every 5
# minutes" and "Every 1 hour" schedules so they COLLIDE on purpose; the probe
# should run batch-comprehensive (0) ahead of batch-host (1) ahead of
# batch-group (2). That collision is the point -- it is how QA checks priority.
#
# batch-host is deliberately left attached to NO host: assigning it to a probe
# through the GUI is a QA step, and the only thing that exercises the GUI's own
# host/batch assignment path (the seeders write to MongoDB directly).
#
# Probe names and the external destinations are overridable; when deploying to
# real probes the names MUST match their real hostnames or the daemon exits:
#
#   PSSID_QA_PROBE1=<hostname> ... PSSID_QA_PROBE4=<hostname> \
#   PSSID_QA_DEST1=<url> ... PSSID_QA_DEST4=<url> bash scripts/seed-qa.sh
#
# Safe to re-run: it removes only the documents it owns (by name, including
# probes a previous run put in the rpi4 group) before inserting them again.
set -euo pipefail

DB_NAME="gui"

# The lab probes. Neutral placeholders by default so no internal hostname is
# committed to this repository; override with the real names at run time.
PSSID_QA_PROBE1="${PSSID_QA_PROBE1:-rpi4-probe-01}"
PSSID_QA_PROBE2="${PSSID_QA_PROBE2:-rpi4-probe-02}"
PSSID_QA_PROBE3="${PSSID_QA_PROBE3:-rpi4-probe-03}"
PSSID_QA_PROBE4="${PSSID_QA_PROBE4:-rpi4-probe-04}"

# Same metadata KEY on every host, a DIFFERENT value per host. This is what
# $external_dest resolves to per probe, and checking that each probe gets its own
# value is one of the things QA verifies.
PSSID_QA_DEST1="${PSSID_QA_DEST1:-www.google.com}"
PSSID_QA_DEST2="${PSSID_QA_DEST2:-www.reddit.com}"
PSSID_QA_DEST3="${PSSID_QA_DEST3:-www.wikipedia.org}"
PSSID_QA_DEST4="${PSSID_QA_DEST4:-www.example.edu}"

# Values are passed into mongosh through the environment (never spliced into the
# script text), so validate them only for sanity.
for v in "$PSSID_QA_PROBE1" "$PSSID_QA_PROBE2" "$PSSID_QA_PROBE3" "$PSSID_QA_PROBE4"; do
  if ! [[ "$v" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
    echo "Invalid probe hostname: '$v'" >&2
    exit 1
  fi
done
for v in "$PSSID_QA_DEST1" "$PSSID_QA_DEST2" "$PSSID_QA_DEST3" "$PSSID_QA_DEST4"; do
  if [[ -z "$v" || "$v" =~ [[:space:]] ]]; then
    echo "Invalid external destination: '$v'" >&2
    exit 1
  fi
done

MONGO_CONTAINER="$(docker ps --filter "name=mongo" --format '{{.Names}}' | head -n1)"
if [ -z "$MONGO_CONTAINER" ]; then
  echo "Could not find a running mongo container. Start the stack first (make dev or make up)." >&2
  exit 1
fi

# Use credentials from .env when database authentication is enabled (the
# production installer generates them; the dev stack runs without auth). Same
# pattern as scripts/backup.sh.
AUTH=""
if [ -f .env ] && grep -q '^MONGO_PASSWORD=' .env; then
  MONGO_USERNAME="$(sed -n 's/^MONGO_USERNAME=//p' .env)"
  MONGO_PASSWORD="$(sed -n 's/^MONGO_PASSWORD=//p' .env)"
  if [ -n "$MONGO_PASSWORD" ]; then
    AUTH="-u $MONGO_USERNAME -p $MONGO_PASSWORD --authenticationDatabase admin"
  fi
fi

echo "Seeding QA data into '$DB_NAME' via container '$MONGO_CONTAINER'..."
echo "  probes: $PSSID_QA_PROBE1, $PSSID_QA_PROBE2, $PSSID_QA_PROBE3, $PSSID_QA_PROBE4"

# shellcheck disable=SC2086
docker exec -i \
  -e PSSID_QA_PROBE1="$PSSID_QA_PROBE1" \
  -e PSSID_QA_PROBE2="$PSSID_QA_PROBE2" \
  -e PSSID_QA_PROBE3="$PSSID_QA_PROBE3" \
  -e PSSID_QA_PROBE4="$PSSID_QA_PROBE4" \
  -e PSSID_QA_DEST1="$PSSID_QA_DEST1" \
  -e PSSID_QA_DEST2="$PSSID_QA_DEST2" \
  -e PSSID_QA_DEST3="$PSSID_QA_DEST3" \
  -e PSSID_QA_DEST4="$PSSID_QA_DEST4" \
  "$MONGO_CONTAINER" mongosh --quiet $AUTH "$DB_NAME" <<'EOF'
const PROBES = [
  process.env.PSSID_QA_PROBE1,
  process.env.PSSID_QA_PROBE2,
  process.env.PSSID_QA_PROBE3,
  process.env.PSSID_QA_PROBE4,
];
const DESTS = [
  process.env.PSSID_QA_DEST1,
  process.env.PSSID_QA_DEST2,
  process.env.PSSID_QA_DEST3,
  process.env.PSSID_QA_DEST4,
];

// ---- require the pre-load ------------------------------------------------------
// This dataset references eduroam and the four schedules by name instead of
// creating its own, so the pre-load must have run. Failing here with a clear
// message beats generating a config full of dangling references later.
const missing = [];
if (!db.ssid_profiles.findOne({ name: 'eduroam' })) missing.push('ssid_profile "eduroam"');
for (const s of ['Every 5 minutes', 'Every 1 hour']) {
  if (!db.schedules.findOne({ name: s })) missing.push('schedule "' + s + '"');
}
if (!db.host_groups.findOne({ name: 'all' })) missing.push('host_group "all"');
if (missing.length > 0) {
  print('ERROR: the pre-load data is missing: ' + missing.join(', '));
  print('Run   bash scripts/seed-defaults.sh   first, then re-run this script.');
  quit(1);
}

// ---- idempotent cleanup of ONLY the documents this script owns -------------------
// Nothing owned by the pre-load appears here: re-running must never reset the
// schedules, eduroam, the Google tests, job-comprehensive or the "all" group.
const ownedNames = {
  ssid_profiles: ['MWireless'],
  tests:         ['test-http-to-external', 'test-http-to-example',
                  'test-rtt-to-external', 'test-dns-to-external',
                  'test-trace-to-external',
                  // Earlier QA name for test-http-to-external; removed on re-run
                  // so an existing QA database upgrades cleanly.
                  'test-http-to-MWireless'],
  jobs:          ['job-comprehensive-1', 'job-comprehensive-2',
                  'job-group-1', 'job-host-1',
                  // Earlier QA job names.
                  'job-MWagree', 'job-MWireless'],
  batches:       ['batch-comprehensive', 'batch-host', 'batch-group',
                  // Earlier QA batch name.
                  'BatchMW'],
  host_groups:   ['rpi4'],
  hosts:         PROBES.slice(),
};
// Also own probes a previous run placed in rpi4, so renaming them leaves nothing
// stale behind.
const previousRpi4 = db.host_groups.findOne({ name: 'rpi4' });
if (previousRpi4 && Array.isArray(previousRpi4.hosts)) {
  for (const h of previousRpi4.hosts) ownedNames.hosts.push(h);
}
for (const [coll, ns] of Object.entries(ownedNames)) {
  if (ns.length > 0) db.getCollection(coll).deleteMany({ name: { $in: ns } });
}

// ---- SSID profile: MWireless ----------------------------------------------------
const mwId = db.ssid_profiles.insertOne(
  { name: 'MWireless', SSID: 'MWireless', layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' }
).insertedId;
const eduroamId = db.ssid_profiles.findOne({ name: 'eduroam' })._id;

// ---- tests ----------------------------------------------------------------------
// $external_dest is a METADATA REFERENCE: the daemon substitutes it per host from
// that host's effective metadata, so each probe tests its own destination. The key
// uses an underscore, not a hyphen: $-substitution stops at a hyphen, so
// "$external-dest" would resolve as "$external" followed by a literal "-dest".
//
// Between them these cover every spec field type the GUI can produce: text,
// number, singleselect, and a user-defined optional key/value pair (an entry with
// no "type", handled by formatTestSpec in config.service.ts).
const tIds = db.tests.insertMany([
  { name: 'test-http-to-external', type: 'http', spec: [
      { type: 'text', name: 'url',     value: '$external_dest' },
      { type: 'text', name: 'timeout', value: 'PT10S' },
  ] },
  { name: 'test-http-to-example',  type: 'http', spec: [
      { type: 'text', name: 'url',     value: 'www.example.edu' },
      { type: 'text', name: 'timeout', value: 'PT30S' },
  ] },
  { name: 'test-rtt-to-external',  type: 'rtt', spec: [
      { type: 'text',         name: 'dest',     value: '$external_dest' },
      { type: 'number',       name: 'length',   value: 1024 },
      { type: 'singleselect', name: 'protocol', selected: { name: 'UDP' } },
  ] },
  { name: 'test-dns-to-external',  type: 'dns', spec: [
      { type: 'text',         name: 'nameserver', value: '$external_dest' },
      { type: 'singleselect', name: 'record',     selected: { name: 'AAAA' } },
      // User-defined optional data: no "type", just key/value. Exercises the
      // final branch of formatTestSpec.
      { key: 'comment', value: 'qa-optional-field' },
  ] },
  { name: 'test-trace-to-external', type: 'trace', spec: [
      { type: 'text', name: 'dest', value: '$external_dest' },
  ] },
]).insertedIds;

// ---- jobs -------------------------------------------------------------------------
// job-comprehensive-1: http only, and the job that USES METADATA ($external_dest).
// job-comprehensive-2: rtt plus a DIFFERENT http test (a fixed target).
// job-group-1 / job-host-1: one rtt test each, so the three batches stay distinct
// in the generated config and are easy to tell apart when checking priority.
const jIds = db.jobs.insertMany([
  { name: 'job-comprehensive-1', parallel: 'True',  'continue-if': 'true',  backoff: 'PT1S',
    tests: ['test-http-to-external'],                     test_ids: [tIds[0]] },
  { name: 'job-comprehensive-2', parallel: 'False', 'continue-if': 'false', backoff: 'PT5S',
    tests: ['test-rtt-to-external', 'test-http-to-example'],
    test_ids: [tIds[2], tIds[1]] },
  { name: 'job-group-1',         parallel: 'True',  'continue-if': 'true',  backoff: 'PT1S',
    tests: ['test-rtt-to-external'],                      test_ids: [tIds[2]] },
  { name: 'job-host-1',          parallel: 'True',  'continue-if': 'true',  backoff: 'PT1S',
    tests: ['test-dns-to-external', 'test-trace-to-external'],
    test_ids: [tIds[3], tIds[4]] },
]).insertedIds;

// ---- schedules: reused from the pre-load by name -----------------------------------
const sched = (name) => db.schedules.findOne({ name });
const s5min = sched('Every 5 minutes');
const s1hr  = sched('Every 1 hour');

// ---- batches ------------------------------------------------------------------------
// Lower priority number = higher priority. All three share BOTH schedules, so they
// are due at the same instant every 5 minutes and again on the hour: a deliberate
// collision, so QA can confirm the probe honours priority
// (batch-comprehensive 0 > batch-host 1 > batch-group 2).
const bIds = db.batches.insertMany([
  { name: 'batch-comprehensive', priority: 0, test_interface: '$ifacename',
    ssid_profiles: ['eduroam'],   ssid_profile_ids: [eduroamId],
    schedules: ['Every 1 hour', 'Every 5 minutes'], schedule_ids: [s1hr._id, s5min._id],
    jobs: ['job-comprehensive-1', 'job-comprehensive-2'], job_ids: [jIds[0], jIds[1]] },
  { name: 'batch-host',          priority: 1, test_interface: '$ifacename',
    ssid_profiles: ['MWireless'], ssid_profile_ids: [mwId],
    schedules: ['Every 1 hour', 'Every 5 minutes'], schedule_ids: [s1hr._id, s5min._id],
    jobs: ['job-host-1'],         job_ids: [jIds[3]] },
  { name: 'batch-group',         priority: 2, test_interface: '$ifacename',
    ssid_profiles: ['MWireless'], ssid_profile_ids: [mwId],
    schedules: ['Every 1 hour', 'Every 5 minutes'], schedule_ids: [s1hr._id, s5min._id],
    jobs: ['job-group-1'],        job_ids: [jIds[2]] },
]).insertedIds;

// ---- hosts: the lab probes ----------------------------------------------------------
// Same metadata KEY on every probe, a DIFFERENT value each, so $external_dest
// resolves per host. No batches attached here: batch-comprehensive arrives through
// the "all" group's regex, batch-group through rpi4, and batch-host is left for the
// tester to assign in the GUI.
const hIds = db.hosts.insertMany(
  PROBES.map((name, i) => ({
    name, batches: [], batch_ids: [], data: { external_dest: DESTS[i] },
  }))
).insertedIds;

// ---- host group: rpi4 ---------------------------------------------------------------
// Members are listed BY NAME -- what the GUI's "Select all" produces -- rather than
// by regex. That distinction matters: group metadata reaches hosts listed by name
// only, never hosts matched by a pattern, so listing them is what delivers
// ifacename=wlan0 (which $ifacename in every batch resolves to).
db.host_groups.insertOne({
  name: 'rpi4',
  batches: ['batch-group'], batch_ids: [bIds[2]],
  hosts: PROBES.slice(), host_ids: Object.values(hIds),
  hosts_regex: [],
  data: { ifacename: 'wlan0' },
});

// ---- attach batch-comprehensive to the pre-load's "all" group ------------------------
// $addToSet, not a rewrite: the pre-load owns this group, and this script only adds
// a reference to it. Everything else about "all" (its ".*" regex, any batch attached
// by hand) is left exactly as it was.
db.host_groups.updateOne(
  { name: 'all' },
  { $addToSet: { batches: 'batch-comprehensive', batch_ids: bIds[0] } }
);

// ---- summary --------------------------------------------------------------------------
print('QA seed complete (added on top of the pre-load):');
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

cat <<MSG

Done. The QA scenario is wired as follows:

  batch-comprehensive  priority 0  eduroam    via the "all" group's .* regex
  batch-host           priority 1  MWireless  NOT ASSIGNED - attach it in the GUI
  batch-group          priority 2  MWireless  via the rpi4 group

  rpi4 lists all four probes BY NAME (the GUI's "Select all"), which is what
  delivers the group metadata ifacename=wlan0 that \$ifacename resolves to.

  Each probe carries its own external_dest, so \$external_dest resolves to a
  different destination per host.

  All three batches share both schedules, so they collide every 5 minutes and
  on the hour: that is how QA checks the probe honours priority.

Next: assign batch-host to a probe in the GUI, then Settings > Configuration >
Preview. The full walkthrough and the expected output are in docs/QA.md.
MSG
