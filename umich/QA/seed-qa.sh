#!/bin/bash
# QA dataset for pSSID GUI. Layers ON TOP of scripts/seed-defaults.sh.
#
# ADDITIVE by design: this script owns only the documents listed below and never
# deletes, rewrites or resets anything the pre-load owns. The four schedules,
# eduroam, the two Google tests and job-comprehensive are reused by name, not
# recreated. The pre-load's "all" group keeps its regex and gains one batch.
#
# Run the pre-load FIRST (the Ansible role does this on a first install), then
# this. See QA.md for the full walkthrough and expected output.
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
#                    job-host-1           dns + trace
#                    job-tie-1            http (fixed target)
#   - batches:       batch-comprehensive  priority 0  eduroam    (-> "all" group)
#                    batch-host           priority 1  MWireless  (-> probe 1, directly)
#                    batch-group          priority 2  MWireless  (-> rpi4 group)
#                    batch-tie            priority 2  MWireless  (-> rpi4 group)
#   - hosts:         two probes, each with the SAME metadata key
#                    (external_dest) holding a DIFFERENT value. Probe 1 also
#                    carries batch-host directly (not via a group).
#   - host group:    rpi4 - every probe listed BY NAME (the GUI's "Select all",
#                    not a regex), carrying group data ifacename=wlan0
#
# METADATA: operators author it in the "data" field of a host or a group, and
# "data" is the only field the daemon reads. It resolves $key per probe from that
# host's own data first (so a host key always wins) and then from every group the
# host belongs to, whether it joined BY NAME or BY REGEX. Each value appears in
# the generated config exactly once, in the "data" block that holds it; the
# resolved per-probe view is shown in the GUI's Probe configuration panel rather
# than written into the file a second time.
#
# PRIORITY: lower number has higher precedence in the event of a scheduling
# conflict. All four batches share the "Every 5 minutes" and "Every 1 hour"
# schedules so they COLLIDE on purpose; probe 1 should give batch-comprehensive
# (0) precedence over batch-host (1) over batch-group / batch-tie (2) -- it is
# the only host all four reach. Probe 2 sees batch-comprehensive (0),
# batch-group (2) and batch-tie (2). That collision is the point -- it is how QA
# checks priority.
#
# IDENTICAL PRECEDENCE: batch-group and batch-tie are BOTH priority 2 and share
# both schedules, so on every probe two due batches are tied. Nothing in the
# configuration breaks that tie -- the daemon hands both to the scheduler with
# the same (time, priority) key and their relative order is whatever its internal
# ordering happens to produce, which is not a contract and may change. The tie is
# seeded deliberately so QA can SEE that state and recognise it in the field: if
# the order of two batches matters, give them different priorities.
#
# batch-host is attached to probe 1 directly (not through a group), so the
# dataset exercises the plain host-level batch attachment path without a manual
# step. To ALSO exercise the GUI's own write path for this (as opposed to the
# seeder writing to MongoDB directly), detach and reattach it by hand in the
# GUI -- see QA.md section 3.
#
# The probe NAMES are the probes' hostnames, which at this site are their IP
# addresses. The two lab probes are the defaults below, so the script needs no
# arguments here. A name MUST match what that probe reports as its hostname, or
# the daemon exits on it -- so override the defaults when pointing this dataset
# at different probes:
#
#   PSSID_QA_PROBE1=<probe-1-ip> PSSID_QA_PROBE2=<probe-2-ip> \
#   PSSID_QA_DEST1=<url> PSSID_QA_DEST2=<url> bash umich/QA/seed-qa.sh
#
# Safe to re-run: it removes only the documents it owns (by name, including
# probes a previous run put in the rpi4 group) before inserting them again.
set -euo pipefail

# Resolve the repository root from this script's own location, so it works
# whether it is run as `bash umich/QA/seed-qa.sh` from the root, via
# `make seed-qa`, or from inside the umich/QA/ folder. The .env read below is
# relative to the root, which is two levels up from umich/QA.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."

DB_NAME="gui"

# The two lab probes. Their hostnames are IP addresses at this site, so these
# are the addresses themselves; override them for any other pair of probes.
PSSID_QA_PROBE1="${PSSID_QA_PROBE1:-198.111.226.186}"
PSSID_QA_PROBE2="${PSSID_QA_PROBE2:-198.111.226.189}"

