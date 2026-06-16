// Hud: presentation layer for game data. GameState owns the truth (score);
// Hud reads it and animates toward it. HudRenderer reads only from Hud.

class Hud {
  constructor(gameState, events) {
    this.gameState = gameState;
    this.events = events;
    this.displayedScore = 0;
    this.waveTic = null;
    this.waveBonus = null;

    // Exit animation state
    this._bonusExit = null; // { finalBonus, progress, delay, speed }
    this._waveTicExit = null; // { finalTic, progress, delay, speed }
    this._previousBonusExit = null; // { finalBonus, progress, delay, speed }

    this.previousWaveTotalBonus = null;

    // During constructor, this one gets executed
    this._subscribeToEvents();
  }

  update() {
    this._updateBonusExitAnimation();
    this._updateWaveTicExitAnimation();
    this._updatePreviousBonusExitAnimation();
  }

  reset() { // I don't know if this one ever runs ?
    this.displayedScore = 0;
    this.waveTic = null;
    this.waveBonus = null;
    this.previousWaveTotalBonus = null;
    this._bonusExit = null;
    this._waveTicExit = null;
    this._previousBonusExit = null;
  }

  _onWaveTic({ tic, bonus }) {
    const wasPositive = this.waveBonus > 0;
    this.waveTic = tic;
    this.waveBonus = bonus;
    if (tic !== null) {
      this._waveTicExit = null;
      this._bonusExit = null;
    }
    if (bonus === 0 && wasPositive) {
      this._bonusExit = { finalBonus: 0, progress: 0, delay: 60, speed: 0.03 };
    }
  }

  _onWaveCleared({ tic, bonus }) {
    this._waveTicExit = { finalTic: tic, progress: 0, delay: 60, speed: 0.03 };
    if (bonus > 0) {
      this._bonusExit = { finalBonus: bonus, progress: 0, delay: 60, speed: 0.03 };
      this.previousWaveTotalBonus = bonus;
      this._previousBonusExit = { finalBonus: bonus, progress: 0, delay: 60, speed: 0.03 };
    }
  }

  _updateBonusExitAnimation() {
    if (!this._bonusExit) return;
    if (this._bonusExit.delay > 0) { this._bonusExit.delay--; return; }
    this._bonusExit.progress += this._bonusExit.speed;
    if (this._bonusExit.progress >= 1) {
      this._bonusExit = null;
    }
  }

  _updateWaveTicExitAnimation() {
    if (!this._waveTicExit) return;
    if (this._waveTicExit.delay > 0) { this._waveTicExit.delay--; return; }
    this._waveTicExit.progress += this._waveTicExit.speed;
    if (this._waveTicExit.progress >= 1) {
      this._waveTicExit = null;
    }
  }

  _updatePreviousBonusExitAnimation() {
    if (!this._previousBonusExit) return;
    if (this._previousBonusExit.delay > 0) { this._previousBonusExit.delay--; return; }
    this._previousBonusExit.progress += this._previousBonusExit.speed;
    if (this._previousBonusExit.progress >= 1) {
      this._previousBonusExit = null;
    }
  }

  // Renderer reads these:
  get bonusExit() { return this._bonusExit; }
  get waveTicExit() { return this._waveTicExit; }
  get previousBonusExit() { return this._previousBonusExit; }

  _subscribeToEvents() {
    this.events.on('wave.tic', (data) => this._onWaveTic(data));
    this.events.on('wave.cleared', (data) => this._onWaveCleared(data));
    this.events.on('score.add', () => { this.displayedScore = this.gameState.score; });
  }
}

export default Hud;
