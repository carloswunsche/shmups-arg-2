import Enemy from './enemy.js';
import { Mover } from '../movers.js';
import { Oscillator, hzToRadians } from '../oscillators.js';

class Popcorn1 extends Enemy {
  constructor() {
    super();
    this.gfxName = 'enemy-popcorn1';
    this.setupHitbox(5, 4, 0, 0);
  }

  init(params, vw, vh) {
    super.init(params, vw, vh);
    this.hp = 3;
    this.x = vw / 2;
    this.y = -this.height;
    this.waits.shootDelay = 35;
    this.shotType = params.shotType ?? 'spreadAtPlayer';
    this.nextShotEnable = params.nextShotEnable ?? false;
    this.nextShotFlag = false;
  }

  updatePos(vw, vh, input, player) {
    if (this.waits.toStart > 0) return;
    this.y += this.speed;
  }

  updateShooting(vw, vh, input, player) {
    // Next shot switches
    if (this.nextShotFlag) {
      this.nextShotEnable = false;
      this.nextShotFlag = false;
      this.waits.shootDelay = 150;
      this.shotType = 'singleDown'
    }

    // Guard clauses
    if (!this.shotEnable) return;
    if (!player || player.hp <= 0) return;

    // Waits and anticipating shot
    if (this.waits.shootDelay > 0) {
      this.shootAnticipation(this.waits.shootDelay);
      return;
    }

    // Disable shot on next tic
    if (!this.nextShotEnable) this.shotEnable = false;
    if (this.nextShotEnable) this.nextShotFlag = true;

    switch(this.shotType) {
      case 'spreadAtPlayer': return this.shootSpreadAtPlayer(player, vh);
      case 'spreadDown':     return this.shootSpreadDown(player, vh);
      case 'singleDown':     return this.shootSingleDown(player, vh);
    }
  }

  shootSpreadAtPlayer(player, vh) {
    const dx = player.x - this.x;
    const dy = this.y - player.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    return [
      { angleOffset:  0 },
      { angleOffset:  2 },
      { angleOffset: -2 }
    ].map(each => ['EnemyBullet', {
      x: this.x, y: this.y+4, angle: angle + each.angleOffset,
    }]);
  }

  shootSpreadDown() {
    return [
      { angleOffset:  0 },
      { angleOffset:  2 },
      { angleOffset: -2 }
    ].map(each => ['EnemyBullet', {
      x: this.x, y: this.y+4, angle: -90 + each.angleOffset, speed: 1.5
    }]);
  }

  shootSingleDown() {
    return [['EnemyBullet', {x: this.x, y: this.y+4, angle: -90, speed: 1.5}]]
  }
}

export default Popcorn1;
