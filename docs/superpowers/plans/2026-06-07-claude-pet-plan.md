# Claude Pet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code desktop pet plugin — an Electron app showing a pixel-art mascot that reflects Claude Code's runtime status through animations, with an interactive permission dialog.

**Architecture:** Plugin hooks (bash) detect Claude Code events and POST state changes to a localhost HTTP server running inside an Electron app. The Electron app renders a transparent, frameless, always-on-top canvas window with a pixel-art character and state-driven animations.

**Tech Stack:** Electron 33, vanilla JavaScript (no framework), HTML Canvas, Claude Code hooks/plugin system, bash scripts

---

## File Structure

```
claude-pet/
├── .claude-plugin/
│   └── plugin.json                  # Manifest, auto-generated
├── hooks/
│   ├── hooks.json                   # Hook bindings: PreToolUse, PostToolUse, etc.
│   ├── notify-pet.sh               # POST state/permission to localhost
│   ├── session-start                # Launch Electron on Claude Code start
│   └── platform-shell.sh            # Cross-platform shell detection
├── electron/
│   ├── package.json                 # Electron + dev deps
│   ├── main.js                      # Main process: window, HTTP server, IPC
│   ├── preload.js                   # Context bridge for IPC
│   ├── index.html                   # Pet window shell
│   ├── style.css                    # Window & UI styles
│   ├── renderer.js                  # Bootstrap: wires state machine + canvas
│   ├── state-machine.js             # 7-state FSM with transitions
│   ├── sprites.js                   # Procedural pixel-art character generator
│   ├── speech-bubble.js             # Speech bubble renderer
│   └── permission-dialog.js         # Permission dialog UI
├── commands/
│   └── pet.md                       # /pet start|stop|toggle command definition
└── README.md
```

**Interfaces between files:**
- `main.js` ↔ `preload.js`: IPC channels (`pet-state`, `permission-request`, `command`)
- `main.js` ↔ hook scripts: HTTP POST/GET on `localhost:<port>`
- `renderer.js` → `state-machine.js`: calls `machine.transition(state, detail)`
- `renderer.js` → `sprites.js`: calls `drawPet(ctx, stateData, frame)` for each animation frame
- `renderer.js` → `speech-bubble.js`: calls `SpeechBubble.show(text)`
- `renderer.js` → `permission-dialog.js`: calls `PermissionDialog.show(request)`
- `state-machine.js`: no dependencies, pure state logic
- `sprites.js`: no dependencies, pure drawing on a passed canvas context

---

### Task 1: Project scaffold and plugin manifest

**Files:**
- Create: `claude-pet/.claude-plugin/plugin.json`
- Create: `claude-pet/electron/package.json`

- [ ] **Step 1: Create directory structure**

```bash
cd /Users/jiyaofei/projects/claude-pet
mkdir -p .claude-plugin hooks electron commands
```

- [ ] **Step 2: Write plugin manifest**

```json
{
  "name": "claude-pet",
  "description": "Desktop pet that shows Claude Code's running status with a cute pixel-art mascot. Reflects real-time states like reading, writing, executing, and handles permission requests through an interactive dialog.",
  "author": {
    "name": "Jiyao Fei",
    "email": ""
  },
  "homepage": "",
  "repository": "",
  "license": "MIT",
  "keywords": ["desktop-pet", "status", "ui", "fun"],
  "hooks": "./hooks/",
  "commands": "./commands/",
  "interface": {
    "displayName": "Claude Pet",
    "shortDescription": "Cute desktop pet reflecting Claude Code status",
    "longDescription": "A pixel-art desktop pet that lives on your screen and reflects Claude Code's real-time status through animations. See when Claude is reading, thinking, writing, or executing commands. Interactive permission dialog lets you approve or deny actions directly from the pet.",
    "developerName": "Jiyao Fei",
    "category": "UI",
    "capabilities": ["Interactive", "Read"],
    "brandColor": "#F59E0B",
    "composerIcon": "",
    "logo": "",
    "screenshots": []
  }
}
```

Save to: `.claude-plugin/plugin.json`

- [ ] **Step 3: Write Electron package.json**

```json
{
  "name": "claude-pet-electron",
  "version": "1.0.0",
  "private": true,
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "dependencies": {
    "electron": "^33.0.0"
  }
}
```

Save to: `electron/package.json`

- [ ] **Step 4: Commit**

```bash
cd /Users/jiyaofei/projects/claude-pet
git init
git add .claude-plugin/plugin.json electron/package.json
git commit -m "chore: scaffold claude-pet plugin project"
```

---

### Task 2: Electron app skeleton — transparent frameless window

**Files:**
- Create: `electron/main.js`
- Create: `electron/preload.js`
- Create: `electron/index.html`
- Create: `electron/style.css`

- [ ] **Step 1: Write preload.js — context bridge**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onStateChange: (callback) => {
    ipcRenderer.on('state-change', (_event, data) => callback(data));
  },
  onPermissionRequest: (callback) => {
    ipcRenderer.on('permission-request', (_event, data) => callback(data));
  },
  sendPermissionResponse: (requestId, decision) => {
    ipcRenderer.send('permission-response', { requestId, decision });
  },
  onCommand: (callback) => {
    ipcRenderer.on('command', (_event, data) => callback(data));
  }
});
```

- [ ] **Step 2: Write main.js — window + IPC stubs**

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let petWindow = null;

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 256,
    height: 256,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.loadFile(path.join(__dirname, 'index.html'));
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  petWindow.on('closed', () => { petWindow = null; });
}

app.whenReady().then(createPetWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
});

// IPC: permission response from renderer
ipcMain.on('permission-response', (_event, { requestId, decision }) => {
  petWindow.webContents.send('permission-resolved', { requestId, decision });
});

// IPC: send state from main to renderer
function sendStateToRenderer(state, detail) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('state-change', { state, detail, timestamp: Date.now() });
  }
}

module.exports = { createPetWindow, sendStateToRenderer };
```

