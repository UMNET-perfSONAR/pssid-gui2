#!/bin/bash

# Set paths
CONFIG_FILE="./shared/config.ts"
ENV_OUTPUT_FILE="./services/server/.env"

# Check if .env already exists
if [ -f "$ENV_OUTPUT_FILE" ]; then
  echo "⚠️  $ENV_OUTPUT_FILE already exists."
  read -p "Do you want to overwrite it? (y/n): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "❌ Aborted. .env was not modified."
    exit 0
  fi
fi

# Extract BASE_URL from config.ts (supports single or double quotes)
BASE_URL=$(grep "BASE_URL:" "$CONFIG_FILE" | sed -E 's/.*BASE_URL:\s*["'"'"']([^"'"'"']+)["'"'"'].*/\1/')

# Fallback if not found
if [ -z "$BASE_URL" ]; then
  echo "❌ BASE_URL not found in $CONFIG_FILE"
  exit 1
fi

# Generate a 32-byte base64 secret
SECRET=$(openssl rand -base64 32)

# Write the .env file (use lowercase keys to match what express-openid-connect expects)
cat <<EOF > "$ENV_OUTPUT_FILE"
ISSUER_BASE_URL=https://shibboleth.umich.edu
CLIENT_ID=
CLIENT_SECRET=
BASE_URL=$BASE_URL
SECRET=$SECRET
DEBUG=openid-client,express-openid-connect:*,express-session
EOF

echo "✅ .env file generated at $ENV_OUTPUT_FILE"
