// Claude Pet Pixel Art Sprite System
// Faithful to the CLI mascot: ▐▛███▜▌ / ▝▜█████▛▘ / ▘▘ ▝▝
// Geometric, blocky pixel art at 32×32 logical resolution

const PALETTE = {
  0: null,           // transparent
  1: '#92400E',      // outline / dark
  2: '#F59E0B',      // primary body
  3: '#FBBF24',      // highlight
  4: '#FEF3C7',      // light / eye whites
  5: '#EF4444',      // error red
  6: '#3B82F6',      // info blue
  7: '#FCD34D',      // cheek blush
  8: '#B45309',      // shadow
  9: '#D97706'       // mid-tone
};

const SPRITE_SIZE = 32;

// ---- Base sprite — the core character silhouette ----
// Color indices matching PALETTE keys above

// IDLE body (24×20 character block, centered)
const BASE_SPRITE = [
// 00000000001111111111222222222233
// 01234567890123456789012345678901
  '................................', // 0
  '................................', // 1
  '...........11111111.............', // 2  top of ears
  '..........1222222221............', // 3
  '.........122222222221...........', // 4
  '........12299222292221..........', // 5  ear tips
  '.......1222222222222221.........', // 6
  '......122222222222222221........', // 7  body top — flat
  '.....12222222222222222221.......', // 8
  '.....122224....4222222221.......', // 9  eyes row 1
  '.....122221....1222222221.......', // 10 eyes row 2
  '.....122221....1222222221.......', // 11 eyes row 3
  '.....12222444444222222221.......', // 12 eyes row 4
  '.....12222222222222222221.......', // 13
  '.....12222222222222222221.......', // 14
  '.....12222777772272222221.......', // 15 cheeks
  '.....12222222222222222221.......', // 16
  '......122222222222222221........', // 17
  '.......1222222222222221.........', // 18
  '........12222222222221..........', // 19 body bottom
  '.........122222222221...........', // 20
  '..........1111111111............', // 21 bottom edge
  '............1....1..............', // 22 feet
  '...........11....11.............', // 23
  '..........111....111............', // 24
  '.........1111....1111...........', // 25
  '................................', // 26
  '........1...............1.......', // 27 ear outline left/right accents
  '................................', // 28
  '................................', // 29
  '................................', // 30
  '................................', // 31
];

// BLINK frame — eyes closed
const BLINK_SPRITE = [
  '................................',
  '................................',
  '...........11111111.............',
  '..........1222222221............',
  '.........122222222221...........',
  '........12299222292221..........',
  '.......1222222222222221.........',
  '......122222222222222221........',
  '.....12222222222222222221.......',
  '.....12222111111222222221.......',
  '.....12222111111222222221.......',
  '.....12222111111222222221.......',
  '.....12222111111222222221.......',
  '.....12222222222222222221.......',
  '.....12222222222222222221.......',
  '.....12222777772272222221.......',
  '.....12222222222222222221.......',
  '......122222222222222221........',
  '.......1222222222222221.........',
  '........12222222222221..........',
  '.........122222222221...........',
  '..........1111111111............',
  '............1....1..............',
  '...........11....11.............',
  '..........111....111............',
  '.........1111....1111...........',
  '................................',
  '........1...............1.......',
  '................................',
  '................................',
  '................................',
  '................................',
];

function drawSpriteFromData(ctx, data, offsetX, offsetY) {
  for (let y = 0; y < SPRITE_SIZE; y++) {
    const row = data[y];
    if (!row) continue;
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const idx = parseInt(row[x], 10);
      if (idx > 0 && PALETTE[idx]) {
        const dx = x + offsetX;
        const dy = y + offsetY;
        if (dx >= 0 && dx < SPRITE_SIZE && dy >= 0 && dy < SPRITE_SIZE) {
          ctx.fillStyle = PALETTE[idx];
          ctx.fillRect(dx, dy, 1, 1);
        }
      }
    }
  }
}

// ---- Overlay: eyes for different states ----

