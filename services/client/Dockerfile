# Build context is the repository ROOT (see docker-compose*.yml: build.context: .),
# so this image can COPY both the client app and the repo-root shared/ directory
# at IMAGE-BUILD time. That lets the production bundle be compiled once, here,
# instead of on every container start - a broken build then fails visibly at
# `docker compose build` (before any container starts or nginx is affected),
# and the running container starts in seconds serving a static bundle.
#
# Two stages:
#   build    full toolchain (node_modules, vue-tsc, vite). The dev stack targets
#            this stage (build.target: build in docker-compose.local.yml) so the
#            hot-reload Vite server has its dependencies.
#   runtime  what production ships: the compiled bundle plus http-server on a
#            slim base. Roughly a tenth of the build stage's size, which matters
#            on VMs whose /var/lib is a small partition.
FROM node:22 AS build

WORKDIR /usr/src/app/client

# Install dependencies first so this layer caches across source-only changes.
COPY services/client/package*.json ./
RUN npm ci

# The client app, plus the shared/ config the app imports as ../shared/*.
COPY services/client/ ./
COPY shared/ ./src/shared/

# Edition (brand) is inlined into the bundle by Vite at build time. Pass it as a
# build arg; docker-compose sets it from the EDITION value in the root .env.
ARG VITE_EDITION=default
ENV VITE_EDITION=$VITE_EDITION

# Type-check (production tsconfig, tests excluded) + produce the static bundle.
RUN npm run build

EXPOSE 8080

# The dev stack overrides the command to `npm run dev`; this default matches the
# runtime stage so behaviour is identical whichever stage a container runs.
CMD ["node_modules/.bin/http-server", "dist", "-a", "0.0.0.0", "-p", "8080", "-c-1", "-d", "false", "--proxy", "http://127.0.0.1:8080?"]

# ---- Runtime: static bundle + http-server only -------------------------------
FROM node:22-slim AS runtime

WORKDIR /usr/src/app/client

# Pin http-server (the only runtime dependency) rather than inheriting whatever
# node_modules resolved; the flags below are the contract.
RUN npm install -g http-server@14.1.1 && npm cache clean --force

COPY --from=build /usr/src/app/client/dist ./dist

EXPOSE 8080

# Serve the pre-built bundle. http-server is the sole PID 1 (exec form), so it
# receives SIGTERM directly for a clean, prompt shutdown. --proxy makes any
# unmatched path fall back to index.html (SPA deep links); -d false disables
# directory listings; -c-1 disables the max-age header so a redeploy is never
# masked by a stale cached index.html.
CMD ["http-server", "dist", "-a", "0.0.0.0", "-p", "8080", "-c-1", "-d", "false", "--proxy", "http://127.0.0.1:8080?"]
