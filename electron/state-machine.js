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
