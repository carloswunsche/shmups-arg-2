import Enemy from './enemy.js';
import { Mover } from '../game/movers.js';
import { Oscillator, hzToRadians } from '../game/oscillators.js';

class Popcorn4 extends Enemy {
  constructor() {
    super();
    this.gfxName = 'enemy-popcorn4';
    this.setupHitbox(5, 4, 0, 0);
    this.death = 'brick';
  }

  init(params, vw, vh) {
    super.init(params, vw, vh);
    this.speed = 1.5;
    this.hp = 1;
    this.y = -this.height;
    this.x = params.x ?? vw / 8;
    // Spiral in tics (calibrated by eye for the current sprites). The final
    // "up" leg persists — the popcorn keeps moving up and escapes via
    // escapeWhenOutOfBounds().
    this.moves = [
      { dir: 'down',  tics: 80 },
      { dir: 'right', tics: 80 },
      { dir: 'up',    tics: 65 },
      { dir: 'left',  tics: 65 },
      { dir: 'down',  tics: 52 },
      { dir: 'right', tics: 50 },
      { dir: 'up',    tics: 0, persist: true },
    ];
    this.moveIndex = 0;
    this.waits.spawnDelay = params.wait;
    this.waits.currentMove = 0;
    this._oneTimeFlag = true;
  }

  updatePos(vw, vh, input, player) {
    if (this.waits.spawnDelay > 0) return;
    if (this._oneTimeFlag) {
      this._oneTimeFlag = false;
      this.waits.currentMove = this.moves[0].tics;
    }
    const move = this.moves[this.moveIndex];
    if (!move) return;
    this._applyDir(move.dir);
    if (move.persist) return;
    if (!this.waits.currentMove) {
      this.moveIndex++;
      const next = this.moves[this.moveIndex];
      this.waits.currentMove = next ? next.tics : 0;
    }
  }

  _applyDir(dir) {
    if (dir === 'down')  this.y += this.speed;
    if (dir === 'right') this.x += this.speed;
    if (dir === 'up')    this.y -= this.speed;
    if (dir === 'left')  this.x -= this.speed;
  }
}

export default Popcorn4;