- [ ] **Step 3: Write index.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Claude Pet</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <canvas id="pet-canvas" width="256" height="256"></canvas>
  <div id="speech-bubble" class="speech-bubble hidden"></div>
  <div id="permission-dialog" class="permission-dialog hidden">
    <div class="permission-text"></div>
    <div class="permission-buttons">
      <button id="btn-allow">Allow</button>
      <button id="btn-deny">Deny</button>
    </div>
  </div>
  <script src="sprites.js"></script>
  <script src="state-machine.js"></script>
  <script src="speech-bubble.js"></script>
  <script src="permission-dialog.js"></script>
  <script src="renderer.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write style.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  width: 256px;
  height: 256px;
  overflow: hidden;
  background: transparent;
  user-select: none;
  -webkit-user-select: none;
  -webkit-app-region: drag;
}

canvas {
  display: block;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.speech-bubble {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: #FEF3C7;
  border: 2px solid #92400E;
  border-radius: 8px;
  padding: 4px 8px;
  font-family: -apple-system, sans-serif;
  font-size: 11px;
  color: #92400E;
  white-space: nowrap;
  pointer-events: none;
  transition: opacity 0.2s;
}

.speech-bubble.hidden {
  opacity: 0;
}

.permission-dialog {
  position: absolute;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  background: #FEF3C7;
  border: 2px solid #92400E;
  border-radius: 10px;
  padding: 8px 12px;
  text-align: center;
  -webkit-app-region: no-drag;
}

.permission-dialog.hidden {
  display: none;
}

.permission-text {
  font-family: -apple-system, sans-serif;
  font-size: 11px;
  color: #92400E;
  margin-bottom: 6px;
  max-width: 180px;
  word-break: break-all;
}

.permission-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.permission-buttons button {
  padding: 2px 12px;
  border: 1px solid #92400E;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-family: -apple-system, sans-serif;
}

#btn-allow {
  background: #F59E0B;
  color: white;
}

#btn-deny {
  background: #FEF3C7;
  color: #92400E;
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/jiyaofei/projects/claude-pet
git add electron/main.js electron/preload.js electron/index.html electron/style.css
git commit -m "feat: electron app skeleton with transparent frameless window"
```

---

### Task 3: State machine

**Files:**
- Create: `electron/state-machine.js`

- [ ] **Step 1: Write state-machine.js**

```javascript
// Claude Pet state machine — 7 states driven by hook events
const STATES = {
  IDLE: 'idle',
  READING: 'reading',
  SEARCHING: 'searching',
  THINKING: 'thinking',
  WRITING: 'writing',
  EXECUTING: 'executing',
  ERROR: 'error'
};

// How long before returning to idle after a tool finishes (ms)
const THINKING_TIMEOUT = 3000;
const ERROR_DISPLAY_MS = 3000;

class StateMachine {
  constructor(onStateChange) {
    this.currentState = STATES.IDLE;
    this.currentDetail = '';
    this.onStateChange = onStateChange;
    this.thinkingTimer = null;
    this.errorTimer = null;
    this.lastToolTime = 0;
  }

  // Map hook tool name matcher to state
  toolToState(toolName) {
    if (/^Read$/i.test(toolName)) return STATES.READING;
    if (/^(Grep|Glob|Task|WebSearch|WebFetch)$/i.test(toolName)) return STATES.SEARCHING;
    if (/^(Write|Edit|NotebookEdit)$/i.test(toolName)) return STATES.WRITING;
    if (/^Bash$/i.test(toolName)) return STATES.EXECUTING;
    return null;
  }

  // Called by HTTP server when PreToolUse hook fires
  toolStarted(toolName, detail) {
    const state = this.toolToState(toolName);
    if (state) {
      this.clearTimers();
      this.setState(state, detail || toolName);
    }
  }

  // Called by HTTP server when PostToolUse hook fires
  toolFinished(toolName, success) {
    this.lastToolTime = Date.now();
    if (!success) {
      this.setState(STATES.ERROR, `${toolName} failed`);
      this.errorTimer = setTimeout(() => {
        this.enterThinking();
      }, ERROR_DISPLAY_MS);
    } else {
      this.enterThinking();
    }
  }

  // Transition to thinking, which auto-transitions to idle after timeout
  enterThinking() {
    this.clearTimers();
    this.setState(STATES.THINKING, 'processing');
    this.thinkingTimer = setTimeout(() => {
      this.setState(STATES.IDLE, '');
    }, THINKING_TIMEOUT);
  }

  // Called by PostToolUseFailure hook
  toolFailed(toolName, error) {
    this.clearTimers();
    this.setState(STATES.ERROR, error || `${toolName} failed`);
    this.errorTimer = setTimeout(() => {
      this.setState(STATES.IDLE, '');
    }, ERROR_DISPLAY_MS);
  }

  // Called on Stop hook or manual reset
  goIdle() {
    this.clearTimers();
    this.setState(STATES.IDLE, '');
  }

  setState(state, detail) {
    this.currentState = state;
    this.currentDetail = detail;
    if (this.onStateChange) {
      this.onStateChange({ state, detail });
    }
  }

