FROM node:lts

# Set working directory
WORKDIR /usr/src/app/server

# Copy both 'package.json' and 'package-lock.json' (if available)
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy project files and folders to the current working directory (i.e. 'server' folder)
COPY . .

EXPOSE 8000

# Build and run the application - check package.json for the definition of
# "npm run dev"
CMD ["npm", "run", "dev"]
