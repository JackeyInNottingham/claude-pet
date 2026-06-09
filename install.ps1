# Claude Pet Installer — Windows (PowerShell)
# Usage: powershell -ExecutionPolicy Bypass -File install.ps1
# Or:    iwr -UseBasicParsing https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.ps1 | iex
#
# Parameters:
#   -UseCnMirror       Use npmmirror for Electron (git+npm fallback path only)
#   -ForceGit           Skip release download, force git clone + npm install
#   -EnableAutoStart    Enable auto-start without prompting
#   -SkipPrereqCheck    Skip prerequisite checks (not recommended)
#   -GhProxy <url>      GitHub download proxy, e.g. "https://ghproxy.com/"

param(
    [switch]$SkipPrereqCheck,
    [switch]$UseCnMirror,
    [switch]$ForceGit,
    [switch]$EnableAutoStart,
    [string]$GhProxy
)

$ErrorActionPreference = "Stop"

$RepoOwner = "JackeyInNottingham"
$RepoName = "claude-pet"
$RepoUrl = "https://github.com/$RepoOwner/$RepoName.git"
$InstallDir = "$env:USERPROFILE\.claude\skills\claude-pet"
$DataDir = "$env:USERPROFILE\.claude-pet"

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

# ── Platform detection ──
function Get-PlatformInfo {
    $plat = "win32"
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "ia32" }
    # Normalize arm64 detection (PowerShell 7+ / Windows on ARM)
    try {
        $envArch = $env:PROCESSOR_ARCHITECTURE
        if ($envArch -match "ARM64") { $arch = "arm64" }
    } catch {}
    return @{ Platform = $plat; Arch = $arch }
}

# ── Check prerequisites ──
function Check-Prereqs {
    Write-Host "Checking prerequisites..." -ForegroundColor Cyan

    # Node.js (always needed)
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        Write-Error "Node.js not found. Install Node.js 18+ from https://nodejs.org"
    }
    $nodeVer = (node -v) -replace 'v', ''
    if ([int]($nodeVer -split '\.')[0] -lt 18) {
        Write-Error "Node.js $nodeVer detected. Claude Pet requires Node.js 18+."
    }
    Write-Info "Node.js $(node -v)"

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