# Same metadata KEY on both hosts, a DIFFERENT value each. This is what
# $external_dest resolves to per probe, and checking that each probe gets its own
# value is one of the things QA verifies.
PSSID_QA_DEST1="${PSSID_QA_DEST1:-www.google.com}"
PSSID_QA_DEST2="${PSSID_QA_DEST2:-www.reddit.com}"

# Values are passed into mongosh through the environment (never spliced into the
# script text), so validate them only for sanity. The pattern accepts an IP
# address or a DNS name; it is the same shape a host name must have.
for v in "$PSSID_QA_PROBE1" "$PSSID_QA_PROBE2"; do
  if ! [[ "$v" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
    echo "Invalid probe hostname: '$v'" >&2
    exit 1
  fi
done
for v in "$PSSID_QA_DEST1" "$PSSID_QA_DEST2"; do
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

# Is database authentication enabled (the production installer generates
# credentials; the dev stack runs without)? The .env decides; the PASSWORD ITSELF
# is never read here, so it cannot reach a host command line where `ps aux` would
# show it. The container expands its own MONGO_INITDB_ROOT_* below. Same pattern
# as scripts/backup.sh.
NEEDS_AUTH=false
if [ -f .env ] && grep -q '^MONGO_PASSWORD=.\+' .env; then
  NEEDS_AUTH=true
fi

echo "Seeding QA data into '$DB_NAME' via container '$MONGO_CONTAINER'..."
echo "  probes: $PSSID_QA_PROBE1, $PSSID_QA_PROBE2"

# The probe names and destinations DO travel as -e values: they are addresses,
# not secrets, and the mongosh script below reads them from process.env.
docker exec -i \
  -e PSSID_QA_PROBE1="$PSSID_QA_PROBE1" \
  -e PSSID_QA_PROBE2="$PSSID_QA_PROBE2" \
  -e PSSID_QA_DEST1="$PSSID_QA_DEST1" \
  -e PSSID_QA_DEST2="$PSSID_QA_DEST2" \
  "$MONGO_CONTAINER" sh -c '
    if [ -n "${MONGO_INITDB_ROOT_PASSWORD:-}" ] && [ "$2" = "true" ]; then
      exec mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
        --authenticationDatabase admin "$1"
    fi
    exec mongosh --quiet "$1"
  ' _ "$DB_NAME" "$NEEDS_AUTH" <<'EOF'
const PROBES = [
  process.env.PSSID_QA_PROBE1,
  process.env.PSSID_QA_PROBE2,
];
const DESTS = [
  process.env.PSSID_QA_DEST1,
  process.env.PSSID_QA_DEST2,
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
                  'job-group-1', 'job-host-1', 'job-tie-1',
                  // Earlier QA job names.
                  'job-MWagree', 'job-MWireless'],
  batches:       ['batch-comprehensive', 'batch-host', 'batch-group', 'batch-tie',
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
// the data of that host and of its groups, so each probe tests its own
// destination. The key uses an underscore, not a hyphen: $-substitution stops at
// a hyphen, so "$external-dest" would resolve as "$external" followed by a
// literal "-dest".
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
      { type: 'text',   name: 'dest',   value: '$external_dest' },
      { type: 'number', name: 'length', value: 1024 },
  ] },
  { name: 'test-dns-to-external',  type: 'dns', spec: [
      { type: 'text',         name: 'nameserver', value: '$external_dest' },
      { type: 'singleselect', name: 'record',     selected: { name: 'aaaa' } },
      { type: 'text',         name: 'query',      value: 'www.example.edu' },
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
// job-group-1 / job-host-1 / job-tie-1: distinct test sets, so the four batches
// stay distinguishable in the generated config and are easy to tell apart when
// checking priority -- particularly job-group-1 vs job-tie-1, whose batches share
// a priority and must still be identifiable in probe logs.
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
  { name: 'job-tie-1',           parallel: 'False', 'continue-if': 'true',  backoff: 'PT1S',
    tests: ['test-http-to-example'],                      test_ids: [tIds[1]] },
]).insertedIds;

// ---- schedules: reused from the pre-load by name -----------------------------------
const sched = (name) => db.schedules.findOne({ name });
const s5min = sched('Every 5 minutes');
const s1hr  = sched('Every 1 hour');

// ---- batches ------------------------------------------------------------------------
// Lower number has higher precedence in the event of a scheduling conflict. All
// four share BOTH schedules, so they are due at the same instant every 5 minutes
// and again on the hour: a deliberate collision, so QA can confirm the probe
// honors precedence (batch-comprehensive 0 before batch-host 1 before the two at 2).
//
// batch-group and batch-tie are both priority 2 ON PURPOSE. Two batches due at
// the same instant with the same precedence is the ambiguous case: the config
// expresses no preference between them, so their order is left to the scheduler
// and must not be relied on. Seeding it lets QA observe the state rather than
// meet it for the first time in production.
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
  // Same priority as batch-group, same two schedules, same group: the identical
  // precedence case.
  { name: 'batch-tie',           priority: 2, test_interface: '$ifacename',
    ssid_profiles: ['MWireless'], ssid_profile_ids: [mwId],
    schedules: ['Every 1 hour', 'Every 5 minutes'], schedule_ids: [s1hr._id, s5min._id],
    jobs: ['job-tie-1'],          job_ids: [jIds[4]] },
]).insertedIds;