// Reading: glasses + scanning look
function applyReadingOverlay(data, frame) {
  const out = data.map(r => r.split(''));
  // Add glasses
  const scanOff = [0, -1, 0, 1][frame % 4];
  // Glasses frames over eyes
  for (let r = 8; r <= 12; r++) {
    // Left lens
    out[r][9] = '6'; out[r][13] = '6';
    // Right lens
    out[r][16] = '6'; out[r][20] = '6';
  }
  // Top/bottom of lenses
  for (let c = 9; c <= 13; c++) { out[8][c] = '6'; out[12][c] = '6'; }
  for (let c = 16; c <= 20; c++) { out[8][c] = '6'; out[12][c] = '6'; }
  // Bridge
  out[10][14] = '6'; out[10][15] = '6';
  // Scanning pupils
  out[10][10+scanOff] = '1'; out[10][11+scanOff] = '1';
  out[10][17+scanOff] = '1'; out[10][18+scanOff] = '1';
  out[11][10+scanOff] = '1'; out[11][11+scanOff] = '1';
  out[11][17+scanOff] = '1'; out[11][18+scanOff] = '1';
  return out.map(r => r.join(''));
}

// Searching: squint + magnifier
function applySearchingOverlay(data, frame) {
  const out = data.map(r => r.split(''));
  const lookDirs = [{ox:0,oy:0},{ox:-1,oy:0},{ox:0,oy:0},{ox:1,oy:0},{ox:0,oy:-1},{ox:0,oy:0}];
  const dir = lookDirs[frame % 6];
  // Squint eyes: cover top row
  out[9][9] = '2'; out[9][10] = '2'; out[9][11] = '2';
  out[9][16] = '2'; out[9][17] = '2'; out[9][18] = '2';
  // Reposition pupils
  out[10][10] = '1'; out[10][11] = '1';
  out[10][17] = '1'; out[10][18] = '1';
  // Magnifier (right side)
  const bob = Math.sin(frame * 0.5) > 0 ? 0 : 1;
  const mx = 24, my = 5 + bob;
  // Glass edges
  const ring = [[1,2],[1,3],[1,4],[2,1],[2,5],[3,0],[3,6],[4,0],[4,6],[5,1],[5,5],[6,2],[6,3],[6,4]];
  for (let [dx,dy] of ring) {
    if (mx+dx < 32 && my+dy < 32) out[my+dy][mx+dx] = '6';
  }
  // Handle
  if (mx+6 < 32 && my+7 < 32) out[my+7][mx+6] = '8';
  if (mx+7 < 32 && my+8 < 32) out[my+8][mx+7] = '8';
  return out.map(r => r.join(''));
}

// Thinking: one big eye + gear
function applyThinkingOverlay(data, frame) {
  const out = data.map(r => r.split(''));
  // Replace eyes with one big eye looking up-right
  for (let r = 9; r <= 12; r++) {
    for (let c = 9; c <= 19; c++) {
      out[r][c] = (r === 9 || r === 12 || c === 9 || c === 19) ? '1'
        : (r === 10 && c >= 16) ? '1' : '4';
    }
  }
  // Pupil top-right
  out[10][16] = '1'; out[10][17] = '1'; out[11][16] = '1'; out[11][17] = '1';
  // Gear above
  const cx = 16, cy = 2;
  const angle = frame * 0.3;
  for (let a = 0; a < 8; a++) {
    const rad = (a / 8) * Math.PI * 2 + angle;
    const tl = (a % 2 === 0) ? 3 : 2;
    const tx = Math.round(cx + Math.cos(rad) * tl);
    const ty = Math.round(cy + Math.sin(rad) * tl);
    if (tx >= 0 && tx < 32 && ty >= 0 && ty < 32) out[ty][tx] = '1';
  }
  out[cy][cx] = '3';
  return out.map(r => r.join(''));
}

