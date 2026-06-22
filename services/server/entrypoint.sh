#!/bin/bash

# Create target directories for the starter files
mkdir -p bin plugins

# Copy starter files to the correct directories
if [ -f starters/provision ]; then
  cp -f starters/provision bin/
fi

if [ -d starters/archivers ]; then
  cp -r starters/archivers plugins/
fi

if [ -d starters/tests ]; then
  cp -r starters/tests plugins/
fi

if [ -d starters/layer2 ]; then
  cp -r starters/layer2 plugins/
fi

if [ -d starters/layer3 ]; then
  cp -r starters/layer3 plugins/
fi

if [ -d starters/scripts ]; then
  cp -r starters/scripts plugins/
fi

# Reconcile dependencies with package.json before starting. In the dev compose,
# node_modules is a named volume that shadows the image's modules, so a rebuilt
# image alone will not pick up newly added packages. Running install here keeps
# the volume in step with package.json (fast no-op when already satisfied) and
# avoids "Cannot find module" crashes after a dependency is added.
npm install

# Start the application
npm run dev
