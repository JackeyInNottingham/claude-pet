const PermissionDialog = {
  el: null,
  titleEl: null,
  detailEl: null,
  buttonsEl: null,
  callback: null,
  hideTimer: null,
  currentOptions: [],

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

  show(request, callback) {
    if (!this.el) this.init();
    const fmt = this.getFormat();
    if (!this.el || !fmt) return;

    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    const title = fmt.title(request);
    const detail = fmt.detail(request);
    this.currentOptions = fmt.buildOptions(request);

    if (this.titleEl) this.titleEl.textContent = title;
    if (this.detailEl) this.detailEl.textContent = detail;
    this.renderButtons();

    this.callback = callback;
    this.el.classList.remove('hidden', 'hiding');
    this.el.classList.add('waiting', 'is-open');

    if (typeof this.onShow === 'function') this.onShow();
  },

  renderButtons() {
    if (!this.buttonsEl) return;
    this.buttonsEl.innerHTML = '';

    this.currentOptions.forEach((opt) => {
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

  respond(decision) {
    this.el.classList.remove('waiting');
    this.el.classList.add('hiding');
    const cb = this.callback;
    this.callback = null;
    this.hideTimer = setTimeout(() => {
      this.el.classList.add('hidden');
      this.el.classList.remove('hiding', 'is-open', 'waiting');
      this.hideTimer = null;
      if (typeof this.onHide === 'function') this.onHide();
    }, 200);
    if (cb) cb(decision);
  },

  hide() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (!this.el) return;
    this.el.classList.remove('waiting', 'hiding', 'is-open');
    this.el.classList.add('hidden');
    this.callback = null;
    if (typeof this.onHide === 'function') this.onHide();
  }
};

PermissionDialog.init();
