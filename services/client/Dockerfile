FROM node:lts

# Set working directory
WORKDIR /usr/src/app/client

# Install simple http server for serving static content
RUN npm install -g http-server

# Copy both 'package.json' and 'package-lock.json' (if available)
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy project files and folders to the current working directory (i.e. 'client' folder)
COPY . .

# Make sure your wait script is present
COPY certs.sh ./certs.sh

# Make the wait script executable
RUN chmod +x ./certs.sh && chmod -R g+rw /usr/src/app/client

# Build app for production with minification
# RUN npm run build && chmod -R g+rw /usr/src/app/client

EXPOSE 8080

# CMD ["npm", "run", "dev"]
CMD ["./certs.sh"]
