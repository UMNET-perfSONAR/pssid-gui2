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

# Reconcile dependencies with package.json before starting. node_modules is a
# named volume in the compose files, which shadows the image's modules, so a
# rebuilt image alone will not pick up newly added packages. Installing here
# keeps the volume in step with package.json (a fast no-op when already
# satisfied) and avoids "Cannot find module" crashes after a dependency is
# added. Because this script is the image ENTRYPOINT, it runs even when a
# deployment overrides the container command (the production Ansible compose
# does), where the install step would otherwise be skipped.
npm install

# Hand off to the container command: the Dockerfile CMD (npm run dev) by
# default, or whatever a compose `command:` override passes in. Using exec keeps
# it as PID 1 so signals (e.g. shutdown) reach it directly.
exec "$@"
