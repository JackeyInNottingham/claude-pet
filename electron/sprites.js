// Claude Pet - Claude Code An() mascot renderer
// Tool states + permission interaction animations

const SPRITE_SIZE = 32;
const CHAR_W = 2;
const CHAR_H = 4;
const TRANSITION_FRAMES = 6;

const PALETTE = {
  0: null,
  2: '#D77757',
  3: '#E8956F',
  5: '#EF4444',
  6: '#3B82F6',
  7: '#F59E0B',
  8: '#000000'
};

const BLOCKS = {
  ' ': [0,0,0,0], '\u2588': [1,1,1,1], '\u258c': [1,0,1,0], '\u2590': [0,1,0,1],
  '\u259b': [1,1,1,0], '\u259c': [1,1,0,1], '\u259d': [0,1,0,0], '\u2598': [1,0,0,0],
  '\u259f': [1,0,1,1], '\u2599': [1,0,1,1], '\u2597': [0,0,0,1], '\u2596': [0,0,1,0]
};

const SCF = {
  default: { r1L: ' \u2590', r1E: '\u259b\u2588\u2588\u2588\u259c', r1R: '\u258c', r2L: '\u259d\u259c', r2R: '\u259b\u2598' },
  'look-left': { r1L: ' \u2590', r1E: '\u259f\u2588\u2588\u2588\u259f', r1R: '\u258c', r2L: '\u259d\u259c', r2R: '\u259b\u2598' },
  'look-right': { r1L: ' \u2590', r1E: '\u2599\u2588\u2588\u2588\u2599', r1R: '\u258c', r2L: '\u259d\u259c', r2R: '\u259b\u2598' },
  'arms-up': { r1L: '\u2597\u259f', r1E: '\u259b\u2588\u2588\u2588\u259c', r1R: '\u2599\u2596', r2L: ' \u259c', r2R: '\u259b ' }
};

/** Per-state visuals: pose cycle + accessory + motion flags */
const STATE_VISUALS = {
  idle: { bounce: true },
  reading: { prop: 'glasses', eyeScan: true },
  searching: { prop: 'magnifier', searchLook: true },
  thinking: { pose: 'look-right', prop: 'question' },
  writing: { prop: 'keyboard', workBounce: true },
  executing: { prop: 'gear', gearSpeed: 0.55, workBounce: true },
  error: { prop: 'error', shake: true },
  permission: { prop: 'alert', permissionLook: true, attentiveBounce: true },
  permission_allow: { prop: 'checkmark', allowHop: true },
  permission_deny: { slump: true }
};

function qAt(q, px, py, w, h) {
  const qx = px < w / 2 ? 0 : 1;
  const qy = py < h / 2 ? 0 : 1;
  return q[qy * 2 + qx];
}

function stampChar(grid, col, row, ch, fg, bg) {
  const quads = BLOCKS[ch] || BLOCKS[' '];
  const x0 = col * CHAR_W;
  const y0 = row * CHAR_H;
  for (let dy = 0; dy < CHAR_H; dy++) {
    for (let dx = 0; dx < CHAR_W; dx++) {
      const y = y0 + dy, x = x0 + dx;
      if (bg && bg !== 0) grid[y][x] = bg;
      if (qAt(quads, dx, dy, CHAR_W, CHAR_H)) grid[y][x] = fg;
    }
  }
}

function stampText(grid, col, row, text, fg, bg) {
  for (let i = 0; i < text.length; i++) stampChar(grid, col + i, row, text[i], fg, bg || 0);
}

function mirrorRow2Arms(grid, p) {
  const armPx = p.r2L.length * CHAR_W;
  const rightCol = (p.r2L.length + 5) * CHAR_W;
  const y0 = CHAR_H;
  const y1 = 2 * CHAR_H - 1;

  for (let y = y0; y <= y1; y++) {
    for (let x = rightCol; x < rightCol + armPx; x++) grid[y][x] = 0;
    for (let x = 0; x < armPx; x++) {
      const v = grid[y][x];
      if (!v) continue;
      grid[y][rightCol + (armPx - 1 - x)] = v;
    }
  }
}

