#!/bin/sh

CERT_PATH="/usr/src/app/certs/pssid-web-dev.miserver.it.umich.edu.pem"
KEY_PATH="/usr/src/app/certs/pssid-web-dev.miserver.it.umich.edu-key.pem"

echo "🔒 Waiting for SSL certificates..."

# Wait for cert
while [ ! -f "$CERT_PATH" ]; do
  echo "⏳ Waiting for $CERT_PATH..."
  sleep 1
done

# Wait for key
while [ ! -f "$KEY_PATH" ]; do
  echo "⏳ Waiting for $KEY_PATH..."
  sleep 1
done

echo "✅ Certificates found. Starting Vite..."

# Run the dev server
npm run dev
