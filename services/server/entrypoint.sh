#!/bin/bash

# Create target directories for the starter files
mkdir bin lib

# Copy starter files to the correct directories
cp starters/provision.sh bin/
cp -r starters/archivers/ lib/
cp -r starters/tests/ lib/

# Start the application
npm run dev
