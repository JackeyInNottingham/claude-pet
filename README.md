# Claude Pet 🐾

A desktop pet plugin for Claude Code. A cute pixel-art mascot that lives on your desktop and reflects Claude Code's real-time status.

## What It Shows

| State | What Claude is doing |
|---|---|
| 😴 Idle | Waiting for your input |
| 📖 Reading | Reading files |
| 🔍 Searching | Searching code |
| 🤔 Thinking | Processing / reasoning |
| ✍️ Writing | Editing files |
| ⚙️ Executing | Running commands |
| 😱 Error | Something went wrong |

## Install

```bash
claude plugin install claude-pet
```

## Commands

- `/pet start` — Launch the pet
- `/pet stop` — Close the pet
- `/pet toggle` — Toggle auto-start on session launch
- `/pet status` — Show current state

## How It Works

The plugin uses Claude Code hooks to detect tool usage and sends state notifications to a local Electron app via localhost HTTP. The Electron app renders a transparent, always-on-top pixel-art window.

See [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) for architecture, animation states, permission dialog, and demo instructions.

## Requirements

- Node.js 18+
- macOS or Windows
