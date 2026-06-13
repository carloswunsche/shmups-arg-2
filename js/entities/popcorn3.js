import Enemy from './enemy.js';
import { Mover } from '../movers.js';
import { Oscillator, hzToRadians } from '../oscillators.js';

class Popcorn3 extends Enemy {
  constructor() {
    super();
    this.gfxName = 'enemy-popcorn3';
    this.death = 'bomb';
    this.setupHitbox(3, 3, 0, 0);
  }

  init(params, vw, vh) {
    super.init(params, vw, vh);
    this.hp = 10;
    this.y = -this.height;
    this.x = params.x ?? vw / 2;
    this.setupNextMover = true;

    this.yEntry = new Mover(this, {
      from: { x: this.x, y: -this.height },
      to:   { x: this.x, y: 25 },
      easing: 'ease-out',
      speed: .65,
      onlyAxis: 'y',
    });

    this.xOsc = new Oscillator({
      axis: 'x',
      amplitude: 0.5,
      frequency: hzToRadians(2),
      rampTics: 50,
    });
    this.xOsc.attach(this, this.x);
  }

  updatePos(vw, vh, input, player) {
    this.xOsc.update();
    if (!this.yEntry.done) {this.yEntry.update(); return}
    if (this.setupNextMover) {
      this.yExit = new Mover(this, {
        from: { x: this.x, y: this.y },
        to:   { x: this.x, y: vh+this.height*2 },
        easing: 'ease-in',
        speed: .7,
        onlyAxis: 'y',
      });
      this.setupNextMover = null;
    }
    this.yExit.update();
  }
}

export default Popcorn3;
