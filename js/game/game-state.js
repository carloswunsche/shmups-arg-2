// GameState: run-scoped game data. Owns the current score (and any future
// per-run fields: lives, difficulty, current stage, etc.). The Hud reads
// from this but doesn't own it.

class GameState {
  constructor(events) {
    this.events = events;
    this.score = 0;
    this.lives = 3;
    this.difficulty = 1; // Normal
    this._subscribe();
  }

  reset() {
    this.score = 0;
    this.lives = 3;
  }

  substractLife(amount) {
    this.lives -= amount;
  }

  addScore(amount) {
    if (amount > 0) this.score += amount;
  }

  _subscribe() {
    this.events.on('score.add', ({ amount }) => this.addScore(amount));
    this.events.on('lives.substractOne', () => this.substractLife(1));
  }
}

export default GameState;