  clearTimers() {
    if (this.thinkingTimer) { clearTimeout(this.thinkingTimer); this.thinkingTimer = null; }
    if (this.errorTimer) { clearTimeout(this.errorTimer); this.errorTimer = null; }
  }

  getState() {
    return { state: this.currentState, detail: this.currentDetail };
  }
}

// Export for both CommonJS (main process) and browser (renderer via script tag)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StateMachine, STATES };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jiyaofei/projects/claude-pet
git add electron/state-machine.js
git commit -m "feat: state machine with 7 states and timer transitions"
```

---

### Task 4: Pixel art sprite system

**Files:**
- Create: `electron/sprites.js`

This file draws the character procedurally in pixel-art style. All drawing is done at 32×32 logical pixels, rendered by the caller at 4x scale with nearest-neighbor interpolation.

- [ ] **Step 1: Write sprites.js**

```javascript
// Claude Pet Pixel Art Sprite System
// Palette derived from Claude brand amber/golden
const PALETTE = {
  outline:  '#92400E',
  body:     '#F59E0B',
  highlight:'#FBBF24',
  light:    '#FEF3C7',
  error:    '#EF4444',
  info:     '#3B82F6',
  cheek:    '#FCD34D',
  shadow:   '#B45309'
};

const SPRITE_SIZE = 32;

// Draw a "pixel" — filled 1x1 square at the 32x32 logical grid
function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

// Draw filled rectangle at logical coordinates
function fillRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// ---- Body parts (same for all states) ----

function drawBody(ctx, bounceOffset = 0) {
  const by = 6 + bounceOffset;

  // Shadow/feet
  fillRect(ctx, 12, 26, 4, 2, PALETTE.outline);
  fillRect(ctx, 17, 26, 4, 2, PALETTE.outline);

  // Main body rounded-rect silhouette
  // Row 1 (ears)
  px(ctx, 12, by, PALETTE.outline); px(ctx, 13, by, PALETTE.body); px(ctx, 14, by, PALETTE.body); px(ctx, 15, by, PALETTE.highlight); px(ctx, 16, by, PALETTE.body); px(ctx, 17, by, PALETTE.body); px(ctx, 18, by, PALETTE.outline);
  // Row 2 (ears)
  px(ctx, 11, by+1, PALETTE.outline); px(ctx, 12, by+1, PALETTE.body); px(ctx, 13, by+1, PALETTE.highlight); px(ctx, 14, by+1, PALETTE.highlight); px(ctx, 15, by+1, PALETTE.highlight); px(ctx, 16, by+1, PALETTE.highlight); px(ctx, 17, by+1, PALETTE.body); px(ctx, 18, by+1, PALETTE.body); px(ctx, 19, by+1, PALETTE.outline);

  // Body top
  for (let r = 2; r < 16; r++) {
    const yy = by + r;
    // Outline left edge
    if (r < 14) px(ctx, 9, yy, PALETTE.outline);
    // Body fill
    let startX = 10;
    let endX = 20;
    if (r >= 3 && r <= 12) { startX = 9; endX = 21; }
    for (let cx = startX; cx <= endX; cx++) {
      const color = (cx <= 10 || cx >= 20) ? PALETTE.shadow
        : (cx >= 16 && cx <= 17 && r >= 4 && r <= 5) ? PALETTE.highlight
        : PALETTE.body;
      px(ctx, cx, yy, color);
    }
    // Outline right edge
    if (r < 14) px(ctx, 21, yy, PALETTE.outline);
    if (r >= 3 && r <= 12) {
      px(ctx, 8, yy, PALETTE.outline);
      px(ctx, 22, yy, PALETTE.outline);
    }
  }

  // Bottom edge outline
  const bRow = by + 15;
  for (let cx = 10; cx <= 20; cx++) {
    px(ctx, cx, bRow, PALETTE.outline);
  }

  // Cheek blush
  px(ctx, 11, by+8, PALETTE.cheek); px(ctx, 12, by+8, PALETTE.cheek);
  px(ctx, 19, by+8, PALETTE.cheek); px(ctx, 20, by+8, PALETTE.cheek);

  return { bodyY: by };
}

// ---- Eye variations per state ----

function drawEyes_idle(ctx, by, frame) {
  // Half-closed eyes, blink on frame 3 of 4
  const blink = (frame % 4 === 3);
  for (let eye of [{x:12, y:by+4}, {x:17, y:by+4}]) {
    if (blink) {
      px(ctx, eye.x, eye.y, PALETTE.outline);
      px(ctx, eye.x+1, eye.y, PALETTE.outline);
      px(ctx, eye.x+2, eye.y, PALETTE.outline);
      px(ctx, eye.x+3, eye.y, PALETTE.outline);
    } else {
      // Eye white
      for (let ey = 0; ey < 4; ey++) {
        for (let ex = 0; ex < 4; ex++) {
          const color = (ey === 0 || ey === 3 || ex === 0 || ex === 3) ? PALETTE.outline : PALETTE.light;
          px(ctx, eye.x+ex, eye.y+ey, color);
        }
      }
      // Pupil
      px(ctx, eye.x+1, eye.y+1, PALETTE.outline);
      px(ctx, eye.x+2, eye.y+1, PALETTE.outline);
      px(ctx, eye.x+1, eye.y+2, PALETTE.outline);
      px(ctx, eye.x+2, eye.y+2, PALETTE.outline);
      // Half-close lid
      px(ctx, eye.x, eye.y+3, PALETTE.body); px(ctx, eye.x+1, eye.y+3, PALETTE.body);
      px(ctx, eye.x+2, eye.y+3, PALETTE.body); px(ctx, eye.x+3, eye.y+3, PALETTE.body);
    }
  }
}

