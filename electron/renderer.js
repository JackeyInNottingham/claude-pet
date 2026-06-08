// Renderer — boots the pet window: state machine + canvas animation loop

const canvas = document.getElementById('pet-canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const SCALE = 8; // 32px * 8 = 256px canvas
let frame = 0;
let fpsInterval = null;
let currentState = 'idle';
let currentDetail = '';
const petAnimator = new PetAnimator();

// Track pending update version for skip action
let pendingUpdateVersion = null;

// Initialize state machine
const machine = new StateMachine(({ state, detail }) => {
  petAnimator.setState(state, frame);
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

  const transition = petAnimator.getTransition(frame);
  drawPet(ctx, currentState, currentDetail, frame, transition);

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
    error: 'Oops!',
    permission: '',
    permission_allow: '',
    permission_deny: ''
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
    machine.applyRemoteState(state, detail);
  });

  window.electronAPI.onPermissionRequest((data) => {
    const detail = data.tool_name || data.message || data.command || 'Permission needed';
    machine.enterPermission(detail);
    PermissionDialog.show(data, (decision) => {
      if (decision === null) {
        // Timeout with 'ignore' behavior: dismiss silently
        machine.goIdle();
        return;
      }
      machine.permissionResolved(decision);
      window.electronAPI.sendPermissionResponse(data.requestId || '', decision);
    });
  });

  // Receive config from main process
  window.electronAPI.onConfig((config) => {
    PermissionDialog.setConfig(config);
  });

  // ── Update checker events ──

  // Show update dialog when new version is available
  window.electronAPI.onUpdateAvailable((data) => {
    pendingUpdateVersion = data.latestVersion;
    UpdateDialog.show(data);
  });

  // Handle update result from main process
  window.electronAPI.onUpdateResult((result) => {
    if (result.success) {
      SpeechBubble.show('✅ Updated! Restart pet to apply.');
      setTimeout(() => UpdateDialog.hide(), 1500);
    } else {
      // Show error, let user dismiss
      SpeechBubble.show('❌ ' + (result.message || 'Update failed'));
      UpdateDialog.hide();
    }
  });
}

// ── UpdateDialog callbacks ──

UpdateDialog.onUpdate = () => {
  window.electronAPI.sendUpdateAction({ action: 'update' });
};

UpdateDialog.onSkip = () => {
  window.electronAPI.sendUpdateAction({ action: 'skip', version: pendingUpdateVersion });
};

// PermissionDialog timeout handler — dialog auto-dismissed, pet goes idle
PermissionDialog.onTimeout = () => {
  machine.goIdle();
};

function showPermissionDialog(request) {
  return new Promise((resolve) => {
    PermissionDialog.show(request, (decision) => {
      resolve(decision);
    });
  });
}

// Start
startAnimationLoop();
