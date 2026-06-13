class GameLoop {
  constructor(ups, fps) {
    this._ups = ups || 60;
    this._fps = fps || 60;
    this.oneUpdateInMs = 1000 / this._ups;
    this.oneFrameInMs = 1000 / this._fps;
    this.paused = false;
    this.MAX_DELTA_MS = 1000;
    this.MAX_UPDATES_PER_FRAME = 5;
    this._step = (s) => this.step(s);
    this._autoPaused = false;
    document.addEventListener('visibilitychange', () => this._handleVisibility());
  }

  get ups() { return this._ups; }
  set ups(val) { this._ups = val; this.oneUpdateInMs = 1000 / val; }

  get fps() { return this._fps; }
  set fps(val) { this._fps = val; this.oneFrameInMs = 1000 / val; }

  start(updateFn, renderFn) {
    if (updateFn) this._update = updateFn;
    if (renderFn) this._render = renderFn;
    this.paused = false;
    this.timeAcc = 0;
    this.renderAcc = 0;
    this.delta = 0;
    this.lastStamp = performance.now();
    window.requestAnimationFrame(this._step);
  }

  pause() {
    this.paused = true;
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.lastStamp = performance.now();
    window.requestAnimationFrame(this._step);
  }

  step(newStamp) {
    this.delta = Math.min(newStamp - this.lastStamp, this.MAX_DELTA_MS);
    this.lastStamp = newStamp;
    this.timeAcc += this.delta;

    let updates = 0;
    while (this.timeAcc >= this.oneUpdateInMs && updates < this.MAX_UPDATES_PER_FRAME) {
      this._update();
      this.timeAcc -= this.oneUpdateInMs;
      this.renderAcc += this.oneUpdateInMs;
      updates++;
    }
    if (updates >= this.MAX_UPDATES_PER_FRAME) this.timeAcc = 0;

    if (this.renderAcc >= this.oneFrameInMs) {
      this._render();
      this.renderAcc -= this.oneFrameInMs;
    }

    if (!this.paused) window.requestAnimationFrame(this._step);
  }

  _handleVisibility() {
    if (document.hidden) {
      if (!this.paused) {
        this._autoPaused = true;
        this.pause();
      }
    } else if (this._autoPaused) {
      this._autoPaused = false;
      this.resume();
    }
  }
}

export default GameLoop;
