#!/usr/bin/env bash
# Package claude-pet for distribution with pre-installed Electron.
# Used by GitHub Actions CI matrix (each runner builds its own platform).
#
# Usage: bash scripts/package-release.sh [version]
#   version defaults to reading from .claude-plugin/plugin.json
#
# Output: dist/claude-pet-v{version}-{platform}-{arch}.{tar.gz|zip}
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

# ── Detect version (VERSION file is canonical) ──
if [ $# -ge 1 ]; then
  VERSION="$1"
elif [ -f "$REPO_ROOT/VERSION" ]; then
  VERSION=$(head -n 1 "$REPO_ROOT/VERSION" | tr -d '[:space:]')
else
  VERSION=$(node -e "console.log(require('./.claude-plugin/plugin.json').version)" 2>/dev/null || echo "0.0.0")
fi

# Sync VERSION → plugin.json / package.json during package
echo "$VERSION" > "$REPO_ROOT/VERSION"
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('.claude-plugin/plugin.json','utf8'));
  p.version = '$VERSION';
  fs.writeFileSync('.claude-plugin/plugin.json', JSON.stringify(p, null, 2) + '\n');
  const e = JSON.parse(fs.readFileSync('electron/package.json','utf8'));
  e.version = '$VERSION';
  fs.writeFileSync('electron/package.json', JSON.stringify(e, null, 2) + '\n');
  console.log('Synced version $VERSION to plugin.json and package.json');
" 2>/dev/null || true

# ── Detect platform / arch ──
PLATFORM=$(node -e "console.log(process.platform)" 2>/dev/null || uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(node -e "console.log(process.arch)" 2>/dev/null || uname -m)

# Normalize arch names
case "$ARCH" in
  x86_64|amd64)  ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac

# Normalize platform names (from uname if node wasn't available)
case "$PLATFORM" in
  linux)   PLATFORM="linux" ;;
  darwin)  PLATFORM="darwin" ;;
  mingw*|msys*|cygwin*|win32) PLATFORM="win32" ;;
esac

echo "Building claude-pet v${VERSION} for ${PLATFORM}-${ARCH}"

# ── Clean ──
rm -rf dist/build dist/*.tar.gz dist/*.zip 2>/dev/null || true
mkdir -p dist/build/claude-pet

# ── Copy files into build dir ──
# Include: .claude-plugin, commands, hooks, electron, docs, scripts at root
# Exclude: .git, node_modules, dist, *.log, DEVLOG.md, memory
echo "Copying source files..."

# Copy root-level files
for item in *; do
  [ -e "$item" ] || continue
  case "$item" in
    .git|.claude|node_modules|dist|DEVLOG.md|memory) continue ;;
    *) cp -r "$item" "dist/build/claude-pet/" ;;
  esac
done

# Copy dotfiles at root that matter
for item in .*; do
  [ -e "$item" ] || continue
  case "$item" in
    .|..|.git|.gitignore) continue ;;
    *) cp -r "$item" "dist/build/claude-pet/" ;;
  esac
done

# Ensure the electron binary is executable (Linux/macOS)
fix_permissions() {
  local electron_dir="dist/build/claude-pet/electron"
  if [ -d "$electron_dir/node_modules/electron/dist" ]; then
    local electron_bin="$electron_dir/node_modules/electron/dist/electron"
    if [ -f "$electron_bin" ]; then
      chmod +x "$electron_bin"
    fi
    # Also fix chrome-sandbox (needs setuid on some Linux)
    if [ -f "$electron_dir/node_modules/electron/dist/chrome-sandbox" ]; then
      chmod 4755 "$electron_dir/node_modules/electron/dist/chrome-sandbox" 2>/dev/null || \
        chmod +x "$electron_dir/node_modules/electron/dist/chrome-sandbox" || true
    fi
  fi
}

# ── Install Electron ──
ELECTRON_DIR="dist/build/claude-pet/electron"

# Reuse local node_modules if available (speeds up local builds; CI won't have them)
if [ -d "$REPO_ROOT/electron/node_modules/electron" ] && [ ! -d "$ELECTRON_DIR/node_modules/electron" ]; then
  echo "Copying existing electron/node_modules from local install..."
  cp -r "$REPO_ROOT/electron/node_modules" "$ELECTRON_DIR/node_modules"
  echo "Electron copied ($(du -sh "$ELECTRON_DIR/node_modules" 2>/dev/null | cut -f1))"
elif [ ! -d "$ELECTRON_DIR/node_modules/electron" ]; then
  echo "Installing Electron in build directory..."
  cd "$ELECTRON_DIR"
  npm install --production
  cd "$REPO_ROOT"
else
  echo "Electron already present, skipping npm install"
fi

fix_permissions

# ── Create archive ──
mkdir -p dist

if [ "$PLATFORM" = "win32" ]; then
  ARCHIVE_NAME="claude-pet-v${VERSION}-${PLATFORM}-${ARCH}.zip"
  echo "Creating $ARCHIVE_NAME..."
  if command -v zip &>/dev/null; then
    (cd dist/build && zip -qr "../../${ARCHIVE_NAME}" claude-pet)
  elif command -v powershell &>/dev/null; then
    powershell -Command "Compress-Archive -Path dist/build/claude-pet -DestinationPath dist/${ARCHIVE_NAME} -Force"
  else
    echo "ERROR: Neither zip nor powershell found. Cannot create zip."
    exit 1
  fi
else
  ARCHIVE_NAME="claude-pet-v${VERSION}-${PLATFORM}-${ARCH}.tar.gz"
  echo "Creating $ARCHIVE_NAME..."
  tar -czf "dist/${ARCHIVE_NAME}" -C dist/build claude-pet
fi

# ── Checksums ──
if command -v sha256sum &>/dev/null; then
  sha256sum "dist/${ARCHIVE_NAME}" > "dist/${ARCHIVE_NAME}.sha256"
elif command -v shasum &>/dev/null; then
  shasum -a 256 "dist/${ARCHIVE_NAME}" > "dist/${ARCHIVE_NAME}.sha256"
fi

# ── Result ──
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Package created:"
echo "  dist/${ARCHIVE_NAME}"
ls -lh "dist/${ARCHIVE_NAME}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Upload this file to GitHub Release v${VERSION}"
# Clean up build dir
rm -rf dist/build
