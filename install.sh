#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting installation for Chronos..."

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed."
    exit 1
fi

# Clean up
echo "🧹 Cleaning up..."
rm -rf out chronos.vsix

echo "📦 Installing dependencies..."
npm install

echo "🔨 Compiling extension..."
npm run compile

echo "🎁 Packaging extension..."
# Force bundle dependencies
yes y | npx @vscode/vsce package --out chronos.vsix

# Check size
FILESIZE=$(stat -f%z chronos.vsix 2>/dev/null || stat -c%s chronos.vsix 2>/dev/null || echo 0)
if [ "$FILESIZE" -lt 50000 ]; then
    echo "⚠️  WARNING: The generated VSIX is very small ($FILESIZE bytes)."
    echo "    This suggests dependencies are missing. Please ensure 'npm install' ran correctly."
else
    echo "✅ VSIX generated successfully ($FILESIZE bytes)."
fi

echo "💿 Installing to VS Code..."
code --uninstall-extension ilidio.chronos || true
code --install-extension chronos.vsix --force

echo "✅ Success! The extension has been installed."
echo "👉 IMPORTANT: Reload VS Code now (Cmd+Shift+P -> 'Developer: Reload Window')."