function drawEyes_reading(ctx, by, frame) {
  // Wide open, pupils scan left-right
  const scanOff = [0, -1, 0, 1][frame % 4];
  for (let eye of [{x:12, y:by+3}, {x:17, y:by+3}]) {
    for (let ey = 0; ey < 4; ey++) {
      for (let ex = 0; ex < 4; ex++) {
        const color = (ey === 0 || ey === 3 || ex === 0 || ex === 3) ? PALETTE.outline : PALETTE.light;
        px(ctx, eye.x+ex, eye.y+ey, color);
      }
    }
    px(ctx, eye.x+1+scanOff, eye.y+1, PALETTE.outline);
    px(ctx, eye.x+2+scanOff, eye.y+1, PALETTE.outline);
    px(ctx, eye.x+1+scanOff, eye.y+2, PALETTE.outline);
    px(ctx, eye.x+2+scanOff, eye.y+2, PALETTE.outline);
  }
}

function drawEyes_searching(ctx, by, frame) {
  // Squinting, looking L/R/up
  const lookDirs = [{ox:0, oy:0}, {ox:-1, oy:0}, {ox:0, oy:0}, {ox:1, oy:0}, {ox:0, oy:-1}, {ox:0, oy:0}];
  const dir = lookDirs[frame % 6];
  for (let eye of [{x:12, y:by+4}, {x:17, y:by+4}]) {
    for (let ey = 0; ey < 3; ey++) {
      for (let ex = 0; ex < 4; ex++) {
        const color = (ey === 0 || ey === 2 || ex === 0 || ex === 3) ? PALETTE.outline : PALETTE.light;
        px(ctx, eye.x+ex, eye.y+ey, color);
      }
    }
    // Pupil moves
    px(ctx, eye.x+1+dir.ox, eye.y+1, PALETTE.outline);
    px(ctx, eye.x+2+dir.ox, eye.y+1, PALETTE.outline);
  }
}

function drawEyes_thinking(ctx, by, frame) {
  // Looking up-right, one eye slightly bigger
  for (let eye of [{x:12, y:by+2, w:3}, {x:17, y:by+2, w:4}]) {
    for (let ey = 0; ey < 4; ey++) {
      for (let ex = 0; ex < eye.w; ex++) {
        const color = (ey === 0 || ey === 3 || ex === 0 || ex === eye.w-1) ? PALETTE.outline : PALETTE.light;
        px(ctx, eye.x+ex, eye.y+ey, color);
      }
    }
    // Pupil offset up-right
    px(ctx, eye.x+eye.w-2, eye.y, PALETTE.outline);
    px(ctx, eye.x+eye.w-1, eye.y, PALETTE.outline);
    px(ctx, eye.x+eye.w-1, eye.y+1, PALETTE.outline);
  }
}

function drawEyes_writing(ctx, by, frame) {
  // Focused, slightly narrowed
  for (let eye of [{x:12, y:by+4}, {x:17, y:by+4}]) {
    for (let ey = 0; ey < 3; ey++) {
      for (let ex = 0; ex < 4; ex++) {
        const color = (ey === 0 || ey === 2 || ex === 0 || ex === 3) ? PALETTE.outline : PALETTE.light;
        px(ctx, eye.x+ex, eye.y+ey, color);
      }
    }
    px(ctx, eye.x+1, eye.y+1, PALETTE.outline);
    px(ctx, eye.x+2, eye.y+1, PALETTE.outline);
  }
  // Determined brow above eye
  const browFrame = Math.floor(frame / 2) % 2;
  for (let bx of [12, 17]) {
    for (let bex = 0; bex < 4; bex++) {
      if (browFrame === 0 || bex !== 1) {
        px(ctx, bx+bex, by+3, PALETTE.outline);
      }
    }
  }
}

function drawEyes_executing(ctx, by, frame) {
  // Determined, angled brows (use V-shape)
  for (let eye of [{x:12, y:by+4}, {x:17, y:by+4}]) {
    for (let ey = 0; ey < 4; ey++) {
      for (let ex = 0; ex < 4; ex++) {
        const color = (ey === 0 || ey === 3 || ex === 0 || ex === 3) ? PALETTE.outline : PALETTE.light;
        px(ctx, eye.x+ex, eye.y+ey, color);
      }
    }
    px(ctx, eye.x+1, eye.y+1, PALETTE.outline);
    px(ctx, eye.x+2, eye.y+1, PALETTE.outline);
    px(ctx, eye.x+1, eye.y+2, PALETTE.outline);
    px(ctx, eye.x+2, eye.y+2, PALETTE.outline);
  }
  // Angled determined brows
  px(ctx, 11, by+3, PALETTE.outline);
  px(ctx, 13, by+3, PALETTE.outline);
  px(ctx, 17, by+3, PALETTE.outline);
  px(ctx, 19, by+3, PALETTE.outline);
}

