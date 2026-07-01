#!/bin/bash
# Proposed ship-with defaults for pSSID GUI (a starting point; edit with Ed).
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
set -euo pipefail

DB_NAME="gui"
MONGO_CONTAINER="$(docker ps --filter "name=mongo" --format '{{.Names}}' | head -n1)"
if [ -z "$MONGO_CONTAINER" ]; then
  echo "Could not find a running mongo container." >&2
  exit 1
fi

echo "Loading default data into '$DB_NAME' via container '$MONGO_CONTAINER'..."

docker exec -i "$MONGO_CONTAINER" mongosh --quiet "$DB_NAME" <<'EOF'
const names = {
  schedules:     ['every 5 minutes', 'every hour', 'every 4 hours', 'every day at 23:00'],
  ssid_profiles: ['MWireless1', 'MWireless2', 'eduroam'],
  tests:         ['throughput-by-metadata'],
  host_groups:   ['all'],
};
for (const [coll, ns] of Object.entries(names)) {
  db.getCollection(coll).deleteMany({ name: { $in: ns } });
}

// Schedule names read general-to-specific.
db.schedules.insertMany([
  { name: 'every 5 minutes',    repeat: '*/5 * * * *' },
  { name: 'every hour',         repeat: '0 * * * *' },
  { name: 'every 4 hours',      repeat: '0 */4 * * *' },
  { name: 'every day at 23:00', repeat: '0 23 * * *' },
]);

// Two profiles sharing one SSID (MWireless) plus eduroam. Methods are required.
db.ssid_profiles.insertMany([
  { name: 'MWireless1', SSID: 'MWireless', layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' },
  { name: 'MWireless2', SSID: 'MWireless', layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' },
  { name: 'eduroam',    SSID: 'eduroam',   layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' },
]);

// A metadata-using test: the destination is a placeholder resolved per host from
// that host's effective metadata (see the metadata section in the docs).
db.tests.insertOne({
  name: 'throughput-by-metadata',
  type: 'throughput',
  spec: { dest: '{{throughput_dest}}' },
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
