import Entity from './entity.js';

class EnemyBullet extends Entity {
  constructor() {
    super();
    this.speed = 1.5;
    this.isParticle = false;
    this.gfxName = 'enemy-bullet1';
    this.color = '#f6f';
    this.scale = 3;
    this.width = 6;
    this.height = 6;
    this.setupHitbox(1, 1, 0, 0);
  }

  init(params, vw, vh) {
    super.init(params, vw, vh);
  }

  updatePos(vw, vh, input, player) {
    this.updatePosWithVector();
  }
}

export default EnemyBullet;
