# Claude Pet Uninstaller — Windows (PowerShell)
# Usage: powershell -ExecutionPolicy Bypass -File uninstall.ps1
# Or:    iwr -UseBasicParsing https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/uninstall.ps1 | iex

param(
    [switch]$KeepData
)

$ErrorActionPreference = "Stop"

$InstallDir = "$env:USERPROFILE\.claude\skills\claude-pet"
$DataDir = "$env:USERPROFILE\.claude-pet"

Write-Host ""
Write-Host "  🐾  Claude Pet Uninstaller" -ForegroundColor Cyan
Write-Host "  ────────────────────────" -ForegroundColor Cyan
Write-Host ""

function Write-Info  { Write-Host "  ✓ $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "  ⚠ $args" -ForegroundColor Yellow }

# ── Stop running pet ──
Write-Host "Stopping Claude Pet..." -ForegroundColor Cyan
$portFile = Join-Path $DataDir "port"
if (Test-Path $portFile) {
    try {
        $port = (Get-Content $portFile -TotalCount 1).Trim()
        if ($port) {
            try {
                Invoke-WebRequest -Uri "http://127.0.0.1:$port/shutdown" -Method POST -TimeoutSec 3 | Out-Null
            } catch {}
            Start-Sleep -Seconds 1
        }
    } catch {}
    Write-Info "Pet process stopped"
}

# ── Remove plugin directory ──
Write-Host ""
Write-Host "Removing plugin files..." -ForegroundColor Cyan
if (Test-Path $InstallDir) {
    Remove-Item -Recurse -Force $InstallDir
    Write-Info "Removed $InstallDir"
} else {
    Write-Warn "Plugin directory not found: $InstallDir"
}

# ── Remove data directory ──
Write-Host ""
if (-not $KeepData) {
    if (Test-Path $DataDir) {
        Write-Host "Remove data directory?" -ForegroundColor Yellow
        Write-Host "  This includes: port file, launcher lock, position, permissions cache, version state"
        Write-Host "  Location: $DataDir" -ForegroundColor Cyan
        $choice = Read-Host "  Remove $DataDir? [Y/n]"
        if ($choice -eq '' -or $choice -eq 'y' -or $choice -eq 'Y') {
            Remove-Item -Recurse -Force $DataDir
            Write-Info "Removed $DataDir"
        } else {
            Write-Info "Kept $DataDir"
        }
    }
} else {
    Write-Info "Kept $DataDir (--KeepData)"
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  🐾 Claude Pet uninstalled successfully!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  To reinstall:"
Write-Host "    iwr -UseBasicParsing https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.ps1 | iex" -ForegroundColor Cyan
Write-Host ""