function balanceSideBulges(grid) {
  const y1a = 0, y1b = CHAR_H - 1;
  const y2a = CHAR_H, y2b = 2 * CHAR_H - 1;
  let r1min = 999, r1max = 0, r2min = 999, r2max = 0;

  for (let y = y1a; y <= y1b; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === 2) { r1min = Math.min(r1min, x); r1max = Math.max(r1max, x); }
    }
  }
  for (let y = y2a; y <= y2b; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === 2) { r2min = Math.min(r2min, x); r2max = Math.max(r2max, x); }
    }
  }

  const ext = r1min - r2min;
  if (ext <= 0) return;

  for (let y = y2a; y <= y2b; y++) {
    for (let dx = 0; dx < ext; dx++) {
      const srcX = r2min + dx;
      const dstX = r1max + 1 + dx;
      if (grid[y][srcX] === 2) grid[y][dstX] = 2;
    }
  }
}

function buildPose(pose) {
  const p = SCF[pose] || SCF.default;
  const charCols = Math.max(
    p.r1L.length + p.r1E.length + p.r1R.length,
    p.r2L.length + 5 + p.r2R.length,
    9
  );
  const cols = charCols * CHAR_W;
  const rows = 3 * CHAR_H;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  const FG = 2, BG = 8;
  stampText(grid, 0, 0, p.r1L, FG, 0);
  stampText(grid, p.r1L.length, 0, p.r1E, FG, BG);
  stampText(grid, p.r1L.length + p.r1E.length, 0, p.r1R, FG, 0);
  stampText(grid, 0, 1, p.r2L, FG, 0);
  stampText(grid, p.r2L.length, 1, '\u2588\u2588\u2588\u2588\u2588', FG, BG);
  stampText(grid, p.r2L.length + 5, 1, p.r2R, FG, 0);
  stampText(grid, 0, 2, '  \u2598\u2598 \u259d\u259d  ', FG, 0);
  mirrorRow2Arms(grid, p);
  balanceSideBulges(grid);
  return grid;
}

function centerGrid(grid, size) {
  const gh = grid.length, gw = grid[0].length;
  const out = Array.from({ length: size }, () => Array(size).fill(0));
  const ox = Math.floor((size - gw) / 2);
  const oy = Math.floor((size - gh) / 2);
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++)
      if (grid[y][x]) out[oy + y][ox + x] = grid[y][x];
  return out;
}

function toStrings(grid) { return grid.map(r => r.map(v => String(v)).join('')); }
function clone(data) { return data.map(r => r.split('')); }

const BASE_SPRITE = toStrings(centerGrid(buildPose('default'), SPRITE_SIZE));
const B = (() => {
  const g = clone(BASE_SPRITE).map(r => r.map(c => +c || 0));
  let minX = 32, minY = 32, maxX = 0, maxY = 0;
  g.forEach((row, y) => row.forEach((v, x) => {
    if (v) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }));
  return { minX, minY, maxX, maxY, cx: Math.floor((minX + maxX) / 2), top: minY, bot: maxY };
})();

function setPx(out, x, y, v) {
  if (x >= 0 && x < SPRITE_SIZE && y >= 0 && y < SPRITE_SIZE) out[y][x] = String(v);
}

function getPx(out, x, y) {
  if (x >= 0 && x < SPRITE_SIZE && y >= 0 && y < SPRITE_SIZE) return out[y][x];
  return '0';
}

// ---- Pose cycles (within-state animation) ----

function idlePose(frame) {
  if (frame % 90 < 12) return frame % 180 < 90 ? 'look-right' : 'look-left';
  return 'default';
}

function eyeScanPose(frame) {
  return Math.floor(frame / 14) % 2 ? 'look-right' : 'look-left';
}

function searchLookPose(frame) {
  const step = Math.floor(frame / 18) % 3;
  if (step === 0) return 'look-left';
  if (step === 1) return 'look-right';
  return 'default';
}

function permissionLookPose(frame) {
  const cycle = frame % 45;
  if (cycle < 4) return 'look-left';
  if (cycle < 8) return 'look-right';
  return 'default';
}