// Writing: narrowed eyes + keyboard
function applyWritingOverlay(data, frame) {
  const out = data.map(r => r.split(''));
  // Narrow eyes
  for (let r = 9; r <= 12; r++) {
    for (let c = 9; c <= 13; c++) out[r][c] = '2';
    for (let c = 16; c <= 20; c++) out[r][c] = '2';
  }
  out[10][10] = '4'; out[10][11] = '4'; out[10][12] = '1';
  out[11][10] = '1'; out[11][11] = '1';
  out[10][17] = '4'; out[10][18] = '4'; out[10][19] = '1';
  out[11][17] = '1'; out[11][18] = '1';
  // Tiny keyboard at bottom
  const kby = 18;
  for (let kr = 0; kr < 3; kr++) {
    for (let kc = 0; kc < 9; kc++) {
      const keyOn = (frame % 4 === kc % 4);
      out[kby+kr][9+kc] = keyOn ? '3' : '1';
    }
  }
  return out.map(r => r.join(''));
}

// Executing: determined brows + gear
function applyExecutingOverlay(data, frame) {
  const out = data.map(r => r.split(''));
  // Angled brows above eyes
  out[8][9] = '1'; out[8][12] = '1';
  out[8][17] = '1'; out[8][20] = '1';
  out[7][10] = '1'; out[7][18] = '1';
  // Gear
  const cx = 16, cy = 1;
  const angle = frame * 0.4;
  for (let a = 0; a < 8; a++) {
    const rad = (a / 8) * Math.PI * 2 + angle;
    const tl = (a % 2 === 0) ? 3 : 2;
    const tx = Math.round(cx + Math.cos(rad) * tl);
    const ty = Math.round(cy + Math.sin(rad) * tl);
    if (tx >= 0 && tx < 32 && ty >= 0 && ty < 32) out[ty][tx] = '1';
  }
  out[cy][cx] = '3';
  return out.map(r => r.join(''));
}

// Error: X_X eyes + sweat
function applyErrorOverlay(data, frame) {
  const out = data.map(r => r.split(''));
  // Red-flash body tint (first 2 frames)
  if (frame < 2) {
    for (let r = 7; r <= 19; r++) {
      for (let c = 8; c <= 21; c++) {
        if (out[r][c] === '2' || out[r][c] === '3') out[r][c] = '5';
      }
    }
  }
  // X eyes
  for (let eyeX of [10, 17]) {
    out[9][eyeX] = '1'; out[10][eyeX-1] = '1'; out[9][eyeX+1] = '1';
    out[10][eyeX+1] = '1'; out[11][eyeX] = '1';
  }
  // Sweat drop
  const sw = [[23,8],[23,9],[24,9],[23,10],[24,10],[25,10],[23,11],[24,11],[24,12]];
  for (let [sx,sy] of sw) {
    if (sx < 32 && sy < 32) out[sy][sx] = '6';
  }
  return out.map(r => r.join(''));
}

// ---- Main draw function ----

function drawPet(ctx, state, detail, frame) {
  ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

  let data = [...BASE_SPRITE];
  const blinkFrame = (state === 'idle' && (frame % 8 >= 6));

  // Apply blink
  if (blinkFrame) {
    data = [...BLINK_SPRITE];
  }

  // Apply state-specific overlays
  switch (state) {
    case 'reading':
      data = applyReadingOverlay(data, frame);
      break;
    case 'searching':
      data = applySearchingOverlay(data, frame);
      break;
    case 'thinking':
      data = applyThinkingOverlay(data, frame);
      break;
    case 'writing':
      data = applyWritingOverlay(data, frame);
      break;
    case 'executing':
      data = applyExecutingOverlay(data, frame);
      break;
    case 'error':
      data = applyErrorOverlay(data, frame);
      break;
    // idle: just blink, no extra overlay
  }

  // Bounce offset for idle breathing
  let offsetY = 0;
  if (state === 'idle') {
    offsetY = Math.round(Math.sin(frame * 0.3) * 1);
  }
  if (state === 'error' && frame < 3) {
    offsetY = (frame % 2 === 0) ? -2 : 2;
  }

  drawSpriteFromData(ctx, data, 0, offsetY);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { drawPet, PALETTE, SPRITE_SIZE };
}
