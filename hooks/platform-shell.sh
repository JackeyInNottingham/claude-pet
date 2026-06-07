#!/usr/bin/env bash
# Cross-platform shell detection for hook scripts
# Used by run-hook.cmd on Windows

case "$(uname -s)" in
  Linux*)  echo "linux" ;;
  Darwin*) echo "macos" ;;
  CYGWIN*|MINGW*|MSYS*) echo "windows" ;;
  *)       echo "unknown" ;;
esac