function resolvePose(state, frame) {
  const cfg = STATE_VISUALS[state] || {};
  if (state === 'idle') return idlePose(frame);
  if (cfg.permissionLook) return permissionLookPose(frame);
  if (cfg.pose) return cfg.pose;
  if (cfg.eyeScan) return eyeScanPose(frame);
  if (cfg.searchLook) return searchLookPose(frame);
  return 'default';
}

// ---- Accessory overlays ----

function drawGlasses(out, frame) {
  const y = B.top + 1;
  const l = B.minX + 1, r = B.maxX - 1, mid = B.cx;
  for (let x = l; x <= mid - 1; x++) { setPx(out, x, y, '6'); setPx(out, x, y + 1, '6'); }
  for (let x = mid + 1; x <= r; x++) { setPx(out, x, y, '6'); setPx(out, x, y + 1, '6'); }
  setPx(out, mid, y, '6');
  if (frame % 28 < 2) {
    setPx(out, l + 1, y + 2, '8');
    setPx(out, r - 1, y + 2, '8');
  }
}

function drawMagnifier(out, frame) {
  const bob = Math.round(Math.sin(frame * 0.45) * 1);
  const cx = Math.min(B.maxX + 3, SPRITE_SIZE - 3);
  const cy = B.top + 1 + bob;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    setPx(out, Math.round(cx + Math.cos(a) * 2), Math.round(cy + Math.sin(a) * 2), '6');
  }
  setPx(out, cx, cy, '8');
  setPx(out, cx + 2, cy + 2, '6');
  setPx(out, cx + 3, cy + 3, '6');
}

function drawGear(out, frame, speed) {
  const cx = B.cx, cy = B.top - 3;
  const a = frame * speed;
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 2 : 3;
    const ang = (i / 8) * Math.PI * 2 + a;
    setPx(out, Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), '3');
  }
  setPx(out, cx, cy, '3');
}

function drawQuestionMark(out, frame) {
  const bob = Math.round(Math.sin(frame * 0.25) * 1);
  const cx = B.cx;
  const y0 = B.top - 7 + bob;
  const c = frame % 24 < 12 ? '3' : '6';

  setPx(out, cx - 1, y0, c);
  setPx(out, cx, y0, c);
  setPx(out, cx + 1, y0, c);
  setPx(out, cx - 2, y0 + 1, c);
  setPx(out, cx + 2, y0 + 1, c);
  setPx(out, cx + 1, y0 + 2, c);
  setPx(out, cx, y0 + 3, c);
  setPx(out, cx, y0 + 4, c);
  setPx(out, cx - 1, y0 + 5, c);
  setPx(out, cx, y0 + 6, c);
}

function drawExclamation(out, frame) {
  const bob = Math.round(Math.sin(frame * 0.4) * 1);
  const cx = B.cx;
  const y0 = B.top - 6 + bob;
  const c = frame % 20 < 10 ? '7' : '3';

  setPx(out, cx, y0, c);
  setPx(out, cx, y0 + 1, c);
  setPx(out, cx, y0 + 2, c);
  setPx(out, cx, y0 + 3, c);
  setPx(out, cx, y0 + 5, c);
}

function drawCheckmark(out) {
  const cx = B.cx;
  const y0 = B.top - 5;
  const c = '7';
  setPx(out, cx - 2, y0 + 2, c);
  setPx(out, cx - 1, y0 + 3, c);
  setPx(out, cx, y0 + 2, c);
  setPx(out, cx + 1, y0 + 1, c);
  setPx(out, cx + 2, y0, c);
}

function drawKeyboard(out, frame) {
  const y = Math.min(B.bot + 2, SPRITE_SIZE - 2);
  const w = 10;
  const x0 = B.cx - Math.floor(w / 2);
  for (let x = x0; x < x0 + w; x++) {
    setPx(out, x, y, '8');
    setPx(out, x, y + 1, '8');
  }
  const keys = [0, 2, 4, 6, 8];
  const active = keys[Math.floor(frame / 4) % keys.length];
  setPx(out, x0 + active, y, '6');
  setPx(out, x0 + active + 1, y, '6');
}

