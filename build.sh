#!/bin/bash

# Copy our fixed content script before building
echo "Copying fixed content script..."
cp ./src/content-dark-fix.ts ./src/content.ts

# Run the regular build
echo "Running build..."
pnpm build