#!/usr/bin/env bash
# Claude Pet Developer Install — installs from LOCAL directory (not GitHub)
# Usage: bash dev-install.sh [path-to-claude-pet-repo]
# Default: current directory
#
# This is for local development/testing. It copies (or symlinks) the local
# source to ~/.claude/skills/claude-pet and runs npm install.
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/.claude/skills/claude-pet"
DATA_DIR="$HOME/.claude-pet"

echo ""
echo -e "${CYAN}  🐾  Claude Pet Dev Install${NC}"
echo -e "${CYAN}  ─────────────────────────${NC}"
echo ""
echo -e "  Source:  ${CYAN}$SOURCE_DIR${NC}"
echo -e "  Target:  ${CYAN}$INSTALL_DIR${NC}"
echo ""

info()  { echo -e "  ${GREEN}✓${NC} $1"; }

# Stop any running pet
echo -e "${CYAN}Stopping running pet (if any)...${NC}"
PORT_FILE="$DATA_DIR/port"
if [ -f "$PORT_FILE" ]; then
  PORT=$(head -n 1 "$PORT_FILE" 2>/dev/null || echo "")
  if [ -n "$PORT" ]; then
    curl -s -X POST "http://127.0.0.1:$PORT/shutdown" > /dev/null 2>&1 || true
    sleep 1
  fi
fi

# Remove old installation
if [ -d "$INSTALL_DIR" ] || [ -L "$INSTALL_DIR" ]; then
  echo -e "${YELLOW}Removing existing installation...${NC}"
  rm -rf "$INSTALL_DIR"
fi

# Install: copy or symlink
echo ""
read -r -p "  Use symlink? [Y/n] " USE_SYMLINK || true
if [ "${USE_SYMLINK:-y}" = "y" ] || [ "${USE_SYMLINK:-y}" = "Y" ] || [ -z "$USE_SYMLINK" ]; then
  # Create parent dir
  mkdir -p "$(dirname "$INSTALL_DIR")"
  # Symlink the whole repo
  ln -s "$SOURCE_DIR" "$INSTALL_DIR"
  info "Symlinked $SOURCE_DIR → $INSTALL_DIR"
else
  mkdir -p "$INSTALL_DIR"
  # Copy excluding node_modules, .git
  if command -v rsync &>/dev/null; then
    rsync -a --exclude='node_modules' --exclude='.git' --exclude='*.log' "$SOURCE_DIR/" "$INSTALL_DIR/"
  else
    # Fallback for systems without rsync (e.g., minimal Docker images)
    for item in "$SOURCE_DIR"/* "$SOURCE_DIR"/.[!.]* "$SOURCE_DIR"/..?*; do
      [ -e "$item" ] || continue
      case "$(basename "$item")" in
        node_modules|.git|*.log) continue ;;
        *) cp -r "$item" "$INSTALL_DIR/" ;;
      esac
    done
  fi
  info "Copied $SOURCE_DIR → $INSTALL_DIR"
fi

# Install dependencies
echo ""
echo -e "${CYAN}Installing Electron dependencies...${NC}"
cd "$INSTALL_DIR/electron"
npm install
info "Electron dependencies installed"

# Enable auto-start
rm -f "$DATA_DIR/auto-start-disabled"
info "Auto-start enabled"

# Validate plugin
echo ""
echo -e "${CYAN}Validating plugin...${NC}"
if claude plugin validate "$INSTALL_DIR" 2>/dev/null; then
  info "Plugin validated — auto-loads as claude-pet@skills-dir"
else
  echo -e "  ${YELLOW}⚠${NC}  Validation had issues (non-fatal)"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🐾 Claude Pet dev-installed!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Start pet now:  ${CYAN}cd electron && npm start${NC}"
echo -e "  Or restart Claude Code to auto-start."
echo ""