function drawErrorProps(out, frame) {
  if (frame % 16 < 3) {
    for (let y = 0; y < SPRITE_SIZE; y++)
      for (let x = 0; x < SPRITE_SIZE; x++)
        if (out[y][x] === '2') out[y][x] = '5';
  }
  setPx(out, B.maxX + 1, B.top + 2, '6');
  setPx(out, B.maxX + 1, B.top + 3, '6');
  setPx(out, B.maxX + 2, B.top + 4, '6');
  if (frame % 20 < 4) {
    setPx(out, B.minX + 1, B.top + 2, '8');
    setPx(out, B.maxX - 1, B.top + 2, '8');
  }
}

function applyProp(out, prop, frame, cfg) {
  switch (prop) {
    case 'glasses': drawGlasses(out, frame); break;
    case 'magnifier': drawMagnifier(out, frame); break;
    case 'gear': drawGear(out, frame, cfg.gearSpeed || 0.35); break;
    case 'question': drawQuestionMark(out, frame); break;
    case 'alert': drawExclamation(out, frame); break;
    case 'checkmark': drawCheckmark(out); break;
    case 'keyboard': drawKeyboard(out, frame); break;
    case 'error': drawErrorProps(out, frame); break;
  }
}

function applyStateProps(data, state, frame) {
  const out = clone(data);
  const cfg = STATE_VISUALS[state];
  if (cfg && cfg.prop) applyProp(out, cfg.prop, frame, cfg);
  return out.map(r => r.join(''));
}

// ---- Motion offsets ----

function workBounceOffset(frame) {
  return Math.round(Math.sin(frame * 0.5) * 0.5);
}

function transitionHop(progress) {
  return Math.round(-2 * Math.sin(progress * Math.PI));
}

function computeOffsetY(state, frame, transition) {
  let oy = 0;
  const cfg = STATE_VISUALS[state] || {};

  if (cfg.bounce) oy += Math.round(Math.sin(frame * 0.3));
  if (cfg.attentiveBounce) oy += Math.round(Math.sin(frame * 0.4) * 1.5);
  if (cfg.workBounce) oy += workBounceOffset(frame);
  if (cfg.shake) oy += frame % 2 ? 1 : -1;
  if (cfg.slump) oy += 2;
  if (cfg.allowHop) oy += Math.round(-1.5 * Math.sin(frame * 0.8));

  if (transition && transition.active) {
    oy += transitionHop(transition.progress);
  }

  return oy;
}

function drawGrid(ctx, grid, oy) {
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[y].length; x++) {
      const v = grid[y][x];
      if (v && PALETTE[v]) { ctx.fillStyle = PALETTE[v]; ctx.fillRect(x, y + oy, 1, 1); }
    }
}

// ---- State transition controller ----

class PetAnimator {
  constructor() {
    this.state = 'idle';
    this.fromState = 'idle';
    this.transitionStart = -1;
  }

  setState(next, frame) {
    if (next === this.state) return;
    this.fromState = this.state;
    this.state = next;
    this.transitionStart = frame;
  }

  getTransition(frame) {
    if (this.transitionStart < 0) {
      return { active: false, progress: 1, from: this.state, to: this.state, display: this.state };
    }
    const elapsed = frame - this.transitionStart;
    if (elapsed >= TRANSITION_FRAMES) {
      this.transitionStart = -1;
      return { active: false, progress: 1, from: this.state, to: this.state, display: this.state };
    }
    const progress = elapsed / TRANSITION_FRAMES;
    const display = progress < 0.5 ? this.fromState : this.state;
    return { active: true, progress, from: this.fromState, to: this.state, display };
  }
}

function drawPet(ctx, state, detail, frame, transition) {
  ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

  const tr = transition || { active: false, progress: 1, display: state };
  const visualState = tr.display || state;
  const pose = resolvePose(visualState, frame);
  let grid = centerGrid(buildPose(pose), SPRITE_SIZE);
  let data = applyStateProps(toStrings(grid), visualState, frame);
  const oy = computeOffsetY(visualState, frame, tr.active ? tr : null);

  drawGrid(ctx, data.map(r => r.split('').map(c => +c || 0)), oy);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    drawPet, PALETTE, SPRITE_SIZE, SCF, STATE_VISUALS, PetAnimator, TRANSITION_FRAMES
  };
}
