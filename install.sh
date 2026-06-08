#!/usr/bin/env bash
# Claude Pet Installer — macOS / Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.sh | bash
set -euo pipefail

REPO_URL="https://github.com/JackeyInNottingham/claude-pet.git"
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

# ── Check prerequisites ──
check_prereqs() {
  echo -e "${CYAN}Checking prerequisites...${NC}"

  # Node.js
  if ! command -v node &>/dev/null; then
    abort "Node.js not found. Install Node.js 18+ from https://nodejs.org"
  fi
  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VER" -lt 18 ]; then
    abort "Node.js $NODE_VER detected. Claude Pet requires Node.js 18+. Install from https://nodejs.org"
  fi
  info "Node.js $(node -v)"

  # npm
  if ! command -v npm &>/dev/null; then
    abort "npm not found (should come with Node.js)."
  fi
  info "npm $(npm -v)"

  # Git
  if ! command -v git &>/dev/null; then
    abort "Git not found. Install from https://git-scm.com"
  fi
  info "git $(git --version | awk '{print $3}')"

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

# ── Clone / update repository ──
install_repo() {
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
      mv "$INSTALL_DIR" "${INSTALL_DIR}.bak"
    fi
    git clone "$REPO_URL" "$INSTALL_DIR"
    info "Repository cloned to $INSTALL_DIR"
  fi
}

# ── Electron dependencies ──
install_electron_deps() {
  echo ""
  echo -e "${CYAN}Installing Electron dependencies...${NC}"
  cd "$INSTALL_DIR/electron"

  # Check for China mirror preference
  if [ "${USE_CN_MIRROR:-}" = "1" ] || ping -c 1 -W 1 npmmirror.com &>/dev/null 2>&1; then
    warn "Detected potential China network. Using npmmirror Electron mirror."
    export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
  fi

  npm install --production
  info "Electron dependencies installed"
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
  echo -e "    ${CYAN}cd $INSTALL_DIR && git pull && cd electron && npm install${NC}"
  echo ""

  # Ask about auto-start
  read -r -p "  Enable auto-start on Claude Code session launch? [Y/n] " REPLY
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
install_repo
install_electron_deps
install_plugin
post_install
