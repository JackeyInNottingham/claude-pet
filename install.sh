#!/usr/bin/env bash
# Claude Pet Installer — macOS / Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.sh | bash
#
# Environment variables:
#   USE_CN_MIRROR=1     Use npmmirror for Electron (git+npm fallback path only)
#   GH_PROXY            GitHub download proxy, e.g. https://ghproxy.com/
#   FORCE_GIT=1         Skip release download, force git clone + npm install
set -euo pipefail

REPO_OWNER="JackeyInNottingham"
REPO_NAME="claude-pet"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"
INSTALL_DIR="$HOME/.claude/skills/claude-pet"
PLUGIN_NAME="claude-pet"

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

banner() {
  echo ""
  echo -e "${CYAN}  🐾  Claude Pet Installer${NC}"
  echo -e "${CYAN}  ─────────────────────${NC}"
  echo ""
}

info()  { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC}  $1"; }
error() { echo -e "  ${RED}✗${NC} $1"; }
abort() { error "$1"; exit 1; }

# ── Platform / arch detection ──
detect_platform() {
  case "$(uname -s | tr '[:upper:]' '[:lower:]')" in
    linux*)  echo "linux" ;;
    darwin*) echo "darwin" ;;
    cygwin*|mingw*|msys*) echo "win32" ;;
    *)       echo "unknown" ;;
  esac
}

detect_arch() {
  local arch
  arch=$(uname -m)
  case "$arch" in
    x86_64|amd64)  echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    *)             echo "$arch" ;;
  esac
}

# ── Check prerequisites (relaxed: git/npm only needed for fallback) ──
check_prereqs() {
  echo -e "${CYAN}Checking prerequisites...${NC}"

  # Node.js (always needed for plugin validate and electron runtime)
  if ! command -v node &>/dev/null; then
    abort "Node.js not found. Install Node.js 18+ from https://nodejs.org"
  fi
  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VER" -lt 18 ]; then
    abort "Node.js $NODE_VER detected. Claude Pet requires Node.js 18+. Install from https://nodejs.org"
  fi
  info "Node.js $(node -v)"

  # curl or wget (needed for release download)
  if command -v curl &>/dev/null; then
    DOWNLOADER="curl"
    info "curl available"
  elif command -v wget &>/dev/null; then
    DOWNLOADER="wget"
    info "wget available"
  else
    abort "Neither curl nor wget found. Install one of them and retry."
  fi

  # Claude CLI
  if ! command -v claude &>/dev/null; then
    warn "claude CLI not found in PATH. Plugin install step will be skipped."
    warn "Plugins in ~/.claude/skills/ auto-load on next session — no manual registration needed."
    CLAUDE_MISSING=true
  else
    info "claude CLI found"
    CLAUDE_MISSING=false
  fi
}

# ── Download helper ──
download_file() {
  local url="$1"
  local output="$2"
  if [ "$DOWNLOADER" = "curl" ]; then
    curl -fsSL --retry 3 --retry-delay 2 -o "$output" "$url"
  else
    wget -q --tries=3 --timeout=30 -O "$output" "$url"
  fi
}

