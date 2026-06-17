import Entity from './entity.js';

class Particle extends Entity {
  constructor() {
    super();
    this.isParticle = true;
    this.scale = 3;
    this.hitbox = null;
    this.vx = 0;
    this.vy = 0;
    this.drag = 0.97;
    this.opacityDecay = 10;
  }

  init(params, vw, vh) {
    super.init(params, vw, vh);
    this.vx = 0;
    this.vy = 0;
    this.drag = 0.97;
    this.opacityDecay = 10;
    this.colorCycle = null;
  }

  updatePos(vw, vh, input, player) {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= this.drag;
    this.vy *= this.drag;
  }

  updateEtc(vw, vh, input, player) {
    this.opacity -= this.opacityDecay;
    if (this.colorCycle && this.colorCycle.length > 0) {
      const progress = 1 - Math.max(0, this.opacity) / 100;
      const idx = Math.min(Math.floor(progress * this.colorCycle.length), this.colorCycle.length - 1);
      this.color = this.colorCycle[idx];
    }
    if (this.opacity <= 0) this.hp = 0;
  }
}

export default Particle;