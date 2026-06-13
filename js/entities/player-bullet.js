import Entity from './entity.js';

class PlayerBullet extends Entity {
  constructor() {
    super();
    this.gfxName = 'player-bullet';
    this.speed = 6;
    this.power = 1;
    this.hitScore = 0;
    this.setupHitbox(1, 3, 0, 0);
  }

  init(params, vw, vh) {
    super.init(params, vw, vh);
    this.rotation = 90 - params.angle; // Sprite faces "up" at angle=90, so rotation is the offset from that.
  }

  updatePos(vw, vh, input, player) {
    this.updatePosWithVector();
  }

}

export default PlayerBullet;
