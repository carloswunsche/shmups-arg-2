import Entity from './entity.js';
import { Mover } from '../movers.js';
import { Oscillator, hzToRadians } from '../oscillators.js';

class Enemy extends Entity {
  constructor() {
    super();
    this.hp = 1;
    this.score = 10;
    this.death = 'popcorn';
    this.shotEnable = true;
    this.waits.toStart = 0;
    this.speed = 1;
  }

  init(params, vw, vh) {
    super.init(params, vw, vh);
    this.hp = params.hp ?? 1;
    this.score = params.score ?? 10;
    this.shotEnable = params.shotEnable ?? true;
    this.waits.toStart = params.waitToStart ?? 0;
    this.speed = params.speed ?? 1;
  }

  // Call each tic with the current wait value. On any tic in `flashes`,
  // adds a flash effect to the entity.
  shootAnticipation(timer, flashes = [5, 3, 1], cfg = { color: '#fff', intensity: 0.6 }) {
    if (!flashes.includes(timer)) return;
    this.addEffect('flash', {
      color: cfg.color,
      intensity: cfg.intensity,
    }, 'anticipation' + timer);
  }
}

export default Enemy;
