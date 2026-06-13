// GameState: run-scoped game data. Owns the current score (and any future
// per-run fields: lives, difficulty, current stage, etc.). The Hud reads
// from this but doesn't own it.

class GameState {
  constructor(events) {
    this.events = events;
    this.score = 0;
    this._subscribe();
  }

  reset() {
    this.score = 0;
  }

  addScore(amount) {
    if (amount > 0) this.score += amount;
  }

  _subscribe() {
    this.events.on('score.add', ({ amount }) => this.addScore(amount));
  }
}

export default GameState;