# ── Release download install ──
function Install-FromRelease {
    param($Platform, $Arch)

    Write-Host ""
    Write-Host "Fetching latest release information..." -ForegroundColor Cyan

    $apiUrl = "https://api.github.com/repos/$RepoOwner/$RepoName/releases/latest"
    $releaseJson = $null

    try {
        $response = Invoke-WebRequest -Uri $apiUrl -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        $releaseJson = $response.Content | ConvertFrom-Json
    } catch {
        Write-Warn "Could not reach GitHub API: $_"
        return $false
    }

    $tag = $releaseJson.tag_name
    if (-not $tag) {
        Write-Warn "Could not parse latest release tag from API."
        return $false
    }
    Write-Info "Latest release: $tag"

    # Build asset name: claude-pet-v0.1.0-win32-x64.zip
    $assetName = "claude-pet-${tag}-${Platform}-${Arch}.zip"

    # Find the download URL from assets
    $downloadUrl = $null
    foreach ($asset in $releaseJson.assets) {
        if ($asset.name -eq $assetName) {
            $downloadUrl = $asset.browser_download_url
            break
        }
    }

    if (-not $downloadUrl) {
        Write-Warn "No pre-built package found for ${Platform}-${Arch} (looked for: $assetName)"
        Write-Warn "Falling back to git clone + npm install..."
        return $false
    }

    # Apply proxy if configured
    if ($GhProxy) {
        $downloadUrl = "$GhProxy$downloadUrl"
        Write-Info "Using proxy: $GhProxy"
    }

    # Download
    Write-Host ""
    Write-Host "Downloading pre-built package..." -ForegroundColor Cyan
    Write-Host "  $assetName"

    $tmpFile = Join-Path $env:TEMP "claude-pet-$([System.Guid]::NewGuid().ToString('N').Substring(0,8)).zip"

    try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tmpFile -UseBasicParsing -TimeoutSec 300 -ErrorAction Stop
        $ProgressPreference = 'Continue'
    } catch {
        Write-Warn "Download failed: $_"
        Remove-Item $tmpFile -ErrorAction SilentlyContinue
        Write-Warn "Falling back to git clone + npm install..."
        return $false
    }

    Write-Info "Download complete ($([math]::Round((Get-Item $tmpFile).Length / 1MB, 1)) MB)"

    # Prepare install directory
    if (Test-Path $InstallDir) {
        $backup = "$InstallDir.bak"
        Write-Warn "$InstallDir exists. Backing up to $backup"
        Remove-Item $backup -Recurse -Force -ErrorAction SilentlyContinue
        Move-Item $InstallDir $backup
    }
    $null = New-Item -ItemType Directory -Force -Path $InstallDir

    # Extract
    Write-Host "Extracting..." -ForegroundColor Cyan
    try {
        Expand-Archive -Path $tmpFile -DestinationPath $InstallDir -Force

        # Fix: asset extracts to claude-pet/ subdir, move contents up
        $subDir = Join-Path $InstallDir "claude-pet"
        if (Test-Path $subDir) {
            Get-ChildItem $subDir | Move-Item -Destination $InstallDir -Force
            Remove-Item $subDir -Recurse -Force
        }
    } catch {
        Write-Warn "Extraction failed: $_"
        Remove-Item $tmpFile -ErrorAction SilentlyContinue
        Write-Warn "Falling back to git clone + npm install..."
        return $false
    }

    Remove-Item $tmpFile -ErrorAction SilentlyContinue

    # Verify
    $electronExe = Join-Path $InstallDir "electron\node_modules\electron\dist\electron.exe"
    if (-not (Test-Path $electronExe)) {
        Write-Warn "Electron binary not found in package: $electronExe"
        Write-Warn "Falling back to git clone + npm install..."
        return $false
    }

    Write-Info "Extracted to $InstallDir"
    Write-Info "Electron binary verified"
    return $true
}

# ── Clone / update repository (fallback) ──
function Install-Repo {
    # Git only needed for fallback
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
        Write-Error "Git not found. Install from https://git-scm.com"
    }
    Write-Info "git $(git --version | ForEach-Object { $_ -replace 'git version ', '' })"

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

# ── Electron dependencies (fallback) ──
function Install-ElectronDeps {
    Write-Host ""
    Write-Host "Installing Electron dependencies..." -ForegroundColor Cyan
    Push-Location "$InstallDir\electron"

    try {
        # Auto-detect China network (same logic as install.sh)
        $cnDetected = $UseCnMirror
        if (-not $cnDetected) {
            try {
                $conn = Test-Connection -ComputerName npmmirror.com -Count 1 -TimeToLive 32 -ErrorAction Stop
                if ($conn.Status -eq 'Success') { $cnDetected = $true }
            } catch {
                # Fallback: try TCP to port 443
                try {
                    $tcp = New-Object System.Net.Sockets.TcpClient
                    if ($tcp.ConnectAsync('npmmirror.com', 443).Wait(3000)) { $cnDetected = $true }
                    $tcp.Close()
                } catch {}
            }
        }
        if ($cnDetected) {
            Write-Warn "Detected potential China network. Using npmmirror Electron mirror."
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
    Write-Host "    /pet stop && iwr -UseBasicParsing https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.ps1 | iex" -ForegroundColor Cyan
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

$info = Get-PlatformInfo
Write-Info "Detected platform: $($info.Platform)-$($info.Arch)"

$releaseOk = $false
if (-not $ForceGit) {
    $releaseOk = Install-FromRelease -Platform $info.Platform -Arch $info.Arch
} else {
    Write-Info "ForceGit: using git clone + npm install"
}

if (-not $releaseOk) {
    Install-Repo
    Install-ElectronDeps
}

Install-Plugin
Post-Install