# ── Release download install ──
install_from_release() {
  local platform="$1"
  local arch="$2"

  echo ""
  echo -e "${CYAN}Fetching latest release information...${NC}"

  local api_url="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest"
  local release_json
  release_json=$(download_file "$api_url" - 2>/dev/null) || {
    warn "Could not reach GitHub API."
    return 1
  }

  # Extract tag name
  local tag
  tag=$(echo "$release_json" | grep -o '"tag_name": *"[^"]*"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)"/\1/')
  if [ -z "$tag" ]; then
    warn "Could not parse latest release tag from API."
    return 1
  fi
  info "Latest release: $tag"

  # Build asset name: claude-pet-v0.1.0-darwin-arm64.tar.gz (or .zip for win32)
  local ext="tar.gz"
  [ "$platform" = "win32" ] && ext="zip"
  local asset_name="claude-pet-${tag}-${platform}-${arch}.${ext}"

  # Find the download URL from the assets array
  local download_url
  download_url=$(echo "$release_json" | grep -o '"browser_download_url": *"[^"]*'"${asset_name}"'[^"]*"' | head -1 | sed 's/.*"browser_download_url": *"\([^"]*\)"/\1/')

  if [ -z "$download_url" ]; then
    warn "No pre-built package found for ${platform}-${arch} (looked for: ${asset_name})"
    warn "Falling back to git clone + npm install..."
    return 1
  fi

  # Apply proxy if configured
  if [ -n "${GH_PROXY:-}" ]; then
    download_url="${GH_PROXY}${download_url}"
    info "Using proxy: ${GH_PROXY}"
  fi

  # Download
  echo ""
  echo -e "${CYAN}Downloading pre-built package...${NC}"
  echo -e "  ${asset_name}"

  local tmpfile
  tmpfile=$(mktemp /tmp/claude-pet-XXXXXX."${ext}")

  if ! download_file "$download_url" "$tmpfile"; then
    warn "Download failed. Falling back to git clone + npm install..."
    rm -f "$tmpfile"
    return 1
  fi
  info "Download complete"

  # Prepare install directory
  if [ -d "$INSTALL_DIR" ]; then
    warn "$INSTALL_DIR exists. Backing up to ${INSTALL_DIR}.bak"
    rm -rf "${INSTALL_DIR}.bak" 2>/dev/null || true
    mv "$INSTALL_DIR" "${INSTALL_DIR}.bak"
  fi
  mkdir -p "$INSTALL_DIR"

  # Extract
  echo -e "${CYAN}Extracting...${NC}"

  if [ "$ext" = "zip" ]; then
    # Unzip — check if available
    if ! command -v unzip &>/dev/null; then
      warn "unzip not found. Falling back to git clone..."
      rm -f "$tmpfile"
      return 1
    fi
    unzip -q "$tmpfile" -d "$INSTALL_DIR"
    # Fix: asset extracts to claude-pet/ subdir, move contents up
    if [ -d "$INSTALL_DIR/claude-pet" ]; then
      mv "$INSTALL_DIR/claude-pet"/* "$INSTALL_DIR/claude-pet"/.[!.]* "$INSTALL_DIR/claude-pet"/..?* "$INSTALL_DIR/" 2>/dev/null || true
      rmdir "$INSTALL_DIR/claude-pet" 2>/dev/null || true
    fi
  else
    tar -xzf "$tmpfile" -C "$INSTALL_DIR"
    # Fix: asset extracts to claude-pet/ subdir, move contents up
    if [ -d "$INSTALL_DIR/claude-pet" ]; then
      mv "$INSTALL_DIR/claude-pet"/* "$INSTALL_DIR/claude-pet"/.[!.]* "$INSTALL_DIR/claude-pet"/..?* "$INSTALL_DIR/" 2>/dev/null || true
      rmdir "$INSTALL_DIR/claude-pet" 2>/dev/null || true
    fi
  fi

  rm -f "$tmpfile"

  # Fix permissions (macOS/Linux: electron binary needs +x)
  local electron_bin="$INSTALL_DIR/electron/node_modules/electron/dist/electron"
  if [ -f "$electron_bin" ]; then
    chmod +x "$electron_bin" 2>/dev/null || true
  fi
  # chrome-sandbox on Linux
  local sandbox="$INSTALL_DIR/electron/node_modules/electron/dist/chrome-sandbox"
  if [ -f "$sandbox" ]; then
    chmod 4755 "$sandbox" 2>/dev/null || chmod +x "$sandbox" 2>/dev/null || true
  fi

  info "Extracted to $INSTALL_DIR"
  return 0
}

# ── Fallback: git clone + npm install ──
install_repo() {
  # Git is only needed for the fallback path
  if ! command -v git &>/dev/null; then
    abort "Git not found. Install from https://git-scm.com"
  fi
  info "git $(git --version | awk '{print $3}')"

  if [ -d "$INSTALL_DIR/.git" ]; then
    echo ""
    echo -e "${CYAN}Repository exists, updating...${NC}"
    cd "$INSTALL_DIR"
    git pull --ff-only origin main || warn "Could not update repo (local changes?). Continuing with current version."
  else
    echo ""
    echo -e "${CYAN}Cloning repository...${NC}"
    if [ -d "$INSTALL_DIR" ]; then
      warn "$INSTALL_DIR exists but is not a git repo. Backing up to ${INSTALL_DIR}.bak"
      rm -rf "${INSTALL_DIR}.bak" 2>/dev/null || true
      mv "$INSTALL_DIR" "${INSTALL_DIR}.bak"
    fi
    git clone "$REPO_URL" "$INSTALL_DIR"
    info "Repository cloned to $INSTALL_DIR"
  fi
}

install_electron_deps() {
  echo ""
  echo -e "${CYAN}Installing Electron dependencies...${NC}"
  cd "$INSTALL_DIR/electron"

  # Check for China mirror preference
  if [ "${USE_CN_MIRROR:-}" = "1" ] || ping -c 1 -W 1 npmmirror.com &>/dev/null 2>&1; then
    warn "Detected potential China network. Using npmmirror Electron mirror."
    export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
  fi

  npm install
  info "Electron dependencies installed"

  # Verify electron binary exists
  if [ -f "$INSTALL_DIR/electron/node_modules/.bin/electron" ] || [ -f "$INSTALL_DIR/electron/node_modules/.bin/electron.cmd" ]; then
    info "Electron binary verified"
  else
    error "Electron binary not found after install. Check npm install output above."
    return 1
  fi
}

# ── Validate plugin structure ──
install_plugin() {
  echo ""
  echo -e "${CYAN}Validating plugin structure...${NC}"

  if [ "$CLAUDE_MISSING" = true ]; then
    warn "Skipping validation (claude CLI not available)."
    echo ""
    echo -e "  Plugins in ~/.claude/skills/ auto-load on next session."
    return
  fi

  # Skills-dir plugins auto-load — no explicit install needed.
  # Validate that the manifest is well-formed.
  if claude plugin validate "$INSTALL_DIR" 2>/dev/null; then
    info "Plugin validated — auto-loads as claude-pet@skills-dir"
  else
    warn "Plugin validation had issues (non-fatal). Check plugin.json format if the plugin doesn't load."
  fi
}

# ── Post-install ──
post_install() {
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  🐾 Claude Pet installed successfully!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  Commands:"
  echo -e "    ${CYAN}/pet start${NC}    — Launch the pet"
  echo -e "    ${CYAN}/pet stop${NC}     — Close the pet"
  echo -e "    ${CYAN}/pet toggle${NC}   — Toggle auto-start on session launch"
  echo -e "    ${CYAN}/pet status${NC}   — Check if the pet is running"
  echo ""
  echo -e "  Or start from terminal:"
  echo -e "    ${CYAN}cd $INSTALL_DIR/electron && npm start${NC}"
  echo ""
  echo -e "  To update later:"
  echo -e "    ${CYAN}/pet stop && curl -fsSL https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.sh | bash${NC}"
  echo ""

  # Ask about auto-start
  # read fails (exit 1) when piped via curl|bash (stdin at EOF); || true keeps set -e happy
  read -r -p "  Enable auto-start on Claude Code session launch? [Y/n] " REPLY || true
  if [ "${REPLY:-y}" = "y" ] || [ "${REPLY:-y}" = "Y" ] || [ -z "$REPLY" ]; then
    rm -f "$HOME/.claude-pet/auto-start-disabled"
    info "Auto-start enabled"
  else
    mkdir -p "$HOME/.claude-pet"
    touch "$HOME/.claude-pet/auto-start-disabled"
    info "Auto-start disabled (use /pet toggle to change)"
  fi
}

# ── Run ──
banner
check_prereqs

PLATFORM=$(detect_platform)
ARCH=$(detect_arch)
info "Detected platform: ${PLATFORM}-${ARCH}"

# Try release download first, fall back to git clone + npm install
if [ "${FORCE_GIT:-0}" != "1" ] && install_from_release "$PLATFORM" "$ARCH"; then
  :  # success — release package installed
else
  # Fallback: traditional git clone + npm install
  if [ "${FORCE_GIT:-0}" = "1" ]; then
    info "FORCE_GIT=1: using git clone + npm install"
  fi
  install_repo
  install_electron_deps
fi

install_plugin
post_install
