// Background scrolls a tall "world" of tile rows built by concatenating
// every block's bgPortions in order. Each portion has an `appearances`
// count controlling how it fills the viewport as rows scroll through.
//
// appearances = 1   →  no self-wrap. The NEXT portion fills the gap.
// appearances = 2+  →  the CURRENT portion wraps around visually.
//                       After N full scrolls, advance to the next portion.
// appearances = -1  →  infinite self-wrap (never advance).
//
// scrollY grows continuously. The renderer reads wrapStart/wrapEnd to
// modular-wrap row indices for seamless visual tiling.

const ease = (t, kind) => {
  switch (kind) {
    case 'ease-in':     return t * t;
    case 'ease-out':    return t * (2 - t);
    case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default:            return t;
  }
};

class Background {
  constructor(tilemap, tilesetImage) {
    this.tilemap      = tilemap;
    this.tilesetImage = tilesetImage;
    this.tileW        = tilemap.tileW;
    this.tileH        = tilemap.tileH;
    this.scrollY      = 0;
    this.scrollSpeed  = 0;
    this.bgPortions   = tilemap.bgPortions || [];
    this.bgPortionIndex = 0;
    this.wrapStart    = 0;
    this.wrapEnd      = 0;
    this._scrollsCompleted = 0;
    this._nextBoundary = 0;
    this.speedStart    = 0;
    this.targetSpeed   = 0;
    this.speedTimer    = 0;
    this.speedDuration = 0;
    this.speedEasing   = 'linear';
    this._skipping     = false;

    if (this.bgPortions.length > 0) {
      const p = this.bgPortions[0];
      this.scrollY = p.startRow * this.tileH;
      this._enterPortion(0);
    }
  }

  setSpeed(value, duration, easing) {
    if (this._isTransitioningTo(value, duration, easing)) return;
    this.speedStart    = this.scrollSpeed;
    this.targetSpeed   = value;
    this.speedTimer    = 0;
    this.speedDuration = duration || 0;
    this.speedEasing   = easing || 'linear';
    if (this.speedDuration === 0) this.scrollSpeed = value;
  }

  jumpToBgPortion(index) {
    if (index < 0 || index >= this.bgPortions.length) return;
    const p = this.bgPortions[index];
    this.scrollY = p.startRow * this.tileH;
    this._enterPortion(index);
  }

  get passesCompleted() { return this._scrollsCompleted; }

  isSkipping() { return this._skipping; }

  startAcceleratedSkip(_endIndex, { speedMul = 2, transition = 30, easing = 'linear' } = {}) {
    const current = this.bgPortions[this.bgPortionIndex];
    if (!current) return;
    this._skipping = true;
    this.setSpeed((current.speed || 0) * speedMul, transition, easing);
  }

  finishAcceleratedSkip() {
    this._skipping = false;
    const p = this.bgPortions[this.bgPortionIndex];
    if (p) this.setSpeed(p.speed || 0, p.speedTransitionTime || 0, p.speedEasing || 'linear');
  }

  update() {
    return; // Developer: early return for debug

    if (this.speedDuration > 0) {
      this.speedTimer++;
      const t = Math.min(this.speedTimer / this.speedDuration, 1);
      this.scrollSpeed = this.speedStart + (this.targetSpeed - this.speedStart) * ease(t, this.speedEasing);
      if (t >= 1) this.speedDuration = 0;
    }
    this.scrollY += this.scrollSpeed;

    const p = this.bgPortions[this.bgPortionIndex];
    if (!p) return;

    if (p.appearances < 0) {
      // Infinite wrap: renderer handles visual looping, no advancement needed.
      return;
    }

    while (this.scrollY >= this._nextBoundary) {
      this._scrollsCompleted++;
      if (this._scrollsCompleted >= p.appearances) {
        this._enterPortion(this.bgPortionIndex + 1);
        return;
      }
      this._nextBoundary += p.height * this.tileH;
    }
    console.log(this)
  }

  _enterPortion(index) {
    if (index >= this.bgPortions.length) {
      this.bgPortionIndex = this.bgPortions.length;
      this.wrapStart = 0;
      this.wrapEnd   = 0;
      this.scrollSpeed = 0;
      return;
    }
    const p = this.bgPortions[index];
    if (!p) return;
    const portionH           = p.height * this.tileH;
    this.bgPortionIndex      = index;
    this._scrollsCompleted   = 0;
    this._nextBoundary       = this.scrollY + portionH;
    this.wrapStart           = p.startRow;
    this.wrapEnd             = p.startRow + p.height;
    this.setSpeed(p.speed || 0, p.speedTransitionTime || 0, p.speedEasing || 'linear');
  }

  _isTransitioningTo(value, duration, easing) {
    return this.speedDuration > 0
      && value    === this.targetSpeed
      && (duration || 0) === this.speedDuration
      && (easing  || 'linear') === this.speedEasing;
  }
}

export default Background;
