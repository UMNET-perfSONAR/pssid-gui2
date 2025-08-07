#!/bin/sh

if [ -z "$DOMAIN" ]; then
  echo "❌ DOMAIN environment variable not set. Exiting."
  exit 1
fi

CERT_PATH="/usr/src/app/certs/${DOMAIN}.pem"
KEY_PATH="/usr/src/app/certs/${DOMAIN}-key.pem"

echo "🔒 Waiting for SSL certificates for domain: $DOMAIN..."

while [ ! -f "$CERT_PATH" ]; do
  echo "⏳ Waiting for $CERT_PATH..."
  sleep 1
done

while [ ! -f "$KEY_PATH" ]; do
  echo "⏳ Waiting for $KEY_PATH..."
  sleep 1
done

echo "✅ Certificates found. Starting Vite..."

npm run dev
