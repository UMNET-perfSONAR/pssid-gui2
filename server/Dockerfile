FROM node:lts

# Set working directory
WORKDIR /usr/src/app/server

# Copy both 'package.json' and 'package-lock.json' (if available)
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy project files and folders to the current working directory (i.e. 'server' folder)
COPY . .

# Build app for production with minification
# RUN npm run dev 

EXPOSE 8000
CMD ["npm", "run", "dev"]
