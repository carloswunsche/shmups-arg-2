// Hud: presentation layer for game data. GameState owns the truth (score);
// Hud reads it, animates toward it, and decides visual properties (flash
// on change, color, tween). HudRenderer reads only from Hud.

class Hud {
  constructor(gameState, events) {
    this.gameState = gameState;
    this.events = events;
    this.displayedScore = 0;
    this.flashTimer = 0;
    this.waveTic = null;
    this.waveBonus = null;
    this._lastScore = 0;
    this._subscribe();
  }

  update() {
    // const target = this.gameState.score;
    // if (this.displayedScore < target) {
    //   this.displayedScore = Math.min(target, this.displayedScore + 1);
    // }
    // if (this.flashTimer > 0) this.flashTimer--;

  }

  reset() {
    this.displayedScore = 0;
    this.flashTimer = 0;
    this.waveTic = null;
    this.waveBonus = null;
    this._lastScore = 0;
  }

  _onScoreChanged() {
    // if (this.gameState.score > this._lastScore) this.flashTimer = 6;
    // this._lastScore = this.gameState.score;
    this.displayedScore = this.gameState.score
  }

  _onWaveTic({ tic, bonus }) {
    this.waveTic = tic;
    this.waveBonus = bonus;
  }

  _subscribe() {
    this.events.on('wave.tic', (data) => this._onWaveTic(data));
    this.events.on('score.add', () => this._onScoreChanged());
  }
}

export default Hud;
