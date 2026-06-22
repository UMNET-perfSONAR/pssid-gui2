FROM node:18

# Set working directory
WORKDIR /usr/src/app/server

# Copy both 'package.json' and 'package-lock.json' (if available)
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy project files and folders to the current working directory (i.e. 'server' folder)
COPY . .

# Ensure that entrypoint.sh is executable
RUN chmod +x entrypoint.sh

EXPOSE 8000

# entrypoint.sh copies the starter files and reconciles dependencies, then runs
# the command. It is the ENTRYPOINT (not CMD) so that step still runs even when a
# deployment overrides the container command, e.g. the production Ansible compose.
# CMD is the default command the entrypoint hands off to.
ENTRYPOINT ["./entrypoint.sh"]
CMD ["npm", "run", "dev"]
