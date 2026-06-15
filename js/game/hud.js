// Hud: presentation layer for game data. GameState owns the truth (score);
// Hud reads it and animates toward it. HudRenderer reads only from Hud.

class Hud {
  constructor(gameState, events) {
    this.gameState = gameState;
    this.events = events;
    this.displayedScore = 0;
    this.waveTic = null;
    this.waveBonus = null;
    this._lastScore = 0;
    this._subscribe();
  }

  update() {

  }

  reset() {
    this.displayedScore = 0;
    this.waveTic = null;
    this.waveBonus = null;
    this._lastScore = 0;
  }

  _onScoreChanged() {
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
