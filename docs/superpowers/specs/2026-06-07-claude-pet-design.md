# Claude Pet — Desktop Pet Plugin Design

## Overview

A Claude Code plugin that brings a desktop pet (the ASCII mascot from CLI) to life. The pet sits on the user's desktop, reflects Claude Code's real-time status through animations and expressions, and provides an interactive dialog for handling permission requests.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Claude Code Process                                │
│                                                     │
│  Hooks System                                       │
│  ├─ PreToolUse  ──→ notify "reading/searching/      │
│  │                   writing/executing"             │
│  ├─ PostToolUse ──→ notify "done with X"           │
│  ├─ Stop         ──→ notify "idle"                 │
│  ├─ Notification ──→ notify "permission_needed"    │
│  └─ SessionStart──→ launch pet / notify "started"  │
│                                                     │
│  Hook Scripts (bash)                                │
│  └─ curl POST localhost:<port>/status ──────────┐  │
└─────────────────────────────────────────────────│──┘
                                                  │
                    HTTP (localhost only)          │
                                                  │
┌─────────────────────────────────────────────────│──┐
│  Electron App (Desktop Pet)                     │  │
│                                                 │  │
│  ┌──────────────┐    ┌──────────────────┐      │  │
│  │ HTTP Server  │───→│  State Machine    │      │  │
│  │ (localhost)  │    │  ┌────────────┐  │      │  │
│  └──────────────┘    │  │ idle        │  │      │  │
│                      │  │ reading     │  │      │  │
│  ┌──────────────┐    │  │ searching   │  │      │  │
│  │ Animation    │←───│  │ thinking    │  │      │  │
│  │ Engine       │    │  │ writing     │  │      │  │
│  └──────────────┘    │  │ executing   │  │      │  │
│                      │  │ error       │  │      │  │
│  ┌──────────────┐    │  └────────────┘  │      │  │
│  │ Renderer     │    └──────────────────┘      │  │
│  │ (Canvas)     │                              │  │
│  └──────────────┘    ┌──────────────────┐      │  │
│                      │ Permission       │      │  │
│                      │ Dialog           │      │  │
│                      └──────────────────┘      │  │
└─────────────────────────────────────────────────┘──┘
```

## Plugin Structure

```
claude-pet/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── hooks/
│   ├── hooks.json               # Hook event bindings
│   ├── notify-pet.sh            # Cross-platform status notification
│   ├── run-hook.cmd             # Windows polyglot wrapper
│   └── session-start            # Auto-launch script
├── electron/
│   ├── main.js                  # Electron main process + HTTP server
│   ├── preload.js               # Context bridge
│   ├── pet-window.html          # Pet renderer window
│   ├── pet.css                  # Styles
│   ├── pet-renderer.js          # Canvas animation + state machine
│   └── assets/
│       └── sprites/             # Character sprite sheets
├── commands/
│   ├── pet.md                   # /pet start|stop|toggle command
│   └── pet-control.sh           # Manual control script
└── README.md
```

## State Machine

7 states, each triggered by specific hook events:

| State | Trigger (Hook Event) | Matcher | Animation / Expression |
|---|---|---|---|
| **idle** | Stop, SessionStart, timer after last tool | — | Blinking, breathing, occasional glance |
| **reading** | PreToolUse | `Read` | Flipping pages, eyes scanning left-right |
| **searching** | PreToolUse | `Grep\|Glob\|Task` | Magnifying glass, looking around |
| **thinking** | Between PostToolUse & next PreToolUse (timeout) | — | Head tilt, gears/spinning indicator |
| **writing** | PreToolUse | `Write\|Edit\|NotebookEdit` | Typing animation, focused expression |
| **executing** | PreToolUse | `Bash` | Cog spinning, "working" pose |
| **error** | PostToolUseFailure, StopFailure | any | Startled/shocked, sweat drop |

### State Display Mapping

The character uses:
- **Eyes**: shape changes per state (normal, closed, wide, squinting)
- **Body**: subtle bounce/wobble animation
- **Accessories**: props that appear contextually (glasses for reading, wrench for executing, etc.)
- **Color tint**: warm glow during work, dim during idle, red flash for errors
- **Speech bubble**: short text like "Reading...", "Writing code...", "Oops!"

## Permission Dialog Flow

```
1. Claude Code needs user permission (e.g., Bash command)
2. Notification hook fires → curl POST to localhost
3. Electron shows dialog bubble above pet: "Allow this command?"
   ┌──────────────────────────┐
   │  ⚠️ Allow this command?  │
   │  npm install react       │
   │                          │
   │  [Allow]  [Deny]         │
   └──────────────────────────┘