function drawEyes_error(ctx, by, frame) {
  // X_X eyes — wide with X pupils
  for (let eye of [{x:11, y:by+3}, {x:17, y:by+3}]) {
    for (let ey = 0; ey < 5; ey++) {
      for (let ex = 0; ex < 5; ex++) {
        const color = (ey === 0 || ey === 4 || ex === 0 || ex === 4) ? PALETTE.error : PALETTE.light;
        px(ctx, eye.x+ex, eye.y+ey, color);
      }
    }
    // X pattern pupils
    px(ctx, eye.x+1, eye.y+1, PALETTE.outline);
    px(ctx, eye.x+2, eye.y+2, PALETTE.outline);
    px(ctx, eye.x+3, eye.y+3, PALETTE.outline);
    px(ctx, eye.x+3, eye.y+1, PALETTE.outline);
    px(ctx, eye.x+2, eye.y+2, PALETTE.outline);
    px(ctx, eye.x+1, eye.y+3, PALETTE.outline);
  }
}

// ---- Accessory drawing ----

function drawAccessory_glasses(ctx, by) {
  // Simple square glasses frame
  for (let gx of [11, 16]) {
    for (let gy = 0; gy < 5; gy++) {
      for (let gex = 0; gex < 5; gex++) {
        if (gy === 0 || gy === 4 || gex === 0 || gex === 4) {
          px(ctx, gx+gex, by+3+gy, PALETTE.info);
        }
      }
    }
  }
  // Bridge
  px(ctx, 15, by+4, PALETTE.info);
  px(ctx, 15, by+5, PALETTE.info);
}

function drawAccessory_magnifier(ctx, by, frame) {
  // Magnifying glass that bobs up and down
  const bob = Math.sin(frame * 0.5) > 0 ? 0 : 1;
  const mx = 22, my = by - 2 + bob;
  // Handle
  px(ctx, mx+5, my+6, PALETTE.shadow);
  px(ctx, mx+6, my+7, PALETTE.shadow);
  px(ctx, mx+7, my+8, PALETTE.shadow);
  // Glass circle (approximate in pixel art)
  for (let r = 0; r < 6; r++) {
    const ringCoords = [
      [0,2],[0,3],[0,4],[1,1],[1,5],[2,0],[2,6],[3,0],[3,6],[4,1],[4,5],[5,2],[5,3],[5,4]
    ];
    for (let [dx, dy] of ringCoords) {
      px(ctx, mx+dx, my+dy, PALETTE.info);
    }
  }
  // Glass fill
  fillRect(ctx, mx+2, my+2, 2, 3, '#DBEAFE');
}

function drawAccessory_gear(ctx, by, frame) {
  // Spinning gear above head
  const angle = frame * 0.3;
  const cx = 16, cy = by - 4;
  for (let a = 0; a < 8; a++) {
    const rad = (a / 8) * Math.PI * 2 + angle;
    const toothLen = (a % 2 === 0) ? 3 : 2;
    const tx = Math.round(cx + Math.cos(rad) * toothLen);
    const ty = Math.round(cy + Math.sin(rad) * toothLen);
    px(ctx, tx, ty, PALETTE.outline);
  }
  px(ctx, cx, cy, PALETTE.highlight);
}

function drawAccessory_keyboard(ctx, by, frame) {
  // Tiny keyboard at the bottom
  const kby = by + 17;
  for (let kr = 0; kr < 4; kr++) {
    for (let kc = 0; kc < 11; kc++) {
      const color = (kr === 0 && kc === 5) ? PALETTE.highlight // spacebar
        : (kr === 3) ? PALETTE.shadow
        : PALETTE.outline;
      const keyOn = (frame % 4 === kc % 4 || frame % 4 === kr);
      px(ctx, 11+kc, kby+kr, keyOn ? PALETTE.highlight : color);
    }
  }
  // Typing indicator — flash on current "key"
  const keyX = frame % 11;
  px(ctx, 11+keyX, kby, PALETTE.light);
}

function drawAccessory_sweat(ctx, by) {
  // Sweat drop
  px(ctx, 23, by+1, PALETTE.info);
  px(ctx, 23, by+2, PALETTE.info);
  px(ctx, 24, by+2, PALETTE.info);
  px(ctx, 23, by+3, PALETTE.info);
  px(ctx, 24, by+3, PALETTE.info);
  px(ctx, 25, by+3, PALETTE.info);
  px(ctx, 23, by+4, PALETTE.info);
  px(ctx, 24, by+4, PALETTE.info);
  px(ctx, 24, by+5, PALETTE.info);
}

// ---- Main draw function ----

