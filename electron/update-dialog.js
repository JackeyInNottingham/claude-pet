/**
 * UpdateDialog — update notification UI (renderer process)
 *
 * Shown when a new GitHub release is detected. Uses the same CSS animation
 * system as PermissionDialog (is-open / waiting / hiding / hidden) but with
 * a blue theme to visually distinguish from permission prompts.
 *
 * Callbacks:
 *   UpdateDialog.onUpdate — user clicked "Update"
 *   UpdateDialog.onSkip  — user clicked "Skip"
 */

const UpdateDialog = {
  el: null,
  titleEl: null,
  versionEl: null,
  notesEl: null,
  updateBtn: null,
  skipBtn: null,
  hideTimer: null,

  init() {
    this.el = document.getElementById('update-dialog');
    if (!this.el) return;

    this.titleEl = this.el.querySelector('.update-title');
    this.versionEl = this.el.querySelector('.update-version');
    this.notesEl = this.el.querySelector('.update-notes');
    this.updateBtn = this.el.querySelector('.update-btn');
    this.skipBtn = this.el.querySelector('.update-skip-btn');

    if (this.updateBtn) {
      this.updateBtn.addEventListener('click', () => {
        this._onUpdateClick();
      });
    }
    if (this.skipBtn) {
      this.skipBtn.addEventListener('click', () => {
        this._onSkipClick();
      });
    }
  },

  /** Check if permission dialog is currently visible */
  _permissionIsVisible() {
    const pd = document.getElementById('permission-dialog');
    return pd && (pd.classList.contains('is-open') || pd.classList.contains('waiting'));
  },

  show(data) {
    if (!this.el) this.init();
    if (!this.el) return;

    // Don't show if permission dialog is active
    if (this._permissionIsVisible()) {
      // Retry later
      setTimeout(() => this.show(data), 2000);
      return;
    }

    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    if (this.titleEl) {
      this.titleEl.textContent = '🆕 New Version Available!';
    }
    if (this.versionEl) {
      this.versionEl.textContent = `${data.currentVersion || '?'} → ${data.latestVersion || '?'}`;
    }
    if (this.notesEl) {
      this.notesEl.textContent = data.releaseNotes || '';
      // If notes are empty, hide the notes section
      this.notesEl.style.display = data.releaseNotes ? '' : 'none';
    }

    // Reset button state
    if (this.updateBtn) {
      this.updateBtn.disabled = false;
      this.updateBtn.textContent = 'Update';
    }
    if (this.skipBtn) {
      this.skipBtn.disabled = false;
      this.skipBtn.textContent = 'Skip';
    }

    this.el.classList.remove('hidden', 'hiding');
    this.el.classList.add('waiting', 'is-open');

    if (typeof this.onShow === 'function') this.onShow();
  },

  /** Show updating state (buttons disabled, text changed) */
  showUpdating() {
    if (this.updateBtn) {
      this.updateBtn.disabled = true;
      this.updateBtn.textContent = '⏳ Updating...';
    }
    if (this.skipBtn) {
      this.skipBtn.disabled = true;
    }
  },

  _onUpdateClick() {
    if (typeof this.onUpdate === 'function') {
      this.showUpdating();
      this.onUpdate();
    }
  },

  _onSkipClick() {
    this._close();
    if (typeof this.onSkip === 'function') this.onSkip();
  },

  _close() {
    if (!this.el) return;
    this.el.classList.remove('waiting');
    this.el.classList.add('hiding');

    this.hideTimer = setTimeout(() => {
      this.el.classList.add('hidden');
      this.el.classList.remove('hiding', 'is-open', 'waiting');
      this.hideTimer = null;
      if (typeof this.onHide === 'function') this.onHide();
    }, 260); // match CSS exit animation duration
  },

  hide() {
    this._close();
  }
};

UpdateDialog.init();
