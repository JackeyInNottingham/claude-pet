# Claude Pet 🐾

[中文文档](./README.zh-CN.md)

A cute pixel-art desktop pet that lives on your screen, reflecting Claude Code's real-time status — reading, writing, searching, executing, and handling permission requests through an interactive dialog.

## What It Shows

| State | What Claude is doing | Permission Handling |
| ----- | -------------------- | ------------------- |
| 😴 Idle | Waiting for your input | — |
| 📖 Reading | Reading files | — |
| 🔍 Searching | Searching code / web | — |
| 🤔 Thinking | Processing / reasoning | — |
| ✍️ Writing | Editing files | — |
| ⚙️ Executing | Running commands | — |
| 😱 Error | Something went wrong | — |
| 🙋 Permission | Needs your approval | Shows dialog with tool details |
| ✅ Allowed | Permission granted | Brief ✓ feedback animation |
| ❌ Denied | Permission denied | Brief sinking animation |

The mascot is **Clawd** — Claude Code's terminal mascot — rendered as crisp pixel art (32×32 logical pixels × 8 nearest-neighbor scaling) with state-specific props: glasses for reading, magnifying glass for searching, spinning gear for executing, `?` for thinking, `!` for permission.

## Install

### Method 1: One-liner (Recommended)

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.sh | bash
```

**Windows (PowerShell):**

```powershell
iwr -UseBasicParsing https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.ps1 | iex
```

> For users in China: add `USE_CN_MIRROR=1` before `bash` (macOS/Linux) or `-UseCnMirror` (Windows) to use the npmmirror Electron mirror.

The script clones the repo, installs dependencies, registers the plugin with Claude Code, and asks whether to enable auto-start. It is **idempotent** — running it again runs `git pull` to update.

### Method 2: Manual

```bash
git clone https://github.com/JackeyInNottingham/claude-pet.git ~/.claude/skills/claude-pet
cd ~/.claude/skills/claude-pet/electron
npm install
# Plugin auto-loads as claude-pet@skills-dir on next session
```

To update later:

```bash
cd ~/.claude/skills/claude-pet && git pull && cd electron && npm install
```

## Commands

| Command | Action |
| ------- | ------ |
| `/pet start` | Launch the pet window |
| `/pet stop` | Close the pet window |
| `/pet toggle` | Enable/disable auto-start on session launch |
| `/pet status` | Show whether the pet is running |

## How It Works

```
Claude Code hooks → notify-pet.sh → POST /status → Electron HTTP server
                                      → IPC → renderer → Canvas animation

Permission:
  Claude Code PermissionRequest → Hook → POST /permission → Electron dialog
  → User clicks → IPC → write response file → Hook polls → returns decision
```

The plugin is an **Electron app** (transparent, frameless, always-on-top 256×256 window) driven by **Claude Code hooks**. When Claude uses tools (Read, Write, Bash, etc.), hooks fire and POST state changes to a local HTTP server inside the Electron process. A finite state machine drives the 10-FPS Canvas animation.

## Requirements

| Dependency | Version | Notes |
| ---------- | ------- | ----- |
| Node.js | 18+ | — |
| Electron | 33.x | Installed automatically via npm |
| Git | Any | For cloning the repository |

- **macOS**: tested
- **Windows**: tested — hooks use pure Node.js, no Git Bash required

## Platform Notes

### Windows

- Install [Git for Windows](https://git-scm.com/download/win) for cloning the repo
- Hook scripts are pure Node.js — **no Git Bash required**
- Installer uses PowerShell; hooks run via `node` (built into Node.js)
- Electron window uses `skipTaskbar` to stay out of the taskbar

### macOS

- Electron window uses `setVisibleOnAllWorkspaces` so the pet follows you across Spaces
- `unset ELECTRON_RUN_AS_NODE` before launching Electron — some environments set this

### Important

If `ELECTRON_RUN_AS_NODE=1` is set in your environment, the Electron window will fail to launch. The install scripts and session-start hook automatically unset it. Just be aware if launching manually:

```bash
unset ELECTRON_RUN_AS_NODE && cd electron && npm start
```

## Troubleshooting

| Problem | Solution |
| ------- | -------- |
| Pet doesn't appear | Check `claude` CLI is installed. Run `/pet start`. Check `~/.claude-pet/port`. |
| Window launches but is blank | Ensure `ELECTRON_RUN_AS_NODE` is not set. |
| Permission dialog doesn't show | Windows: ensure `node` is in PATH. Check the pet is running (`/pet status`). |
| Hooks not firing | Verify plugin is registered: `claude plugin list`. Try `claude plugin install <path>` again. |
| Stale port file | Run `/pet stop`, then `/pet start`. The session-start script auto-cleans stale PIDs. |

## Demo

```bash
cd ~/.claude/skills/claude-pet/electron
npm run demo
```

Opens a standalone window (520×780, non-transparent) that cycles through all animation states and lets you test 4 permission scenarios with keyboard or button controls.

## Docs

- [DEVELOPMENT.md](./docs/DEVELOPMENT.md) — Architecture, states, animations, permission system, design decisions (中文)
- [CLAUDE.md](./CLAUDE.md) — Guidance for Claude Code when working in this repo (中文)

---

**License**: MIT · **Author**: [Jiyao Fei](https://github.com/JackeyInNottingham)
