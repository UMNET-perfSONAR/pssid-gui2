# pSSID GUI server image.
#
# Built from the REPOSITORY ROOT as context (see docker-compose.yml), so this
# image can COPY both the server app and the repo-root shared/ directory, which
# the server imports as ./shared/* and reads at runtime.
#
# Two stages:
#   build   - full dependencies + TypeScript compiler; also the stage the local
#             hot-reload stack targets (docker-compose.local.yml).
#   runtime - production default: compiled JavaScript, production dependencies
#             only, no compiler or file watchers, running as a non-root user.

# ---- Build: install every dependency and compile TypeScript ------------------
FROM node:22 AS build

WORKDIR /usr/src/app/server

# Dependencies first so this layer caches across source-only changes.
COPY services/server/package*.json ./
RUN npm ci

# The server app, plus the shared/ config it imports as ./shared/*.
COPY services/server/ ./
COPY shared/ ./src/shared/

# Compile src/ -> build/ (tsconfig sets rootDir=src, outDir=build).
RUN npm run build

EXPOSE 8000

# The local dev stack targets this stage and runs the watch toolchain
# (tsc -w + nodemon) against the mounted source.
ENTRYPOINT ["./entrypoint.sh"]
CMD ["npm", "run", "dev"]

# ---- Runtime: compiled output + production dependencies only -----------------
FROM node:22-slim AS runtime

WORKDIR /usr/src/app/server

ENV NODE_ENV=production

# Production dependencies only — no TypeScript, nodemon, or concurrently.
COPY services/server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled JavaScript, plus the runtime files the server reads by path:
# paths_config.json / defaults_config.json (read relative to build/), the
# starter templates the entrypoint seeds, and shared/ — accessControl.js reads
# src/shared/auth-groups.config.json at runtime, so it must exist here even
# though the TypeScript is already compiled.
COPY --from=build /usr/src/app/server/build ./build
COPY services/server/paths_config.json services/server/defaults_config.json ./
COPY services/server/starters ./starters
COPY services/server/entrypoint.sh ./
COPY shared/ ./src/shared/

# The bind-mounted runtime directories (bin, plugins, output) are created here
# so they exist with the right ownership when nothing is mounted over them.
RUN chmod +x entrypoint.sh \
 && mkdir -p bin plugins output \
 && chown -R node:node /usr/src/app/server

# Drop root. The installer chowns the host-side bind mounts to this uid so the
# entrypoint can seed the starter templates into them.
USER node

EXPOSE 8000

# entrypoint.sh seeds the starter files, then hands off. It is the ENTRYPOINT
# (not CMD) so that step still runs when a deployment overrides the command.
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "build/index.js"]
