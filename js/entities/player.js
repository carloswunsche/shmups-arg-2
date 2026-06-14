import Entity from './entity.js';
import { Mover } from '../movers.js';
import { Oscillator, hzToRadians } from '../oscillators.js';

// Bullet pattern relative to player position
const SHOT_PATTERN = [
  { dx:  3, dy: -5, angle:   90 },
  { dx: -3, dy: -5, angle:   90 },
  { dx: -6, dy: -3, angle:  125 },
  { dx:  6, dy: -3, angle:   55 },
  { dx: -6, dy:  9, angle: -125 },
  { dx:  6, dy:  9, angle:  -55 },
];

class Player extends Entity {
  constructor() {
    super();
    this.speed = 1.5;
    this.gfxName = 'player-ship';
    this.setupHitbox(2, 2, 0, 0);
  }

  init(params, vw, vh) {
    super.init(params, vw, vh);
    this.x = vw / 2;
    this.y = vh * 0.8;
  }

  updatePos(vw, vh, input, player) {
    // Per-axis edge check: don't normalize the free axis when the other axis
    // is blocked against the edge in the input direction. Without this,
    // moving diagonally INTO an edge would slow the free axis (only one axis
    // actually moves but at SQRT1_2 speed).
    const xBlocked = (input.right && this.hitbox[1] >= vw)
                  || (input.left  && this.hitbox[0] <= 0);
    const yBlocked = (input.up    && this.hitbox[2] <= 0)
                  || (input.down  && this.hitbox[3] >= vh);

    const diagonalInput = (input.right || input.left) && (input.up || input.down);
    const diagonal = (diagonalInput && !xBlocked && !yBlocked) ? Math.SQRT1_2 : 1;

    if (input.right) this.x += this.speed * diagonal;
    if (input.left)  this.x -= this.speed * diagonal;
    if (input.up)    this.y -= this.speed * diagonal;
    if (input.down)  this.y += this.speed * diagonal;
  }

  updateEtc(vw, vh){
    this.fixOutOfBoundsX(vw);
    this.fixOutOfBoundsY(vh);
  }

  updateShooting(vw, vh, input, player) {
    if (input.buttonA) {
      if (this.currentAnimation === 'default') {
        this.setAnimation('shooting');
        this.animationLoops = false;
      }
      return this.shoot();
    }
  }

  // Called by Entity.advanceAnimation when a non-looping animation reaches
  // its final frame. If the player is still holding fire, replay the
  // shooting animation; otherwise return to default.
  onAnimationFinished(input) {
    if (this.currentAnimation !== 'shooting') return;
    if (input?.buttonA) this.setAnimation('shooting');
    else this.setAnimation('default');
  }

  fixOutOfBoundsX(vw) {
    if (this.hitbox[0] < 0) {
      this.x = this.xMargin;
      this.updateHitbox();
      return;
    }
    if (this.hitbox[1] >= vw) {
      this.x = vw - this.xMargin;
      this.updateHitbox();
    }
  }

  fixOutOfBoundsY(vh) {
    if (this.hitbox[3] >= vh) {
      this.y = vh - this.yMargin;
      this.updateHitbox();
      return;
    }
    if (this.hitbox[2] < 0) {
      this.y = this.yMargin;
      this.updateHitbox();
    }
  }

  shoot() {
    if (this.waits.shootCooldown > 0) return;
    this.waits.shootCooldown = 5;
    return SHOT_PATTERN.map(p => ['PlayerBullet', {
      x: this.x + p.dx,
      y: this.y + p.dy,
      angle: p.angle,
    }]);
  }
}

export default Player;
