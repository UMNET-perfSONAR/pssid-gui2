#!/bin/bash
# Pre-loaded starter data for pSSID GUI (the "pre-load" script).
#
# Loads the agreed starter dataset into MongoDB so a fresh install is not empty.
# The Ansible role runs this once on first install; it can also be run by hand.
#
# What it loads:
#   - schedules:     the four standard schedules
#   - SSID profiles: eduroam only, with its layer 2 / layer 3 methods
#   - tests:         test-http-to-google (url www.google.com) and
#                    test-rtt-to-google (dest www.google.com)
#   - jobs:          job-comprehensive, running both tests
#   - host groups:   "all" - host regex ".*" (see the note on that group below)
#   - batches:       none
#   - hosts:         none; hosts are site-specific
#
# Batches, hosts and the rpi4 group belong to the QA dataset
# (scripts/seed-qa.sh), which layers on top of this one WITHOUT disturbing
# anything loaded here. See docs/QA.md for the full walkthrough.
#
# It also retires the legacy example_script test type: the template file is
# deleted from the server container's plugins directory (a persistent bind mount
# in production, so dropping the file from the repo alone never removes it), and
# any tests saved with that type are deleted from the database.
#
# Safe to re-run, and safe to re-run AFTER the QA seeder: it owns only the
# documents listed above, never a batch, host, or the rpi4 group. Its own
# documents (schedules, eduroam, the two tests, job-comprehensive) are upserted
# by name with their _id preserved, so their content is reasserted without
# breaking the QA seeder's references to them. The "all" group is created only
# if absent and otherwise left untouched, so a batch attached to it -- or a
# regex narrowed by hand in the GUI -- survives a re-run.
set -euo pipefail

DB_NAME="gui"
MONGO_CONTAINER="$(docker ps --filter "name=mongo" --format '{{.Names}}' | head -n1)"
if [ -z "$MONGO_CONTAINER" ]; then
  echo "Could not find a running mongo container. Start the stack first (make dev or make up)." >&2
  exit 1
fi

# Use credentials from .env when database authentication is enabled (the
# production installer generates them; the dev stack runs without auth). Same
# pattern as scripts/backup.sh. Without this, every write below is silently
# rejected on an authenticated database: mongosh reading a script from stdin
# prints the per-statement errors but still exits 0, so the seeding "succeeds"
# while the site starts empty.
AUTH=""
if [ -f .env ] && grep -q '^MONGO_PASSWORD=' .env; then
  MONGO_USERNAME="$(sed -n 's/^MONGO_USERNAME=//p' .env)"
  MONGO_PASSWORD="$(sed -n 's/^MONGO_PASSWORD=//p' .env)"
  if [ -n "$MONGO_PASSWORD" ]; then
    AUTH="-u $MONGO_USERNAME -p $MONGO_PASSWORD --authenticationDatabase admin"
  fi
fi

echo "Loading pre-load data into '$DB_NAME' via container '$MONGO_CONTAINER'..."

# shellcheck disable=SC2086
docker exec -i "$MONGO_CONTAINER" mongosh --quiet $AUTH "$DB_NAME" <<'EOF'
// ---- names this script owns, current and historical --------------------------
// Two roles below. CURRENT names are upserted, preserving each document's _id so
// cross-script references survive a re-run (the QA seeder stores THIS eduroam's
// and THESE schedules' _ids on its batches; deleting and recreating them would
// hand out fresh _ids and silently orphan those references). LEGACY names --
// renamed-away or retired -- are deleted, then any document still pointing at
// them is scrubbed.
const currentNames = {
  schedules:     ['Every 5 minutes', 'Every 1 hour', 'Every 4 hours', 'Every day at 23:00'],
  ssid_profiles: ['eduroam'],
  tests:         ['test-http-to-google', 'test-rtt-to-google'],
  jobs:          ['job-comprehensive'],
  batches:       [],
  host_groups:   ['all'],
  hosts:         [],
};
const legacyNames = {
  schedules:     ['Every hour', 'every 5 minutes', 'every hour', 'every 4 hours', 'every day at 23:00', 'every day at 16:00'],
  ssid_profiles: ['MWireless1', 'MWireless2', 'campus-wifi', 'guest-wifi'],
  tests:         ['throughput-by-metadata'],
  jobs:          [],
  batches:       [],
  host_groups:   [],
  hosts:         [],
};
// The example_script test type was retired: delete any test saved with that
// type, whatever it was named, so it cannot linger in jobs.
legacyNames.tests.push(...db.tests.find({ type: 'example_script' }).toArray().map((t) => t.name));

