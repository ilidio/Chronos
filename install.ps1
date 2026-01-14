Write-Host "🚀 Starting installation for IntelliJ-Style Local History..." -ForegroundColor Cyan

# Check for npm
if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-Error "npm is not installed."
    exit 1
}

# Clean up
Write-Host "🧹 Cleaning up..." -ForegroundColor Yellow
if (Test-Path "out") { Remove-Item -Recurse -Force "out" }
if (Test-Path "local-history.vsix") { Remove-Item -Force "local-history.vsix" }

Write-Host "📦 Installing dependencies..." -ForegroundColor Green
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "🔨 Compiling extension..." -ForegroundColor Green
npm run compile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "🎁 Packaging extension..." -ForegroundColor Green
"y" | npx @vscode/vsce package --out local-history.vsix
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Check size
$file = Get-Item "local-history.vsix"
if ($file.Length -lt 50000) {
    Write-Warning "The generated VSIX is very small ($($file.Length) bytes)."
    Write-Warning "This suggests dependencies are missing."
} else {
    Write-Host "✅ VSIX generated successfully ($($file.Length) bytes)." -ForegroundColor Green
}

Write-Host "💿 Installing to VS Code..." -ForegroundColor Green
code --uninstall-extension localhistory-dev.intellij-local-history
code --install-extension local-history.vsix --force

Write-Host "✅ Success! The extension has been installed." -ForegroundColor Cyan
Write-Host "👉 IMPORTANT: Reload VS Code now (Ctrl+Shift+P -> 'Developer: Reload Window')."