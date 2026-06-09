# Claude Pet Installer — Windows (PowerShell)
# Usage: powershell -ExecutionPolicy Bypass -File install.ps1
# Or:    iwr -UseBasicParsing https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.ps1 | iex

param(
    [switch]$SkipPrereqCheck,
    [switch]$UseCnMirror,
    [switch]$EnableAutoStart
)

$ErrorActionPreference = "Stop"

$RepoUrl = "https://github.com/JackeyInNottingham/claude-pet.git"
$InstallDir = "$env:USERPROFILE\.claude\skills\claude-pet"

# ── Helpers ──
function Write-Banner {
    Write-Host ""
    Write-Host "  🐾  Claude Pet Installer" -ForegroundColor Cyan
    Write-Host "  ─────────────────────" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Info  { Write-Host "  ✓ $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "  ⚠ $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "  ✗ $args" -ForegroundColor Red; exit 1 }

# ── Check prerequisites ──
function Check-Prereqs {
    Write-Host "Checking prerequisites..." -ForegroundColor Cyan

    # Node.js
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        Write-Error "Node.js not found. Install Node.js 18+ from https://nodejs.org"
    }
    $nodeVer = (node -v) -replace 'v', ''
    if ([int]($nodeVer -split '\.')[0] -lt 18) {
        Write-Error "Node.js $nodeVer detected. Claude Pet requires Node.js 18+."
    }
    Write-Info "Node.js $(node -v)"

    # npm
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npm) {
        Write-Error "npm not found. It should come with Node.js."
    }
    Write-Info "npm $(npm -v)"

    # Git
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
        Write-Error "Git not found. Install from https://git-scm.com"
    }
    Write-Info "git $(git --version | ForEach-Object { $_ -replace 'git version ', '' })"

    # Claude CLI
    $claude = Get-Command claude -ErrorAction SilentlyContinue
    $script:ClaudeMissing = $false
    if (-not $claude) {
        Write-Warn "claude CLI not found in PATH. Plugin install step will be skipped."
        Write-Warn "Plugins in ~/.claude/skills/ auto-load on next session — no manual registration needed."
        $script:ClaudeMissing = $true
    } else {
        Write-Info "claude CLI found"
    }
}

# ── Clone / update repository ──
function Install-Repo {
    if (Test-Path "$InstallDir\.git") {
        Write-Host ""
        Write-Host "Repository exists, updating..." -ForegroundColor Cyan
        Push-Location $InstallDir
        try {
            git pull --ff-only origin main
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "Could not update repo (local changes?). Continuing with current version."
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host ""
        Write-Host "Cloning repository..." -ForegroundColor Cyan
        if (Test-Path $InstallDir) {
            $backup = "$InstallDir.bak"
            Write-Warn "$InstallDir exists but is not a git repo. Backing up to $backup"
            if (Test-Path $backup) { Remove-Item -Recurse -Force $backup }
            Move-Item $InstallDir $backup
        }
        git clone $RepoUrl $InstallDir
        Write-Info "Repository cloned to $InstallDir"
    }
}

# ── Electron dependencies ──
function Install-ElectronDeps {
    Write-Host ""
    Write-Host "Installing Electron dependencies..." -ForegroundColor Cyan
    Push-Location "$InstallDir\electron"

    try {
        if ($UseCnMirror) {
            Write-Warn "Using npmmirror Electron mirror"
            $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
        }

        npm install
        Write-Info "Electron dependencies installed"

        # Verify electron binary exists (the .exe, not the .cmd wrapper — launcher uses the real executable)
        $electronExe = Join-Path $InstallDir "electron\node_modules\electron\dist\electron.exe"
        if (-not (Test-Path $electronExe)) {
            Write-Error "Electron binary not found after install: $electronExe"
            # Write-Error calls exit 1 — unreachable past here
        }
        Write-Info "Electron binary verified"
    } finally {
        Pop-Location
    }
}

# ── Validate plugin structure ──
function Install-Plugin {
    Write-Host ""
    Write-Host "Validating plugin structure..." -ForegroundColor Cyan

    if ($script:ClaudeMissing) {
        Write-Warn "Skipping validation (claude CLI not available)."
        Write-Host ""
        Write-Host "  Plugins in ~/.claude/skills/ auto-load on next session."
        return
    }

    # Skills-dir plugins auto-load — no explicit install needed.
    # Validate that the manifest is well-formed.
    claude plugin validate $InstallDir 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Info "Plugin validated — auto-loads as claude-pet@skills-dir"
    } else {
        Write-Warn "Plugin validation had issues (non-fatal). Check plugin.json format if the plugin doesn't load."
    }
}

# ── Post-install ──
function Post-Install {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  🐾 Claude Pet installed successfully!" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Commands:"
    Write-Host "    /pet start    - Launch the pet" -ForegroundColor Cyan
    Write-Host "    /pet stop     - Close the pet" -ForegroundColor Cyan
    Write-Host "    /pet toggle   - Toggle auto-start on session launch" -ForegroundColor Cyan
    Write-Host "    /pet status   - Check if the pet is running" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Or start from terminal:"
    Write-Host "    cd $InstallDir\electron`; npm start" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  To update later:"
    Write-Host "    cd $InstallDir`; git pull`; cd electron`; npm install" -ForegroundColor Cyan
    Write-Host ""

    if ($EnableAutoStart) {
        $null = New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude-pet"
        Remove-Item "$env:USERPROFILE\.claude-pet\auto-start-disabled" -ErrorAction SilentlyContinue
        Write-Info "Auto-start enabled"
    } else {
        $choice = Read-Host "  Enable auto-start on Claude Code session launch? [Y/n]"
        if ($choice -eq '' -or $choice -eq 'y' -or $choice -eq 'Y') {
            $null = New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude-pet"
            Remove-Item "$env:USERPROFILE\.claude-pet\auto-start-disabled" -ErrorAction SilentlyContinue
            Write-Info "Auto-start enabled"
        } else {
            $null = New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude-pet"
            $null = New-Item -ItemType File -Force -Path "$env:USERPROFILE\.claude-pet\auto-start-disabled"
            Write-Info "Auto-start disabled (use /pet toggle to change)"
        }
    }
}

# ── Run ──
Write-Banner
Check-Prereqs
Install-Repo
Install-ElectronDeps
Install-Plugin
Post-Install
