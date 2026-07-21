#!/bin/bash

# Create target directories for the starter files
mkdir -p bin plugins

# Seed the placeholder provision script ONLY when the deployment has not
# supplied its own. In production bin/ is a bind mount of the host's provision
# directory (/usr/lib/exec/pssid), so an unconditional copy here would overwrite
# the operator's real provision script with this repository's logging stub on
# every container start.
if [ -f starters/provision ] && [ ! -e bin/provision ]; then
  cp starters/provision bin/
fi

# Test / layer-method templates are this repository's to own: they are the
# selectable types the GUI offers, so they are refreshed on every start.
if [ -d starters/tests ]; then
  cp -r starters/tests plugins/
fi

if [ -d starters/layer2 ]; then
  cp -r starters/layer2 plugins/
fi

if [ -d starters/layer3 ]; then
  cp -r starters/layer3 plugins/
fi

# Retire starter files that were removed from the repo. In production plugins/
# is a persistent bind mount and the copies above only add or update, so a
# template dropped from starters/ (like the old example_script test type) keeps
# showing up as a selectable test type until it is deleted here.
rm -f plugins/tests/example_script.json

# Development only: reconcile dependencies with package.json before starting.
# The dev stack keeps node_modules in a named volume that shadows the image's
# modules, so a rebuilt image alone would not pick up a newly added package.
# The production image ships its own immutable node_modules (npm ci --omit=dev
# at build time) and must never reach out to the network at container start.
if [ "${NODE_ENV}" != "production" ]; then
  npm install
fi

# Hand off to the container command: the Dockerfile CMD (node build/index.js in
# the production image, npm run dev in the build stage), or whatever a compose
# `command:` override passes in. Using exec keeps it as PID 1 so signals
# (e.g. shutdown) reach it directly.
exec "$@"
