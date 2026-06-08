---
description: Control the Claude Pet desktop companion — start, stop, toggle, or check status
---

# /pet — Control the Claude Pet desktop companion

Start, stop, or toggle the desktop pet that reflects Claude Code's running status.

## Usage

`/pet start`  — Launch the pet window
`/pet stop`   — Close the pet window
`/pet toggle` — Enable/disable auto-start on session launch
`/pet status` — Show current pet state

## Implementation

Run `node "${CLAUDE_PLUGIN_ROOT}/commands/pet-control.js" <action>` where `<action>` is one of `start`, `stop`, `toggle`, `status`.

Cross-platform: the `.js` script uses only Node.js built-ins (no bash/curl dependency). Windows can also use the `.cmd` launcher: `"${CLAUDE_PLUGIN_ROOT}/commands/pet-control.cmd" <action>`.
