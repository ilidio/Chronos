#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting build process for Chronos..."

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed."
    exit 1
fi

# Clean up
echo "🧹 Cleaning up..."
rm -rf out *.vsix

echo "📦 Installing dependencies..."
npm install

echo "🔨 Compiling extension..."
npm run compile

echo "🎁 Packaging extension..."
# Use npx to ensure we use the latest compatible vsce, auto-confirming prompts
npx @vscode/vsce package

# Find the generated VSIX file
VSIX_FILE=$(ls *.vsix | head -n 1)

if [ -z "$VSIX_FILE" ]; then
    echo "❌ Error: .vsix file was not generated."
    exit 1
fi

# Check size (MacOS/Linux compatible)
FILESIZE=$(stat -f%z "$VSIX_FILE" 2>/dev/null || stat -c%s "$VSIX_FILE" 2>/dev/null || echo 0)

if [ "$FILESIZE" -lt 10000 ]; then
    echo "⚠️  WARNING: The generated VSIX is suspiciously small ($FILESIZE bytes)."
    echo "    This might indicate missing dependencies or files."
else
    echo "✅ Success! Created package: $VSIX_FILE ($FILESIZE bytes)"
    echo "    You can now upload this file to the Marketplace."
fi
