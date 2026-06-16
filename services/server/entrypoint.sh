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

# Start the application
npm run dev
