#!/bin/bash
# Compatibility wrapper for older docs/workflows.
#
# `scripts/seed-demo.sh` is now the canonical demo seeder. It inserts data that
# is both GUI-friendly and config-generator-valid, so there is no separate config
# demo dataset to maintain. Keep this wrapper so anyone running the old command
# still gets the current demo instead of stale shapes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "scripts/seed-config-demo.sh is deprecated; running scripts/seed-demo.sh instead."
echo ""
bash "$SCRIPT_DIR/seed-demo.sh"

echo ""
echo "To preview the generated config after seeding, use Settings > Provisioning tools,"
echo "or run:"
echo "  curl -sk https://localhost:8888/api/provision/preview | jq -r '.proposed.config' > pssid_config.json"
