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
