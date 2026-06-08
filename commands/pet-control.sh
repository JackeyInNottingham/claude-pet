#!/usr/bin/env bash
# pet-control.sh — Unix launcher, delegates to the cross-platform JS implementation
exec node "$(dirname "$0")/pet-control.js" "$@"
