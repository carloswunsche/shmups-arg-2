class Viewport {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.canvas = document.querySelector('canvas');
    if (!this.canvas) throw new Error('Viewport: no <canvas> element found');
    this.ctx = this.canvas.getContext('2d');
    canvas.style.background = '#222';
  }

  init() {
    this.setScaleAndResize();
    this.setPixelatedLook();
    window.addEventListener('resize', () => {
      this.setScaleAndResize();
      this.setPixelatedLook();
    });
    this.canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', e => {
      if (e.ctrlKey && (e.key === '=' || e.key === '-' || e.key === '0')) e.preventDefault();
    });
  }

  setScaleAndResize(desiredScale) {
    if (desiredScale) {
      this.scale = desiredScale;
    } else {
      this.scale = Math.max(1, Math.min(
        Math.trunc(window.innerWidth / this.width),
        Math.trunc(window.innerHeight / this.height)
      ));
    }
    this.canvas.width = this.scale * this.width;
    this.canvas.height = this.scale * this.height;
  }

  setPixelatedLook() {this.ctx.imageSmoothingEnabled = false}
}

export default Viewport;
