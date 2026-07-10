FROM node:22

# Set working directory
WORKDIR /usr/src/app/client

# Static file server for the production build (used by `npm run serve:prod`).
# Pinned so image rebuilds are reproducible.
RUN npm install -g http-server@14.1.1

# Copy both 'package.json' and 'package-lock.json' (if available)
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy project files and folders to the current working directory (i.e. 'client' folder)
COPY . .

# Ensure that entrypoint.sh is executable
RUN chmod +x entrypoint.sh

EXPOSE 8080

# entrypoint.sh reconciles node_modules with package.json (the compose files
# mount a named volume over it), then runs the command. It is the ENTRYPOINT
# (not CMD) so that step still runs when a deployment overrides the container
# command, e.g. the local dev stack's `command: npm run dev`.
ENTRYPOINT ["./entrypoint.sh"]

# Default command: compile the production bundle at container START, then serve
# it statically. The build cannot run at image-build time because two of its
# inputs only exist at runtime: the repo-root shared/ directory (bind-mounted
# to src/shared by the compose files) and VITE_EDITION (inlined by Vite at
# build time, passed as a container environment variable). Override with
# `npm run dev` for the hot-reload development stack.
CMD ["npm", "run", "serve:prod"]
