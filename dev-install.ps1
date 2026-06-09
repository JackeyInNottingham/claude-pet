# Claude Pet Developer Install — installs from LOCAL directory (not GitHub)
# Usage: .\dev-install.ps1 [path-to-claude-pet-repo]
# Default: current directory
#
# This is for local development/testing. It copies the local source to
# ~/.claude/skills/claude-pet and runs npm install.

param(
    [string]$SourcePath = "."
)

$ErrorActionPreference = "Stop"

$SourceDir = (Resolve-Path $SourcePath).Path
$InstallDir = "$env:USERPROFILE\.claude\skills\claude-pet"
$DataDir = "$env:USERPROFILE\.claude-pet"

Write-Host ""
Write-Host "  🐾  Claude Pet Dev Install" -ForegroundColor Cyan
Write-Host "  ─────────────────────────" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Source:  $SourceDir" -ForegroundColor Cyan
Write-Host "  Target:  $InstallDir" -ForegroundColor Cyan
Write-Host ""

function Write-Info  { Write-Host "  ✓ $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "  ⚠ $args" -ForegroundColor Yellow }

# Stop any running pet
Write-Host "Stopping running pet (if any)..." -ForegroundColor Cyan
$portFile = Join-Path $DataDir "port"
if (Test-Path $portFile) {
    try {
        $port = (Get-Content $portFile -TotalCount 1).Trim()
        if ($port) {
            try { Invoke-WebRequest -Uri "http://127.0.0.1:$port/shutdown" -Method POST -TimeoutSec 3 | Out-Null } catch {}
            Start-Sleep -Seconds 1
        }
    } catch {}
}

# Remove old installation
if (Test-Path $InstallDir) {
    Write-Warn "Removing existing installation..."
    Remove-Item -Recurse -Force $InstallDir
}

# Install: copy
Write-Host "Copying files..." -ForegroundColor Cyan

# Create parent dir and install dir
$null = New-Item -ItemType Directory -Force -Path (Split-Path $InstallDir -Parent)
$null = New-Item -ItemType Directory -Force -Path $InstallDir

# Remove existing contents first to avoid stale files
Get-ChildItem $InstallDir -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

$sourceItems = Get-ChildItem $SourceDir -Exclude 'node_modules', '.git' -ErrorAction SilentlyContinue
foreach ($item in $sourceItems) {
    Copy-Item $item.FullName -Destination (Join-Path $InstallDir $item.Name) -Recurse -Force
}

# Copy hidden files/dirs that Get-ChildItem (without -Force) misses
Get-ChildItem $SourceDir -Hidden -Force -Exclude '.git' -ErrorAction SilentlyContinue | ForEach-Object {
    if (-not (Test-Path (Join-Path $InstallDir $_.Name))) {
        Copy-Item $_.FullName -Destination (Join-Path $InstallDir $_.Name) -Recurse -Force
    }
}

# Verify critical directories were copied
$criticalDirs = @('electron', 'hooks', 'commands', '.claude-plugin')
$missing = @()
foreach ($dir in $criticalDirs) {
    if (-not (Test-Path (Join-Path $InstallDir $dir))) {
        $missing += $dir
    }
}
if ($missing.Count -gt 0) {
    Write-Error "Copy failed — missing directories: $($missing -join ', ')"
}

# Install dependencies
Write-Host ""
Write-Host "Installing Electron dependencies..." -ForegroundColor Cyan
Push-Location "$InstallDir\electron"
try {
    npm install
    Write-Info "Electron dependencies installed"
} finally {
    Pop-Location
}

# Enable auto-start
$null = New-Item -ItemType Directory -Force -Path $DataDir
Remove-Item "$DataDir\auto-start-disabled" -ErrorAction SilentlyContinue
Write-Info "Auto-start enabled"

# Validate plugin
Write-Host ""
Write-Host "Validating plugin..." -ForegroundColor Cyan
try {
    claude plugin validate $InstallDir 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Info "Plugin validated — auto-loads as claude-pet@skills-dir"
    } else {
        Write-Warn "Validation had issues (non-fatal)"
    }
} catch {
    Write-Warn "Could not validate (claude CLI not found — plugin will still auto-load)"
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  🐾 Claude Pet dev-installed!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  Start pet now:  cd electron; npm start" -ForegroundColor Cyan
Write-Host "  Or restart Claude Code to auto-start."
Write-Host ""
