#!/bin/bash
# Reusable starter defaults for pSSID GUI, not the full demo dataset.
#
# Loads a small set of reusable building blocks into MongoDB so a fresh install is
# not empty: a schedule set named general-to-specific, SSID profiles with their
# layer 2 / layer 3 methods, a metadata-using test, and an "all" host group whose
# host regex is ".*" (see the regex note in the deployment docs: "." matches any
# character and "*" means zero or more occurrences, so ".*" matches every host).
#
# Safe to re-run: it removes the docs it owns (by name) before inserting. It does
# not create hosts or batches, which are site-specific. This is a proposal, so
# adjust the set before shipping.
#
# For a populated demo stack, use scripts/seed-demo.sh instead.
set -euo pipefail

DB_NAME="gui"
MONGO_CONTAINER="$(docker ps --filter "name=mongo" --format '{{.Names}}' | head -n1)"
if [ -z "$MONGO_CONTAINER" ]; then
  echo "Could not find a running mongo container. Start the stack first (make dev or make up)." >&2
  exit 1
fi

echo "Loading default data into '$DB_NAME' via container '$MONGO_CONTAINER'..."

docker exec -i "$MONGO_CONTAINER" mongosh --quiet "$DB_NAME" <<'EOF'
const names = {
  schedules:     [
    'Every 5 minutes', 'Every hour', 'Every 4 hours', 'Every day at 23:00',
    // Earlier wordings of the same defaults; removed on re-run so a reseed
    // upgrades an existing database instead of duplicating schedules.
    'every 5 minutes', 'every hour', 'every 4 hours', 'every day at 23:00', 'every day at 16:00'
  ],
  ssid_profiles: [
    'campus-wifi', 'guest-wifi', 'eduroam',
    // Earlier organization-specific starter names; removed on re-run.
    'MWireless1', 'MWireless2'
  ],
  tests:         ['throughput-by-metadata'],
  host_groups:   ['all'],
};
for (const [coll, ns] of Object.entries(names)) {
  db.getCollection(coll).deleteMany({ name: { $in: ns } });
}

// Schedule names read general-to-specific, in formal wording with 24-hour time.
db.schedules.insertMany([
  { name: 'Every 5 minutes',    repeat: '*/5 * * * *' },
  { name: 'Every hour',         repeat: '0 * * * *' },
  { name: 'Every 4 hours',      repeat: '0 */4 * * *' },
  { name: 'Every day at 23:00', repeat: '0 23 * * *' },
]);

// Generic starter profiles; rename to match the networks on your campus.
// Layer 2 / layer 3 methods are required.
db.ssid_profiles.insertMany([
  { name: 'campus-wifi', SSID: 'Campus-WiFi', layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' },
  { name: 'guest-wifi',  SSID: 'Guest-WiFi',  layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' },
  { name: 'eduroam',     SSID: 'eduroam',     layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' },
]);

// A metadata-using test: the destination is a placeholder resolved per host from
// that host's effective metadata (see the metadata section in the docs).
db.tests.insertOne({
  name: 'throughput-by-metadata',
  type: 'throughput',
  spec: [ { type: 'text', name: 'dest', value: '{{throughput_dest}}' } ],
});

// The "all" group: host regex ".*" matches every host. NOTE this is the custom
// pSSID regex, not standard regex: "." = any character, "*" = zero or more
// occurrences of the preceding character, so ".*" = everything.
db.host_groups.insertOne({
  name: 'all',
  batches: [], batch_ids: [],
  hosts: [], host_ids: [],
  hosts_regex: ['.*'],
  data: {},
});

print('Defaults loaded:');
for (const coll of ['schedules', 'ssid_profiles', 'tests', 'host_groups']) {
  print('  ' + coll.padEnd(15) + db.getCollection(coll).countDocuments());
}
EOF

echo ""
echo "Done. These are reusable building blocks; add hosts and batches in the GUI."
