import Enemy from './enemy.js';
import { Mover } from '../movers.js';
import { Oscillator, hzToRadians } from '../oscillators.js';

class Midboss1 extends Enemy {
  constructor() {
    super();
    this.gfxName = 'enemy-midboss1';
    this.setupHitbox(4, 4, 0, 0);
    this.death = 'midboss';
  }

  init(params, vw, vh) {
    super.init(params, vw, vh);
    this.hp = 20;
    // Read params.x here so derived state stays consistent; Object.assign
    // at end of spawn overwrites this.x.
    this.x = params?.x !== undefined ? params.x : vw / 2;
    this.y = -this.height;
    this.waits.forHorizontal = 10;
    this.horizontalOsc = false;
    this.verticalOsc = false;

    // Entry phase: a Mover handles the linear-decay-and-ease path that
    // we used to fake with the yOsc's entrySpeed/entryDecay. Clean API,
    // no oscillation-leak.
    this.entry = new Mover(this, {
      from: { x: this.x, y: -this.height },
      to:   { x: this.x, y: 22 },
      easing: 'ease-out',
      speed: 0.5
    });

    // Post-entry: a tiny vertical hover and the horizontal oscillation.
    // Both wait for `entry.done` before their first update so the Mover
    // owns y during the entry and the oscillators own it after.
    this.yOsc = new Oscillator({
      axis: 'y',
      amplitude: 2,
      frequency: 0.1,
      rampTics: 40,
      clamp: [0, vh]
    });

    this.xOsc = new Oscillator({
      axis: 'x',
      amplitude: vw * 0.3,
      frequency: 0.03,
      rampTics: 25,
      clamp: [0, vw]
    });
    this.xOsc.attach(this, this.x);
  }

  updatePos(vw, vh, input, player) {
    this.entry.update();
    if (!this.waits.forHorizontal && !this.horizontalOsc) {
      if (player && player.x < vw / 2) this.xOsc.setPhase(Math.PI);
      this.horizontalOsc = true;
    }

    if (this.entry.done && !this.verticalOsc) {
      this.yOsc.attach(this, this.y);
      this.verticalOsc = true;
      this.waits.toShoot = 5;
    }

    if (this.horizontalOsc) this.xOsc.update();
    if (this.verticalOsc) this.yOsc.update();
  }

  updateShooting(vw, vh, input, player) {
    if (!this.entry.done) return;
    if (this.waits.toShoot > 0) {
      this.shootAnticipation(this.waits.toShoot, [5,3,1]);
      return;
    }
    this.waits.toShoot = 50;
    if (!player || player.hp <= 0) return;
    return this.shoot(player);
  }

  shoot(player) {
    const dx = player.x - this.x;
    const dy = this.y - player.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    return [['EnemyBullet', { x: this.x, y: this.y + 4, angle, speed: 1}]];
  }
}

export default Midboss1;