// Delete ONLY the legacy names. Current-name docs are upserted below (their _id
// preserved), never deleted.
for (const [coll, ns] of Object.entries(legacyNames)) {
  if (ns.length > 0) db.getCollection(coll).deleteMany({ name: { $in: ns } });
}

// Upsert by name: create if absent, reassert content if present, and ALWAYS keep
// the existing _id. Returns the _id so dependent documents can reference it.
function upsertByName(coll, name, fields) {
  db.getCollection(coll).updateOne({ name }, { $set: fields }, { upsert: true });
  return db.getCollection(coll).findOne({ name })._id;
}

// ---- schedules ------------------------------------------------------------------
// The QA seeder reuses these by name rather than creating its own, so the four
// standard schedules are defined in exactly one place.
for (const s of [
  { name: 'Every 5 minutes',    repeat: '*/5 * * * *' },
  { name: 'Every 1 hour',       repeat: '0 * * * *' },
  { name: 'Every 4 hours',      repeat: '0 */4 * * *' },
  { name: 'Every day at 23:00', repeat: '0 23 * * *' },
]) upsertByName('schedules', s.name, { repeat: s.repeat });

// ---- SSID profiles: eduroam only ----------------------------------------------
// MWireless belongs to the QA dataset; this script stays eduroam-only.
upsertByName('ssid_profiles', 'eduroam',
  { SSID: 'eduroam', layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' });

// ---- tests: one http and one rtt, both against Google --------------------------
const tHttp = upsertByName('tests', 'test-http-to-google', { type: 'http', spec: [
  { type: 'text', name: 'url',     value: 'www.google.com' },
  { type: 'text', name: 'timeout', value: 'PT10S' },
] });
const tRtt = upsertByName('tests', 'test-rtt-to-google', { type: 'rtt', spec: [
  { type: 'text',         name: 'dest',     value: 'www.google.com' },
  { type: 'number',       name: 'length',   value: 512 },
  { type: 'singleselect', name: 'protocol', selected: { name: 'TCP' } },
] });

// ---- job: the comprehensive suite ----------------------------------------------
// Seeded unattached: with no batches in this dataset, nothing runs it yet. It
// exists so a fresh install has a working job to inspect and assign in the GUI.
upsertByName('jobs', 'job-comprehensive', {
  parallel: 'True', 'continue-if': 'true', backoff: 'PT1S',
  tests: ['test-http-to-google', 'test-rtt-to-google'], test_ids: [tHttp, tRtt],
});

// ---- host group: "all" ----------------------------------------------------------
// Selects every host by REGEX. hosts_regex is a STANDARD regular expression,
// matched on the probe with Python's re.match (find_matching_regex in
// pssid-daemon.py): "." is any character and "*" is a quantifier, so ".*" means
// "everything". It is anchored at the start but NOT the end, and a bare "*" is
// invalid (the daemon logs it and the group matches nothing) -- which is why the
// pattern is ".*" and not "*". See docs/deployment.md, "Host regex is a standard
// regular expression, anchored at the start".
//
// Created only if absent ($setOnInsert), then left ENTIRELY alone on a re-run:
// its regex, metadata, and any batches attached to it (by the QA seeder or by
// hand in the GUI) are preserved. A first install has no "all" group, so the
// insert branch establishes the ".*" pattern; nothing reasserts it afterwards,
// so an operator who narrows the group in the GUI is not overruled.
db.host_groups.updateOne(
  { name: 'all' },
  { $setOnInsert: {
      name: 'all', batches: [], batch_ids: [], hosts: [], host_ids: [],
      hosts_regex: ['.*'], data: {},
  } },
  { upsert: true }
);

// ---- scrub dangling references to deleted legacy names --------------------------
// The deleteMany above is a raw removal; unlike the GUI's delete handlers it does
// not scrub arrays that reference a deleted name. Current-name docs are upserted
// with clean references, but any OTHER document (hand-made in the GUI) that
// referenced a now-deleted LEGACY name would be left pointing at nothing, which
// blocks config generation. Remove every such reference, keeping the parallel
// *_ids arrays in step. (Current names are never dead here, since they were
// upserted rather than deleted.)
const dead = {};
for (const coll of Object.keys(legacyNames)) {
  dead[coll] = legacyNames[coll].filter(n => !db.getCollection(coll).findOne({ name: n }));
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
scrub('host_groups', 'batches',       'batch_ids',        dead.batches);
scrub('batches',     'ssid_profiles', 'ssid_profile_ids', dead.ssid_profiles);
scrub('batches',     'schedules',     'schedule_ids',     dead.schedules);
scrub('batches',     'jobs',          'job_ids',          dead.jobs);
scrub('jobs',        'tests',         'test_ids',         dead.tests);

// ---- summary ---------------------------------------------------------------------
print('Pre-load complete:');
for (const coll of ['schedules', 'ssid_profiles', 'tests', 'jobs', 'batches', 'hosts', 'host_groups']) {
  print('  ' + coll.padEnd(15) + db.getCollection(coll).countDocuments());
}
EOF

# ---- verify the writes actually landed -------------------------------------------
# mongosh reading stdin exits 0 even when every statement failed (for example,
# unauthenticated writes against an authenticated database), so check the net
# effect and fail loudly instead of letting an empty site look "seeded". The
# Ansible role only writes its once-only marker when this script succeeds.
# shellcheck disable=SC2086
SCHEDULE_COUNT="$(docker exec -i "$MONGO_CONTAINER" mongosh --quiet $AUTH "$DB_NAME" --eval 'db.schedules.countDocuments()' | tail -n1 | tr -dc '0-9')"
if [ "${SCHEDULE_COUNT:-0}" -lt 1 ]; then
  echo "error: seeding wrote nothing (schedules=0). If database authentication is" >&2
  echo "enabled, credentials must be present in .env (MONGO_USERNAME/MONGO_PASSWORD)." >&2
  exit 1
fi

# ---- retire the example_script test TYPE (template file) -------------------------
# The GUI lists test types from the server container's plugins/tests directory,
# which is a persistent bind mount in production; the entrypoint copy never
# deletes, so the retired template must be removed explicitly. The entrypoint
# now also removes it on every container start; this handles already-running
# containers without a restart.
SERVER_CONTAINER="$(docker ps --filter "name=server" --format '{{.Names}}' | head -n1)"
if [ -n "$SERVER_CONTAINER" ]; then
  docker exec "$SERVER_CONTAINER" rm -f plugins/tests/example_script.json \
    && echo "Removed retired test type example_script from '$SERVER_CONTAINER' (if present)."
else
  echo "WARNING: no running server container found; could not remove the retired" >&2
  echo "example_script test type. It will be removed on the next server container start." >&2
fi

echo ""
echo "Done. Pre-loaded: the four schedules, eduroam, the google http/rtt tests,"
echo "job-comprehensive, and the 'all' host group (regex .*)."
echo ""
echo "No batches, hosts or rpi4 group: those belong to the QA dataset, which"
echo "layers on top of this one without disturbing it. Run it with:"
echo "    bash scripts/seed-qa.sh        (see docs/QA.md)"
