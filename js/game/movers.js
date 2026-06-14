// One-shot linear mover with easing. Drives an entity from point A to
// point B over a fixed duration, applying the chosen easing curve to
// the position along the way. `speed` is the linear-equivalent pixels
// per tic (the same value would traverse the whole distance in
// `distance / speed` tics without easing).
//
// Use this for acyclic movement (entry phases, scripted paths, exits).
// For cyclic motion around a center, use Oscillator instead.

const EASING = {
  'linear':     t => t,
  'ease-in':    t => t * t,
  'ease-out':   t => 1 - (1 - t) * (1 - t),
  'ease-in-out': t => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t),
};

class Mover {
  // `from` and `to` are {x, y} points. The mover writes to entity.x/y
  // on each update(). When the eased t reaches 1, `done` flips true
  // and update() becomes a no-op. Pass `axis: 'x' | 'y'` to restrict
  // writes to a single axis (the other axis is left untouched).
  constructor(entity, { from, to, easing = 'linear', speed, onlyAxis }) {
    this.entity = entity;
    this.from = { x: from.x, y: from.y };
    this.to = { x: to.x, y: to.y };
    this.easing = EASING[easing] || EASING.linear;
    this.onlyAxis = onlyAxis;
    if (onlyAxis === 'x' || onlyAxis === 'y') {
      this.dx = onlyAxis === 'x' ? to.x - from.x : 0;
      this.dy = onlyAxis === 'y' ? to.y - from.y : 0;
    } else {
      this.dx = to.x - from.x;
      this.dy = to.y - from.y;
    }
    this.distance = Math.hypot(this.dx, this.dy);
    this.dirX = this.distance === 0 ? 0 : this.dx / this.distance;
    this.dirY = this.distance === 0 ? 0 : this.dy / this.distance;
    this.t = 0;
    this.done = false;
    this.totalTics = this.distance / speed;
  }

  update() {
    if (this.done) return;
    this.t++;
    const u = Math.min(1, this.t / this.totalTics);
    const e = this.easing(u);
    if (this.onlyAxis !== 'y') this.entity.x = this.from.x + this.dirX * this.distance * e;
    if (this.onlyAxis !== 'x') this.entity.y = this.from.y + this.dirY * this.distance * e;
    if (u >= 1) this.done = true;
  }
}

export { Mover, EASING };
