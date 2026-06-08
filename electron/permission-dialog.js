// PermissionDialog — queue-based, timeout-aware permission UI
const PermissionDialog = {
  el: null,
  titleEl: null,
  detailEl: null,
  buttonsEl: null,
  queue: [],              // pending requests: [{request, callback}]
  currentCallback: null,
  hideTimer: null,
  timeoutTimer: null,
  timeoutMs: 30000,       // default 30s, overridable via setConfig()
  timeoutBehavior: 'allow', // 'allow' | 'deny' | 'ignore'

  init() {
    this.el = document.getElementById('permission-dialog');
    if (!this.el) return;

    this.titleEl = this.el.querySelector('.permission-title');
    this.detailEl = this.el.querySelector('.permission-detail');
    this.buttonsEl = this.el.querySelector('.permission-buttons');
  },

  getFormat() {
    if (typeof window !== 'undefined' && window.PermissionFormat) return window.PermissionFormat;
    if (typeof PermissionFormat !== 'undefined') return PermissionFormat;
    return null;
  },

  /** Set config: { permissionTimeoutMs, timeoutBehavior } */
  setConfig(cfg) {
    if (cfg && typeof cfg.permissionTimeoutMs === 'number' && cfg.permissionTimeoutMs > 0) {
      this.timeoutMs = cfg.permissionTimeoutMs;
    }
    if (cfg && cfg.timeoutBehavior && ['allow', 'deny', 'ignore'].includes(cfg.timeoutBehavior)) {
      this.timeoutBehavior = cfg.timeoutBehavior;
    }
  },

  /** Enqueue a permission request. Shows immediately if idle, otherwise waits. */
  show(request, callback) {
    if (!this.el) this.init();
    if (!this.el) return;

    this.queue.push({ request, callback });
    if (!this._isShowing()) {
      this._showNext();
    }
  },

  _isShowing() {
    return this.el && (
      this.el.classList.contains('is-open') ||
      this.el.classList.contains('waiting')
    );
  },

  _showNext() {
    if (this.queue.length === 0) {
      this.currentCallback = null;
      return;
    }

    const fmt = this.getFormat();
    if (!this.el || !fmt) return;

    const { request, callback } = this.queue.shift();
    this.currentCallback = callback;

    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    const title = fmt.title(request);
    const detail = fmt.detail(request);
    const options = fmt.buildOptions(request);

    if (this.titleEl) this.titleEl.textContent = title;
    if (this.detailEl) this.detailEl.textContent = detail;
    this._renderButtons(options);

    this.el.classList.remove('hidden', 'hiding');
    this.el.classList.add('waiting', 'is-open');

    if (typeof this.onShow === 'function') this.onShow();

    // Start auto-dismiss timeout
    this._startTimeout();
  },

  _renderButtons(options) {
    if (!this.buttonsEl) return;
    this.buttonsEl.innerHTML = '';

    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt.label;
      btn.className = 'permission-option';
      if (opt.primary) btn.classList.add('permission-option-primary');
      if (opt.id === 'deny') btn.classList.add('permission-option-deny');
      btn.addEventListener('click', () => this.respond(opt.decision));
      this.buttonsEl.appendChild(btn);
    });
  },

  _startTimeout() {
    this._clearTimeout();
    this.timeoutTimer = setTimeout(() => {
      this.timeoutTimer = null;
      this._handleTimeout();
    }, this.timeoutMs);
  },

  _clearTimeout() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  },

  /** Timeout: auto-dismiss and send configured decision (allow/deny/ignore). */
  _handleTimeout() {
    const cb = this.currentCallback;
    this.currentCallback = null;

    // Build decision based on config
    let decision = null;
    if (this.timeoutBehavior === 'allow') {
      decision = { behavior: 'allow', message: 'Auto-allowed (pet timeout)' };
    } else if (this.timeoutBehavior === 'deny') {
      decision = { behavior: 'deny', message: 'Auto-denied (pet timeout)' };
    }
    // 'ignore': decision stays null — dismiss silently

    this.el.classList.remove('waiting');
    this.el.classList.add('hiding');

    this.hideTimer = setTimeout(() => {
      this.el.classList.add('hidden');
      this.el.classList.remove('hiding', 'is-open', 'waiting');
      this.hideTimer = null;
      if (typeof this.onTimeout === 'function') this.onTimeout();
      this._showNext();
    }, 200);

    if (cb) cb(decision);
  },

  /** User clicked a button — send decision and show next queued request. */
  respond(decision) {
    this._clearTimeout();

    this.el.classList.remove('waiting');
    this.el.classList.add('hiding');
    const cb = this.currentCallback;
    this.currentCallback = null;

    this.hideTimer = setTimeout(() => {
      this.el.classList.add('hidden');
      this.el.classList.remove('hiding', 'is-open', 'waiting');
      this.hideTimer = null;
      if (typeof this.onHide === 'function') this.onHide();
      // Process next queued request
      this._showNext();
    }, 200);

    if (cb) cb(decision);
  },

  hide() {
    this._clearTimeout();
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (!this.el) return;
    this.el.classList.remove('waiting', 'hiding', 'is-open');
    this.el.classList.add('hidden');
    this.currentCallback = null;
    this.queue = [];
    if (typeof this.onHide === 'function') this.onHide();
  }
};

PermissionDialog.init();
