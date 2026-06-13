import Enemy from './enemy.js';
import { Mover } from '../movers.js';
import { Oscillator, hzToRadians } from '../oscillators.js';

class Brick1 extends Enemy {

  constructor() {
    super();
    this.gfxName = 'enemy-popcorn4';
    this.setupHitbox(5, 4, 0, 0);
    this.speed = 1.5;
    this.death = 'brick';
  }

  init(params, vw, vh) {
    super.init(params, vw, vh);
    this.hp = 14;
    this.y = -this.height;
    this.x = params.x ?? vw / 2;
  }

  updatePos(vw, vh, input, player) {
    this.y += 0.5;
  }
}

export default Brick1;