// ---- hosts: the lab probes ----------------------------------------------------------
// Same metadata KEY in every probe's data, a DIFFERENT value each, so
// $external_dest resolves per host. batch-comprehensive, batch-group and
// batch-tie reach both probes through the "all" and rpi4 groups; batch-host is
// attached directly to probe 1 only, so at least one probe exercises the plain
// host-level attachment path (and so probe 1, not probe 2, is the one that sees
// all four batches).
const hIds = db.hosts.insertMany(
  PROBES.map((name, i) => ({
    name,
    batches: i === 0 ? ['batch-host'] : [],
    batch_ids: i === 0 ? [bIds[1]] : [],
    data: { external_dest: DESTS[i] },
  }))
).insertedIds;

// ---- host group: rpi4 ---------------------------------------------------------------
// Members are listed BY NAME -- what the GUI's "Select all" produces -- rather than
// by regex, so the dataset covers both membership styles ("all" uses .*). Either
// style delivers the group's data: ifacename=wlan0 here, which $ifacename in every
// batch resolves to.
//
// It carries BOTH priority-2 batches, so the identical-precedence collision is
// visible on every probe in the group, not just on probe 1.
db.host_groups.insertOne({
  name: 'rpi4',
  batches: ['batch-group', 'batch-tie'], batch_ids: [bIds[2], bIds[3]],
  hosts: PROBES.slice(), host_ids: Object.values(hIds),
  hosts_regex: [],
  data: { ifacename: 'wlan0' },
});

// ---- attach batch-comprehensive to the pre-load's "all" group ------------------------
// The pre-load owns this group; this script only manages its own reference to it,
// leaving the ".*" regex and any hand-attached batch untouched.
//
// NOT $addToSet: batch-comprehensive is deleted and recreated with a fresh _id on
// every run, so $addToSet would dedupe the NAME (already present) while appending
// the new _id, growing batch_ids past batches on each re-run and leaving dead ids
// behind. Because the app treats *_ids as the source of truth and re-derives the
// name arrays from them (update.service.ts), that drift corrupts the group. So
// rebuild both arrays index-for-index: drop any existing batch-comprehensive
// entry, then append the current name and _id together.
const allGroup = db.host_groups.findOne({ name: 'all' });
const abNames = Array.isArray(allGroup.batches) ? allGroup.batches : [];
const abIds   = Array.isArray(allGroup.batch_ids) ? allGroup.batch_ids : [];
const keepBatches = [], keepBatchIds = [];
abNames.forEach((n, i) => {
  if (n === 'batch-comprehensive') return;      // drop the stale pair (name + its _id)
  keepBatches.push(n);
  if (i < abIds.length) keepBatchIds.push(abIds[i]);
});
keepBatches.push('batch-comprehensive');
keepBatchIds.push(bIds[0]);
db.host_groups.updateOne(
  { name: 'all' },
  { $set: { batches: keepBatches, batch_ids: keepBatchIds } }
);

