#!/usr/bin/env bash
# Claude Pet Uninstaller — macOS / Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/uninstall.sh | bash
# Or:    bash uninstall.sh
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTALL_DIR="$HOME/.claude/skills/claude-pet"
DATA_DIR="$HOME/.claude-pet"

echo ""
echo -e "${CYAN}  🐾  Claude Pet Uninstaller${NC}"
echo -e "${CYAN}  ────────────────────────${NC}"
echo ""

info()  { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC}  $1"; }

# ── Stop running pet ──
echo -e "${CYAN}Stopping Claude Pet...${NC}"
PORT_FILE="$DATA_DIR/port"
if [ -f "$PORT_FILE" ]; then
  PORT=$(head -n 1 "$PORT_FILE" 2>/dev/null || echo "")
  if [ -n "$PORT" ]; then
    curl -s -X POST "http://127.0.0.1:$PORT/shutdown" > /dev/null 2>&1 || true
    sleep 1
    info "Pet process stopped"
  fi
fi

# ── Remove plugin directory ──
echo ""
echo -e "${CYAN}Removing plugin files...${NC}"
if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  info "Removed $INSTALL_DIR"
else
  warn "Plugin directory not found: $INSTALL_DIR"
fi

# ── Remove data directory ──
echo ""
if [ -d "$DATA_DIR" ]; then
  echo -e "${YELLOW}Remove data directory?${NC}"
  echo -e "  This includes: port file, launcher lock, position, permissions cache, version state"
  echo -e "  Location: ${CYAN}$DATA_DIR${NC}"
  # read fails (exit 1) when piped via curl|bash (stdin at EOF); || true keeps set -e happy
  read -r -p "  Remove $DATA_DIR? [Y/n] " REPLY || true
  if [ "${REPLY:-y}" = "y" ] || [ "${REPLY:-y}" = "Y" ] || [ -z "$REPLY" ]; then
    rm -rf "$DATA_DIR"
    info "Removed $DATA_DIR"
  else
    info "Kept $DATA_DIR"
  fi
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🐾 Claude Pet uninstalled successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  To reinstall:"
echo -e "    ${CYAN}curl -fsSL https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.sh | bash${NC}"
echo ""