4. User clicks Allow/Deny
5. Electron responds to Claude Code via exit code or HTTP response
```

Hook config for permission:
```json
{
  "Notification": [
    {
      "matcher": "permission_prompt",
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/hooks/notify-pet.sh permission"
      }]
    }
  ]
}
```

## User Commands

| Command | Action |
|---|---|
| `/pet start` | Launch pet window |
| `/pet stop` | Close pet window |
| `/pet toggle` | Toggle auto-start on Claude Code launch |
| `/pet status` | Show current pet state |

## Cross-Platform Strategy

| Layer | macOS | Windows |
|---|---|---|
| Hook scripts | bash (built-in) | bash via Git for Windows (run-hook.cmd polyglot) |
| Electron window | Transparent, always-on-top, no-taskbar | Same |
| Auto-launch | SessionStart hook | Same |
| Font rendering | SF Symbol fallback → emoji | Segoe UI Emoji |
| System tray | Tray icon with menu | Same |

## Electron Window Specs

- **Window**: Frameless, transparent, always-on-top, 256×256 px (accommodates 128×128 sprite + bubble + props)
- **Position**: Persisted to user prefs, default bottom-right
- **Drag**: Click-drag anywhere on pet to reposition
- **Right-click menu**: Start/Stop/Toggle/Quit
- **Rendering**: HTML Canvas, 32×32 sprites rendered at 4x integer scale (nearest-neighbor, no blur)

## Local HTTP API

Electron starts a server on a random available port (stored in `~/.claude-pet/port`).

```
POST /status     { "state": "writing", "detail": "Edit app.tsx" }
POST /permission { "type": "bash", "command": "npm install", "requestId": "..." }
GET  /health     → { "status": "ok" }
```

## Visual Design

### Character

Based on the Claude Code CLI mascot — a small, blocky geometric creature:

```
▐▛███▜▌
▝▜█████▛▘
  ▘▘ ▝▝
```

The pixel art character keeps this silhouette: a rounded-square body with distinctive ear/antenna-like protrusions on top, small feet at the bottom, and expressive eyes in the center.

### Art Style

- **Pixel art**, hand-drawn at 32×32 base resolution, displayed at 4x scale (128×128 px on screen)
- **Cute/kawaii**: rounded forms despite pixel constraints, large expressive eyes, small body proportions
- **Frame-based animation**: 4–8 frames per state, 8–12 FPS playback
- **Outline**: 1px dark outline around character for contrast against any background

### Color Palette

Derived from Claude's brand amber/golden tones:

| Swatch | Hex | Role |
|---|---|---|
| 🟠 Primary | `#F59E0B` | Body fill, main character color |
| 🟡 Highlight | `#FBBF24` | Body highlights, cheek blush |
| 🟤 Dark | `#92400E` | Outline, eye pupils, details |
| ⚪ Light | `#FEF3C7` | Eye whites, shine accents |
| 🔴 Accent (error) | `#EF4444` | Error state flash, sweat drop tint |
| 🔵 Accent (info) | `#3B82F6` | Thinking indicator, reading glasses |

### State Visuals

| State | Body Pose | Eyes | Accessory | Anim Frames |
|---|---|---|---|---|
| idle | Standing, slight bounce loop | Half-closed, occasional blink | None | 4 (breathe) + 2 (blink) |
| reading | Sitting, leaning forward | Wide, pupils scanning L→R | Small square glasses | 4 (scan) |
| searching | Standing on tiptoes, leaning | Squinting, looking around | Magnifying glass (pops up) | 6 (look L, R, up) |
| thinking | Sitting, head tilted | Looking up-right, one eye slightly larger | Floating "?" or gear above head | 8 (spin gear) |
| writing | Standing at tiny keyboard | Focused, slightly narrowed | Small keyboard prop lower edge | 4 (tap keys) |
| executing | Determined pose, arms out | Determined (angled brows) | Spinning cog/gear | 6 (cog rotates) |
| error | Jumped back, arms up | Wide open, X_X or spiral | Sweat drop | 2 (startle) |

### Speech Bubble

- Rounded pixel-art style bubble appearing above the character
- White/cream background with dark text
- Max 2 lines, short text per state: "Reading...", "Searching...", "Thinking...", "Writing code...", "Running...", "Oops!"
- Fades in/out with scale bounce animation

## Security

- HTTP server binds to `127.0.0.1` only, not accessible from network
- Hook scripts are trusted internal components, no user input injection risk
- No external dependencies beyond Electron
