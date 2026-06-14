import Enemy from './enemy.js';
import { Mover } from '../game/movers.js';
import { Oscillator, hzToRadians } from '../game/oscillators.js';

class Popcorn2 extends Enemy {
  constructor() {
    super();
    this.gfxName = 'enemy-popcorn2';
    this.setupHitbox(4, 4, 0, 0);
  }

  init(params, vw, vh) {
    super.init(params, vw, vh);
    this.hp = 2;
    this._anticipationArmed = false;
    this.speed = params.speed ?? 0.8;
    if (params.mirror) {
      this.x = vw + this.width;
      this.speedX = -this.speed;
    } else {
      this.x = -this.width;
      this.speedX = this.speed;
    }
    this.osc = new Oscillator({
      axis: 'y',
      amplitude: params.amplitude ?? 5,
      frequency: 0.06,
    });
    this.osc.attach(this, params.yCenter ?? 20);
    this.osc.setPhase(params.phase ?? 0);
  }

  updatePos(vw, vh, input, player) {
    this.x += this.speedX;
    this.osc.update();
  }

  updateShooting(vw, vh, input, player) {
    if (!this.shotEnable) return;
    if (this.listenedTo !== 'shotSpread') return;
    // Arm the anticipation once per broadcast. The flag prevents the arm
    // from re-firing when the wait hits 0 (which would loop forever).
    if (!this._anticipationArmed) {
      this._anticipationArmed = true;
      this.waits.shootCharge = 5;
    }
    if (this.waits.shootCharge > 0) {
      this.shootAnticipation(this.waits.shootCharge);
      return;
    }
    this.shotEnable = false;
    this.listenedTo = null;
    this._anticipationArmed = false;
    return this.shoot(player);
  }

  // 3-bullet fan aimed at the player. Edit the offsets here to retune.
  shoot(player) {
    if (!player || player.hp <= 0) return [];
    const dx = player.x - this.x;
    const dy = this.y - player.y;
    const baseAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    return [
      { angleOffset: -2 },
      { angleOffset:  2 },
    ].map(s => ['EnemyBullet', {
      x: this.x, y: this.y+3, angle: baseAngle + s.angleOffset, speed: 1.5,
    }]);
  }
}

export default Popcorn2;
