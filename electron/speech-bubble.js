const SpeechBubble = {
  el: document.getElementById('speech-bubble'),
  timer: null,

  show(text) {
    if (!this.el) return;
    this.el.textContent = text;
    this.el.classList.remove('hidden');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fadeOut(), 3000);
  },

  fadeOut() {
    if (this.el) this.el.classList.add('hidden');
  },

  hide() {
    this.fadeOut();
  }
};