// ---- scrub dangling references to deleted legacy names --------------------------
// The deleteMany at the top removes this script's legacy names (BatchMW,
// job-MWagree, job-MWireless, test-http-to-MWireless) without scrubbing arrays
// that referenced them. The current QA documents are recreated above with clean
// references, but any OTHER document (hand-made in the GUI) that still pointed at
// a legacy name would be left dangling, which blocks config generation. Remove
// every reference to a legacy name that was deleted and not recreated, keeping
// the parallel *_ids arrays in step.
const dead = {};
for (const coll of Object.keys(ownedNames)) {
  dead[coll] = ownedNames[coll].filter(n => !db.getCollection(coll).findOne({ name: n }));
}
const scrub = (coll, field, idField, deadNames) => {
  if (!deadNames || deadNames.length === 0) return;
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
scrub('batches',     'ssid_profiles', 'ssid_profile_ids', dead.ssid_profiles);
scrub('batches',     'jobs',          'job_ids',          dead.jobs);
scrub('jobs',        'tests',         'test_ids',         dead.tests);

// ---- summary --------------------------------------------------------------------------
print('QA seed complete (added on top of the pre-load):');
for (const coll of ['schedules', 'ssid_profiles', 'tests', 'jobs', 'batches', 'hosts', 'host_groups']) {
  print('  ' + coll.padEnd(15) + db.getCollection(coll).countDocuments());
}
EOF

# ---- verify that the writes landed -----------------------------------------------
# mongosh reading stdin exits 0 even when statements failed -- for example when
# the pre-load check quit(1) after an auth error, or writes were rejected on an
# authenticated database with missing .env credentials. Check the net effect and
# report an explicit error, so a "Done" banner never appears over an unchanged
# database. The
# pre-load leaves zero batches; this dataset adds four, so a batch count below
# four means the seed did not take. (Same guard as scripts/seed-defaults.sh.)
# shellcheck disable=SC2086
BATCH_COUNT="$(docker exec -i "$MONGO_CONTAINER" sh -c '
  if [ -n "${MONGO_INITDB_ROOT_PASSWORD:-}" ] && [ "$3" = "true" ]; then
    exec mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
      --authenticationDatabase admin "$1" --eval "$2"
  fi
  exec mongosh --quiet "$1" --eval "$2"
' _ "$DB_NAME" 'db.batches.countDocuments()' "$NEEDS_AUTH" | tail -n1 | tr -dc '0-9')"
if [ "${BATCH_COUNT:-0}" -lt 4 ]; then
  echo "error: QA seeding did not complete (batches=${BATCH_COUNT:-0}, expected 4+)." >&2
  echo "Run the pre-load first (bash scripts/seed-defaults.sh), and if database" >&2
  echo "authentication is enabled ensure .env has MONGO_USERNAME/MONGO_PASSWORD." >&2
  exit 1
fi

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
  batch-host           priority 1  MWireless  attached directly to $PSSID_QA_PROBE1
  batch-group          priority 2  MWireless  via the rpi4 group
  batch-tie            priority 2  MWireless  via the rpi4 group

  $PSSID_QA_PROBE1 sees all four batches (0, 1, 2, 2); $PSSID_QA_PROBE2 sees
  three (0, 2, 2) -- that difference is deliberate, so the full precedence
  ordering is only observable on probe 1.

  batch-group and batch-tie share priority 2 ON PURPOSE. Lower number has higher
  precedence in the event of a scheduling conflict, but two batches at the SAME
  number express no preference at all: their relative order is left to the
  scheduler and is not something the configuration decides. Give two batches
  different priorities whenever the order between them matters.

  rpi4 lists both probes BY NAME (the GUI's "Select all"); "all" matches by
  regex. Either way the group's data reaches its members, which is what delivers
  ifacename=wlan0 that \$ifacename resolves to.

  Each probe carries its own external_dest, so \$external_dest resolves to a
  different destination per host.

  All four batches share both schedules, so they collide every 5 minutes and
  on the hour: that is how QA checks the probe honors precedence.

Next: Settings > Configuration > Preview. The full walkthrough and the
expected output are in umich/QA/QA.md.
MSG
