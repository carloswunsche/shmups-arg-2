import HudEntity from '../hud-entity.js';

class ScoreDisplay extends HudEntity {
  constructor(gameState) {
    super();
    this.gameState = gameState;
    this.x = 2;
    this.y = 1;
    this.width = 156;
    this.height = 7;
    this.fontSize = 6;
    this.align = 'left';
    this.vAlign = 'top';
    this.color = '#fff';
  }

  _refreshText() {
    this.text = `score ${this.gameState.score}`;
  }
}

export default ScoreDisplay;