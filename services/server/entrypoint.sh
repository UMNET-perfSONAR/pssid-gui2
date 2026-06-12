#!/bin/bash

# Create target directories for the starter files
mkdir bin plugins

# Copy starter files to the correct directories
cp starters/provision bin/
cp -r starters/archivers/ plugins/
cp -r starters/tests/ plugins/
cp -r starters/layer2/ plugins/
cp -r starters/layer3/ plugins/
cp -r starters/scripts/ plugins/

# Start the application
npm run dev