function drawPet(ctx, state, detail, frame) {
  ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

  const bounceOffset = (state === 'idle') ? Math.round(Math.sin(frame * 0.3) * 1) : 0;
  const startledOffset = (state === 'error') ? ((frame < 2) ? 2 : 0) : 0;
  const offset = bounceOffset + startledOffset;

  const { bodyY } = drawBody(ctx, offset);

  // Draw eyes based on state
  const eyeFunctions = {
    idle: drawEyes_idle,
    reading: drawEyes_reading,
    searching: drawEyes_searching,
    thinking: drawEyes_thinking,
    writing: drawEyes_writing,
    executing: drawEyes_executing,
    error: drawEyes_error
  };

  if (eyeFunctions[state]) {
    eyeFunctions[state](ctx, bodyY, frame);
  } else {
    drawEyes_idle(ctx, bodyY, frame);
  }

  // Draw accessories
  switch (state) {
    case 'reading':
      drawAccessory_glasses(ctx, bodyY);
      break;
    case 'searching':
      drawAccessory_magnifier(ctx, bodyY, frame);
      break;
    case 'thinking':
      drawAccessory_gear(ctx, bodyY, frame);
      break;
    case 'writing':
      drawAccessory_keyboard(ctx, bodyY, frame);
      break;
    case 'executing':
      drawAccessory_gear(ctx, bodyY, frame);
      break;
    case 'error':
      drawAccessory_sweat(ctx, bodyY);
      break;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { drawPet, PALETTE, SPRITE_SIZE };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jiyaofei/projects/claude-pet
git add electron/sprites.js
git commit -m "feat: procedural pixel-art sprite system with 7 state variations"
```

---

### Task 5: Renderer — animation loop & wiring

**Files:**
- Create: `electron/renderer.js`

- [ ] **Step 1: Write renderer.js**

```javascript
// Renderer — boots the pet window: state machine + canvas animation loop

const canvas = document.getElementById('pet-canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const SCALE = 8; // 32px * 8 = 256px canvas
let frame = 0;
let fpsInterval = null;
let currentState = 'idle';
let currentDetail = '';

// Initialize state machine
const machine = new StateMachine(({ state, detail }) => {
  currentState = state;
  currentDetail = detail;
  updateSpeechBubble(state);
});

// Animation loop at ~10 FPS (pixel art feel)
function startAnimationLoop() {
  fpsInterval = setInterval(() => {
    frame++;
    renderFrame();
  }, 100); // 10 FPS
}

function renderFrame() {
  // Draw sprite at 32x32 into offscreen, then scale up
  ctx.save();
  ctx.clearRect(0, 0, 256, 256);
  ctx.scale(SCALE, SCALE);

  drawPet(ctx, currentState, currentDetail, frame);

  ctx.restore();
}

// Speech bubble text mapping
function updateSpeechBubble(state) {
  const messages = {
    idle: '',
    reading: 'Reading...',
    searching: 'Searching...',
    thinking: 'Thinking...',
    writing: 'Writing code...',
    executing: 'Running...',
    error: 'Oops!'
  };
  const text = messages[state] || '';
  if (text) {
    SpeechBubble.show(text);
  } else {
    SpeechBubble.hide();
  }
}

// Listen for state changes from main process
if (window.electronAPI) {
  window.electronAPI.onStateChange(({ state, detail }) => {
    if (state === 'error') {
      machine.toolFailed('hook', detail);
    } else if (state === 'idle') {
      machine.goIdle();
    } else {
      machine.toolStarted(state, detail);
    }
  });

  window.electronAPI.onPermissionRequest((data) => {
    PermissionDialog.show(data, (decision) => {
      window.electronAPI.sendPermissionResponse(data.requestId || '', decision);
    });
  });
}

function showPermissionDialog(request) {
  return new Promise((resolve) => {
    PermissionDialog.show(request, (decision) => {
      resolve(decision);
    });
  });
}

// Start
startAnimationLoop();
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jiyaofei/projects/claude-pet
git add electron/renderer.js
git commit -m "feat: animation loop renderer with state machine wiring"
```

---

### Task 6: Speech bubble & permission dialog components

**Files:**
- Create: `electron/speech-bubble.js`
- Create: `electron/permission-dialog.js`

- [ ] **Step 1: Write speech-bubble.js**

```javascript
const SpeechBubble = {
  el: document.getElementById('speech-bubble'),
  timer: null,

  show(text) {
    if (!this.el) return;
    this.el.textContent = text;
    this.el.classList.remove('hidden');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fadeOut(), 3000);
  },

  fadeOut() {
    if (this.el) this.el.classList.add('hidden');
  },

  hide() {
    this.fadeOut();
  }
};
```

- [ ] **Step 2: Write permission-dialog.js**

```javascript
const PermissionDialog = {
  el: document.getElementById('permission-dialog'),
  textEl: null,
  btnAllow: null,
  btnDeny: null,
  callback: null,

  init() {
    this.textEl = this.el.querySelector('.permission-text');
    this.btnAllow = document.getElementById('btn-allow');
    this.btnDeny = document.getElementById('btn-deny');

    this.btnAllow.addEventListener('click', () => this.respond('allow'));
    this.btnDeny.addEventListener('click', () => this.respond('deny'));
  },

  show(request, callback) {
    if (!this.el) return;
    const cmd = request.command || request.detail || 'this action';
    this.textEl.textContent = `Allow this?\n${cmd}`;
    this.callback = callback;
    this.el.classList.remove('hidden');
  },

  respond(decision) {
    this.el.classList.add('hidden');
    if (this.callback) {
      this.callback(decision);
      this.callback = null;
    }
  },

  hide() {
    this.el.classList.add('hidden');
  }
};

PermissionDialog.init();
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jiyaofei/projects/claude-pet
git add electron/speech-bubble.js electron/permission-dialog.js
git commit -m "feat: speech bubble and permission dialog components"
```

---

### Task 7: HTTP server in Electron main process

**Files:**
- Modify: `electron/main.js` — add HTTP server

- [ ] **Step 1: Update main.js with HTTP server**

Replace `electron/main.js` with:

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');

let petWindow = null;
let httpServer = null;
const PORT_FILE = path.join(require('os').homedir(), '.claude-pet', 'port');

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 256,
    height: 256,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.loadFile(path.join(__dirname, 'index.html'));
  // macOS: show on all workspaces
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  petWindow.on('closed', () => { petWindow = null; });
}

function startHttpServer() {
  httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/status') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { state, detail } = JSON.parse(body);
          sendStateToRenderer(state || 'idle', detail || '');
          res.writeHead(200);
          res.end('ok');
        } catch (e) {
          res.writeHead(400);
          res.end('bad request');
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/permission') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          petWindow.webContents.send('permission-request', data);
          res.writeHead(200);
          res.end(JSON.stringify({ received: true }));
        } catch (e) {
          res.writeHead(400);
          res.end('bad request');
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  httpServer.listen(0, '127.0.0.1', () => {
    const port = httpServer.address().port;
    const dir = path.dirname(PORT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PORT_FILE, String(port));
    console.log(`Claude Pet HTTP server on 127.0.0.1:${port}`);
  });
}

function sendStateToRenderer(state, detail) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('state-change', { state, detail, timestamp: Date.now() });
  }
}

// IPC
ipcMain.on('permission-response', (_event, { requestId, decision }) => {
  // Decision recorded; hook script polls or we write response file
  const responseFile = path.join(require('os').homedir(), '.claude-pet', 'permission-response');
  fs.writeFileSync(responseFile, JSON.stringify({ requestId, decision, timestamp: Date.now() }));
});

app.whenReady().then(() => {
  createPetWindow();
  startHttpServer();
});

app.on('window-all-closed', () => {
  if (httpServer) httpServer.close();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
});
```

- [ ] **Step 2: Test Electron starts with HTTP server**

```bash
cd /Users/jiyaofei/projects/claude-pet/electron
npm install
npx electron . &
sleep 3
PORT=$(cat ~/.claude-pet/port)
curl -s http://127.0.0.1:$PORT/health
# Expected: {"status":"ok"}
kill %1 2>/dev/null
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jiyaofei/projects/claude-pet
git add electron/main.js
git commit -m "feat: http server in electron main process for hook communication"
```

---

### Task 8: Hook scripts and plugin configuration

**Files:**
- Create: `hooks/hooks.json`
- Create: `hooks/notify-pet.sh`
- Create: `hooks/session-start`
- Create: `hooks/platform-shell.sh`

- [ ] **Step 1: Write hooks.json**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/notify-pet.sh\" tool-start \"${CLAUDE_PLUGIN_ROOT}\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/notify-pet.sh\" tool-finish \"${CLAUDE_PLUGIN_ROOT}\""
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/notify-pet.sh\" tool-fail \"${CLAUDE_PLUGIN_ROOT}\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/notify-pet.sh\" idle \"${CLAUDE_PLUGIN_ROOT}\""
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/notify-pet.sh\" permission \"${CLAUDE_PLUGIN_ROOT}\""
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/session-start\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Write notify-pet.sh**

```bash
#!/usr/bin/env bash
# notify-pet.sh — POST state changes to the Electron pet app
# Usage: notify-pet.sh <action> [plugin_root]

ACTION="$1"
PLUGIN_ROOT="${2:-$(dirname "$(dirname "$0")")}"
PORT_FILE="$HOME/.claude-pet/port"
PORT=$(cat "$PORT_FILE" 2>/dev/null)

if [ -z "$PORT" ]; then
  exit 0  # Pet not running, silently skip
fi

BASE_URL="http://127.0.0.1:$PORT"

case "$ACTION" in
  tool-start)
    # Claude Code passes tool_name via env or stdin
    TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
    if [ -z "$TOOL_NAME" ] && [ -n "$1" ]; then
      # tool_name might be in stdin JSON
      TOOL_NAME=$(python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")
    fi
    # Map tool name to state
    STATE=""
    case "$TOOL_NAME" in
      Read) STATE="reading" ;;
      Grep|Glob|Task|WebSearch|WebFetch) STATE="searching" ;;
      Write|Edit|NotebookEdit) STATE="writing" ;;
      Bash) STATE="executing" ;;
      *) STATE="" ;;
    esac
    if [ -n "$STATE" ]; then
      curl -s -X POST "$BASE_URL/status" \
        -H "Content-Type: application/json" \
        -d "{\"state\":\"$STATE\",\"detail\":\"$TOOL_NAME\"}" > /dev/null 2>&1 &
    fi
    ;;

  tool-finish)
    # Auto-transition to thinking, which times out to idle
    curl -s -X POST "$BASE_URL/status" \
      -H "Content-Type: application/json" \
      -d '{"state":"thinking","detail":"processing"}' > /dev/null 2>&1 &
    ;;

  tool-fail)
    TOOL_NAME="${CLAUDE_TOOL_NAME:-unknown}"
    curl -s -X POST "$BASE_URL/status" \
      -H "Content-Type: application/json" \
      -d "{\"state\":\"error\",\"detail\":\"$TOOL_NAME failed\"}" > /dev/null 2>&1 &
    ;;

  idle)
    curl -s -X POST "$BASE_URL/status" \
      -H "Content-Type: application/json" \
      -d '{"state":"idle","detail":""}' > /dev/null 2>&1 &
    ;;

  permission)
    # Extract notification details from stdin JSON
    NOTIF_DATA=$(python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  msg = d.get('message', 'Permission needed')
  print(json.dumps({'command': msg, 'requestId': str(d.get('notification_id',''))}))
except:
  print('{}')
" 2>/dev/null)
    curl -s -X POST "$BASE_URL/permission" \
      -H "Content-Type: application/json" \
      -d "$NOTIF_DATA" > /dev/null 2>&1 &
    ;;
esac
```

- [ ] **Step 3: Write session-start**

```bash
#!/usr/bin/env bash
# Auto-launch the Electron pet app on Claude Code session start
PLUGIN_ROOT="$(dirname "$(dirname "$0")")"
ELECTRON_DIR="$PLUGIN_ROOT/electron"
PORT_FILE="$HOME/.claude-pet/port"

# If pet is already running, skip
if [ -f "$PORT_FILE" ]; then
  PORT=$(cat "$PORT_FILE")
  if curl -s "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
    exit 0
  fi
fi

# Check if auto-start is disabled
if [ -f "$HOME/.claude-pet/auto-start-disabled" ]; then
  exit 0
fi

# Install deps if needed
if [ ! -d "$ELECTRON_DIR/node_modules" ]; then
  cd "$ELECTRON_DIR" && npm install --silent 2>/dev/null &
fi

# Launch Electron in background
cd "$ELECTRON_DIR"
npx electron . > /dev/null 2>&1 &
```

- [ ] **Step 4: Write platform-shell.sh**

```bash
#!/usr/bin/env bash
# Cross-platform shell detection for hook scripts
# Used by run-hook.cmd on Windows

case "$(uname -s)" in
  Linux*)  echo "linux" ;;
  Darwin*) echo "macos" ;;
  CYGWIN*|MINGW*|MSYS*) echo "windows" ;;
  *)       echo "unknown" ;;
esac
```

- [ ] **Step 5: Commit**

```bash
cd /Users/jiyaofei/projects/claude-pet
chmod +x hooks/notify-pet.sh hooks/session-start hooks/platform-shell.sh
git add hooks/
git commit -m "feat: hook scripts for state notification and auto-launch"
```

---

### Task 9: Commands, drag-to-move, position persistence, tray icon

**Files:**
- Create: `commands/pet.md`
- Modify: `electron/main.js` — add position persistence, tray icon, drag support

- [ ] **Step 1: Write command definition**

```markdown
# /pet — Control the Claude Pet desktop companion

Start, stop, or toggle the desktop pet that reflects Claude Code's running status.

## Usage

`/pet start`  — Launch the pet window
`/pet stop`   — Close the pet window  
`/pet toggle` — Enable/disable auto-start on session launch
`/pet status` — Show current pet state
```

Save to: `commands/pet.md`

- [ ] **Step 2: Update main.js with position persistence, tray, and drag IPC**

Insert after `createPetWindow()` function and before `startHttpServer()`:

```javascript
const POSITION_FILE = path.join(require('os').homedir(), '.claude-pet', 'position.json');
const AUTO_START_FILE = path.join(require('os').homedir(), '.claude-pet', 'auto-start-disabled');

function loadPosition() {
  try {
    if (fs.existsSync(POSITION_FILE)) {
      return JSON.parse(fs.readFileSync(POSITION_FILE, 'utf8'));
    }
  } catch (_) {}
  return null;
}

function savePosition() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const [x, y] = petWindow.getPosition();
  const dir = path.dirname(POSITION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(POSITION_FILE, JSON.stringify({ x, y }));
}

function applyPosition() {
  const pos = loadPosition();
  if (pos && petWindow && !petWindow.isDestroyed()) {
    petWindow.setPosition(pos.x, pos.y);
  }
}

function setupTray() {
  const { Tray, Menu, nativeImage } = require('electron');
  // Create a simple 16x16 tray icon programmatically
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPklEQVQ4T2NkYPj/n4EBBJgYKAwYqSwelDYYqSwekjYY6eFmoLKBSBuM/w8TI00DkZoY/v+H0TQbiJowGBoAAHcYDGcNPLWZAAAAAElFTkSuQmCC'
  );
  const tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Start Pet', click: () => { if (!petWindow) createPetWindow(); } },
    { label: 'Stop Pet', click: () => { if (petWindow) petWindow.close(); } },
    { type: 'separator' },
    { label: 'Quit Claude Pet', click: () => { app.quit(); } }
  ]);
  tray.setToolTip('Claude Pet');
  tray.setContextMenu(contextMenu);
}

// IPC: handle position save on drag end
ipcMain.on('window-dragged', () => {
  savePosition();
});
```

Add to `app.whenReady()`:

```javascript
app.whenReady().then(() => {
  createPetWindow();
  startHttpServer();
  setupTray();
  // Apply saved position after window is shown
  petWindow.webContents.on('did-finish-load', () => {
    applyPosition();
  });
});
```

- [ ] **Step 3: Add drag handler in preload.js**

Append to `electron/preload.js`:

```javascript
// Notify main process when drag ends
window.addEventListener('mouseup', () => {
  ipcRenderer.send('window-dragged');
});
```

- [ ] **Step 4: Commit**

```bash
cd /Users/jiyaofei/projects/claude-pet
git add commands/pet.md electron/main.js electron/preload.js
git commit -m "feat: commands, position persistence, tray icon, drag support"
```

---

### Task 10: README and final wiring

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

```markdown
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

## Requirements

- Node.js 18+
- macOS or Windows
```

- [ ] **Step 2: Verify file structure**

```bash
cd /Users/jiyaofei/projects/claude-pet
find . -type f | sort
# Expected:
# ./.claude-plugin/plugin.json
# ./commands/pet.md
# ./electron/index.html
# ./electron/main.js
# ./electron/package.json
# ./electron/permission-dialog.js
# ./electron/preload.js
# ./electron/renderer.js
# ./electron/speech-bubble.js
# ./electron/sprites.js
# ./electron/state-machine.js
# ./electron/style.css
# ./hooks/hooks.json
# ./hooks/notify-pet.sh
# ./hooks/platform-shell.sh
# ./hooks/session-start
# ./README.md
```

- [ ] **Step 3: Final commit**

```bash
cd /Users/jiyaofei/projects/claude-pet
git add README.md
git commit -m "docs: add README with install and usage instructions"
```
