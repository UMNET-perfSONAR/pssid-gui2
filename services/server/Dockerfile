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

# Build and run the application with entrypoint.sh
CMD ["./entrypoint.sh"]
