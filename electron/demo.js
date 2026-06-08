// Animation demo — random state cycling + Claude Code permission dialog

const TOOL_STATES = Object.keys(STATE_VISUALS).filter(
  s => s !== 'permission' && !s.startsWith('permission_')
);
const ALL_STATES = Object.keys(STATE_VISUALS);
const PERM_SAMPLES = PermissionFormat.demoSamples;
const SCALE = 8;
const MIN_INTERVAL_MS = 2200;
const MAX_INTERVAL_MS = 4200;

const MESSAGES = {
  idle: '',
  reading: 'Reading...',
  searching: 'Searching...',
  thinking: 'Thinking...',
  writing: 'Writing code...',
  executing: 'Running...',
  error: 'Oops!',
  permission: '',
  permission_allow: '',
  permission_deny: ''
};

const SAMPLE_LABELS = ['短命令 (Yes/No)', '长命令 + 1 条 Always allow', '多条 Always allow', 'Edit 文件'];

const canvas = document.getElementById('demo-canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const petAnimator = new PetAnimator();
const machine = new StateMachine(({ state }) => {
  petAnimator.setState(state, frame);
  currentState = state;
  updateBubble(state);
  updateChips(state);
  el.current.textContent = state;
  if (state === 'permission') pauseAutoRandom();
  else if (!PermissionDialog.el || PermissionDialog.el.classList.contains('hidden')) {
    scheduleNextSwitch();
  }
});

let frame = 0;
let currentState = 'idle';
let permSampleIndex = 0;
let nextSwitchAt = 0;
let countdownTimer = null;
let autoRandom = true;

const el = {
  current: document.getElementById('stat-current'),
  display: document.getElementById('stat-display'),
  from: document.getElementById('stat-from'),
  countdown: document.getElementById('stat-countdown'),
  permSample: document.getElementById('stat-perm-sample'),
  progress: document.getElementById('progress-bar'),
  bubble: document.getElementById('demo-bubble'),
  chips: document.getElementById('state-chips'),
  autoRandom: document.getElementById('auto-random'),
  btnRandom: document.getElementById('btn-random'),
  btnPermission: document.getElementById('btn-permission'),
  permPlaceholder: document.getElementById('perm-placeholder')
};

PermissionDialog.onShow = () => {
  if (el.permPlaceholder) el.permPlaceholder.classList.add('hidden');
};

PermissionDialog.onHide = () => {
  if (el.permPlaceholder) el.permPlaceholder.classList.remove('hidden');
};

document.querySelector('.demo-footer').textContent =
  `选项与 Claude Code 一致：Yes / Always allow… / No · 长文本与多选项可滚动 · ${TRANSITION_FRAMES} 帧过渡`;

function pickRandomState(exclude) {
  const pool = TOOL_STATES.filter(s => s !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

function switchTo(state) {
  if (state === currentState) return;
  if (machine.isPermissionLocked()) return;
  machine.applyRemoteState(state, '');
}

function switchRandom() {
  if (machine.isPermissionLocked()) return;
  switchTo(pickRandomState(currentState));
}

function simulatePermission(sampleIndex) {
  if (machine.isPermissionLocked()) return;
  pauseAutoRandom();

  const idx = typeof sampleIndex === 'number' ? sampleIndex : permSampleIndex;
  const sample = PERM_SAMPLES[idx];
  if (!sample) return;

  el.permSample.textContent = SAMPLE_LABELS[idx] || sample.requestId;
  if (typeof sampleIndex !== 'number') {
    permSampleIndex = (permSampleIndex + 1) % PERM_SAMPLES.length;
  }

  document.querySelectorAll('[data-perm]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.perm === String(idx));
  });

  machine.enterPermission(sample.tool_name || 'Permission');
  PermissionDialog.show(sample, (decision) => {
    machine.permissionResolved(decision);
    el.permSample.textContent = `${SAMPLE_LABELS[idx]} → ${decision.behavior}`;
    document.querySelectorAll('[data-perm]').forEach((btn) => btn.classList.remove('active'));
  });
}

function pauseAutoRandom() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  el.countdown.textContent = '等待确认…';
}

function updateBubble(state) {
  const text = MESSAGES[state] || '';
  if (text) {
    el.bubble.textContent = text;
    el.bubble.classList.add('visible');
  } else {
    el.bubble.classList.remove('visible');
  }
}

function updateChips(active) {
  el.chips.querySelectorAll('.demo-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.state === active);
  });
}

function buildChips() {
  ALL_STATES.forEach((state) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'demo-chip' + (state === currentState ? ' active' : '');
    chip.dataset.state = state;
    chip.textContent = state;
    chip.addEventListener('click', () => {
      if (state === 'permission') simulatePermission();
      else if (!state.startsWith('permission_')) switchTo(state);
    });
    el.chips.appendChild(chip);
  });
}

function scheduleNextSwitch() {
  if (countdownTimer) clearInterval(countdownTimer);
  if (!autoRandom || machine.isPermissionLocked()) {
    if (!machine.isPermissionLocked()) el.countdown.textContent = '已暂停';
    return;
  }

  const delay = MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
  nextSwitchAt = Date.now() + delay;

  countdownTimer = setInterval(() => {
    const left = Math.max(0, nextSwitchAt - Date.now());
    el.countdown.textContent = left > 0 ? `${(left / 1000).toFixed(1)}s` : '切换中…';
    if (left <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      switchRandom();
    }
  }, 100);
}

function updateStatusUI(transition) {
  el.display.textContent = transition.display;
  if (transition.active) {
    el.from.textContent = `${transition.from} → ${transition.to}`;
    el.progress.style.width = `${Math.round(transition.progress * 100)}%`;
  } else {
    el.from.textContent = '—';
    el.progress.style.width = '0%';
  }
}

function renderFrame() {
  ctx.save();
  ctx.clearRect(0, 0, 256, 256);
  ctx.scale(SCALE, SCALE);

  const transition = petAnimator.getTransition(frame);
  drawPet(ctx, currentState, '', frame, transition);
  updateStatusUI(transition);

  ctx.restore();
}

function startLoop() {
  setInterval(() => {
    frame++;
    renderFrame();
  }, 100);
}

el.autoRandom.addEventListener('change', () => {
  autoRandom = el.autoRandom.checked;
  scheduleNextSwitch();
});

el.btnRandom.addEventListener('click', switchRandom);
el.btnPermission.addEventListener('click', () => simulatePermission());

document.querySelectorAll('[data-perm]').forEach((btn) => {
  btn.addEventListener('click', () => simulatePermission(parseInt(btn.dataset.perm, 10)));
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    switchRandom();
    return;
  }
  if (e.key === 'p' || e.key === 'P') {
    e.preventDefault();
    simulatePermission();
    return;
  }
  if (e.key >= '1' && e.key <= '4') {
    e.preventDefault();
    simulatePermission(parseInt(e.key, 10) - 1);
  }
});

buildChips();
updateBubble(currentState);
el.permSample.textContent = SAMPLE_LABELS[0];
scheduleNextSwitch();
startLoop();
