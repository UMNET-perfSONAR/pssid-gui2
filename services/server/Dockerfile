FROM node:lts

# Set working directory
WORKDIR /usr/src/app/server

# Copy both 'package.json' and 'package-lock.json' (if available)
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy project files and folders to the current working directory (i.e. 'server' folder)
COPY . .

# Create target directories for the starter files
RUN mkdir -p bin lib

# Copy starter files to the correct directories
RUN cp starters/provision.sh bin/ && \
    cp -r starters/archivers/ lib/ && \
    cp -r starters/tests/ lib/

EXPOSE 8000

# Build and run the application with npm run dev
CMD ["npm", "run", "dev"]
