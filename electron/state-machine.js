// Claude Pet state machine — 8 states + permission feedback
const STATES = {
  IDLE: 'idle',
  READING: 'reading',
  SEARCHING: 'searching',
  THINKING: 'thinking',
  WRITING: 'writing',
  EXECUTING: 'executing',
  ERROR: 'error',
  PERMISSION: 'permission',
  PERMISSION_ALLOW: 'permission_allow',
  PERMISSION_DENY: 'permission_deny'
};

// How long before returning to idle after a tool finishes (ms)
const THINKING_TIMEOUT = 3000;
const ERROR_DISPLAY_MS = 3000;
const PERMISSION_FEEDBACK_MS = 350;

class StateMachine {
  constructor(onStateChange) {
    this.currentState = STATES.IDLE;
    this.currentDetail = '';
    this.onStateChange = onStateChange;
    this.thinkingTimer = null;
    this.errorTimer = null;
    this.feedbackTimer = null;
    this.lastToolTime = 0;
  }

  isPermissionLocked() {
    return this.currentState === STATES.PERMISSION ||
      this.currentState === STATES.PERMISSION_ALLOW ||
      this.currentState === STATES.PERMISSION_DENY;
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

  // Permission dialog shown — overrides tool states until resolved
  enterPermission(detail) {
    this.clearTimers();
    this.setState(STATES.PERMISSION, detail || 'Permission needed');
  }

  permissionResolved(decision) {
    this.clearTimers();
    const allow = typeof decision === 'string'
      ? decision === 'allow'
      : decision && decision.behavior === 'allow';
    this.setState(
      allow ? STATES.PERMISSION_ALLOW : STATES.PERMISSION_DENY,
      typeof decision === 'string' ? decision : decision.behavior
    );
    this.feedbackTimer = setTimeout(() => {
      this.feedbackTimer = null;
      if (allow) this.enterThinking();
      else this.goIdle();
    }, PERMISSION_FEEDBACK_MS);
  }

  // Called on Stop hook or manual reset
  goIdle() {
    this.clearTimers();
    this.setState(STATES.IDLE, '');
  }

  // Called by renderer when main process sends a resolved state name
  applyRemoteState(state, detail) {
    if (this.isPermissionLocked() && state !== STATES.IDLE) return;

    const valid = Object.values(STATES);
    if (!valid.includes(state)) return;

    if (state === STATES.IDLE) {
      this.goIdle();
      return;
    }
    if (state === STATES.ERROR) {
      this.toolFailed('hook', detail || 'failed');
      return;
    }
    if (state === STATES.THINKING) {
      this.enterThinking();
      return;
    }
    if (state === STATES.PERMISSION) {
      this.enterPermission(detail);
      return;
    }
    if (state === STATES.PERMISSION_ALLOW || state === STATES.PERMISSION_DENY) {
      return;
    }

    this.clearTimers();
    this.setState(state, detail || '');
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
    if (this.feedbackTimer) { clearTimeout(this.feedbackTimer); this.feedbackTimer = null; }
  }

  getState() {
    return { state: this.currentState, detail: this.currentDetail };
  }
}

// Export for both CommonJS (main process) and browser (renderer via script tag)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StateMachine, STATES };
}
