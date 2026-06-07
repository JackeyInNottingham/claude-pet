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
  const ringCoords = [
    [0,2],[0,3],[0,4],[1,1],[1,5],[2,0],[2,6],[3,0],[3,6],[4,1],[4,5],[5,2],[5,3],[5,4]
  ];
  for (let [dx, dy] of ringCoords) {
    px(ctx, mx+dx, my+dy, PALETTE.info);
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
      const color = (kr === 0 && kc === 5) ? PALETTE.highlight
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
