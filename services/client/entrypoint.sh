#!/bin/bash

# Reconcile dependencies with package.json before starting. node_modules is a
# named volume in the compose files, which shadows the image's modules, so a
# rebuilt image alone will not pick up newly added packages. Installing here
# keeps the volume in step with package.json (a fast no-op when already
# satisfied). Because this script is the image ENTRYPOINT, it runs even when a
# deployment overrides the container command (the local dev stack does, and a
# controller compose may).
npm install

# Hand off to the container command: the Dockerfile CMD (npm run serve:prod)
# by default, or whatever a compose `command:` override passes in. Using exec
# keeps it as PID 1 so signals (e.g. shutdown) reach it directly.
exec "$@"
