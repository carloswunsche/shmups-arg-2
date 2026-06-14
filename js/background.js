const EASING = {
  'linear':      t => t,
  'ease-in':     t => t * t,
  'ease-out':    t => t * (2 - t),
  'ease-in-out': t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
};
const ease = (t, kind) => (EASING[kind] || EASING.linear)(t);

const FILL_MARGIN_ROWS = 2;

class Background {
  constructor(bgData, opts = {}) {
    this.tileW = bgData.tileW;
    this.tileH = bgData.tileH;
    this.mapWidth = bgData.mapWidth;
    this.tilesetImage = bgData.tilesetImage;
    this.layerNames = bgData.layerNames;
    this.portions = bgData.portions;

    this.viewportH = opts.viewportH ?? 120;
    this.viewportRows = Math.ceil(this.viewportH / this.tileH);

    // Called when a portion scrolls into view that has activateBlock set.
    this.onBlockReady = opts.onBlockReady || null;

    this.buffer = [];
    this.scrollY = 0;
    this.scrollSpeed = 0;

    this._speedStart = 0;
    this._speedTarget = 0;
    this._speedTimer = 0;
    this._speedDuration = 0;
    this._speedEasing = 'linear';

    this._cursor = { index: 0, appearancesLeft: 0 };

    // Portion indices whose looping (-1) portion has been released. When the
    // cursor reaches such a portion, it runs exactly once more and then
    // advancement continues.
    this._releasedPortions = new Set();

    // Portions with activateBlock that are waiting to scroll into view.
    this._pendingReady = [];              // [{ activateBlock, worldRow }]
    this._readyFiredFor = new Set();      // activateBlock values already announced
    this._worldRowTop = 0;
    this._worldRowBottom = 0;
  }

  start(portionIdx = 0) {
    this.buffer = [];
    this.scrollY = 0;
    this.scrollSpeed = 0;
    this._speedDuration = 0;
    this._worldRowBottom = 0;
    this._worldRowTop = 0;
    this._releasedPortions = new Set();
    this._pendingReady = [];
    this._readyFiredFor = new Set();
    this._setCursor(portionIdx);
    this._fill();
    this._checkPendingReady();
  }

  _setCursor(index) {
    this._cursor.index = index;
    const portion = this.portions[index] || null;
    this._cursor.appearancesLeft = portion ? portion.appearances : 0;
    if (this._cursor.appearancesLeft < 0 && this._releasedPortions.has(index)) {
      this._cursor.appearancesLeft = 1;
    }
  }

  _advanceCursor() {
    const c = this._cursor;
    const portion = this.portions[c.index];
    if (!portion) return false;

    if (c.appearancesLeft < 0) return true;
    if (c.appearancesLeft > 1) { c.appearancesLeft--; return true; }

    const next = c.index + 1;
    if (next >= this.portions.length) return false;
    this._setCursor(next);
    return true;
  }

  // Release a looping (-1 appearances) portion (by its index in the flat
  // portions array) so the background can scroll past it. If the cursor is
  // already parked on it, unlock immediately; otherwise the release is
  // recorded and applied when the cursor arrives (handles a wave clearing
  // before the portion is reached).
  releasePortion(portionIdx) {
    this._releasedPortions.add(portionIdx);
    if (this._cursor.index === portionIdx && this._cursor.appearancesLeft < 0) {
      this._cursor.appearancesLeft = 1;
    }
  }

  _appendNextPortion() {
    const c = this._cursor;
    const portion = this.portions[c.index];
    if (!portion) return false;

    // Apply portion's speed immediately
    this.setSpeed(portion.speed || 0, portion.speedTransitionTime || 0, portion.speedEasing || 'linear');

    const appendStartWorldRow = this._worldRowTop;

    for (let r = 0; r < portion.height; r++) {
      const layers = {};
      for (const name of this.layerNames) {
        const rows = portion.layers[name];
        layers[name] = rows ? rows[r] : null;
      }
      this.buffer.push({ layers, portionRef: portion });
    }
    this._worldRowTop += portion.height;

    // If this portion activates a block, queue it for when it scrolls into view
    if (portion.activateBlock !== undefined && portion.activateBlock >= 0
        && !this._readyFiredFor.has(portion.activateBlock)) {
      this._pendingReady.push({ activateBlock: portion.activateBlock, worldRow: appendStartWorldRow });
    }

    // FUTURE (ground enemies): if this portion carries an `enemy_ground` layer
    // (authored in Tiled), read enemy markers here and queue them keyed by
    // their world row, mirroring _pendingReady. As _shave advances
    // _worldRowBottom, a _checkPendingGroundSpawns() pass would emit spawn
    // requests so ground enemies appear at the background's own pace,
    // independent of the air-wave timeline. Deliberately left as a hook.

    this._advanceCursor();
    return true;
  }

  _announceReady(activateBlock) {
    if (this._readyFiredFor.has(activateBlock)) return;
    this._readyFiredFor.add(activateBlock);
    if (this.onBlockReady) this.onBlockReady(activateBlock);
  }

  _checkPendingReady() {
    if (this._pendingReady.length === 0) return;
    const viewportTopWorldRow = this._worldRowBottom + this.viewportRows;
    let write = 0;
    for (let read = 0; read < this._pendingReady.length; read++) {
      const p = this._pendingReady[read];
      if (viewportTopWorldRow >= p.worldRow) {
        this._announceReady(p.activateBlock);
      } else {
        if (read !== write) this._pendingReady[write] = p;
        write++;
      }
    }
    this._pendingReady.length = write;
  }

  _fill() {
    const needTopWorldRow = this._worldRowBottom + this.viewportRows + FILL_MARGIN_ROWS;
    let guard = 0;
    while (this._worldRowTop < needTopWorldRow) {
      if (!this._appendNextPortion()) break;
      if (++guard > 10000) break;
    }
  }

  _shave() {
    while (this.scrollY >= this.tileH && this.buffer.length > 0) {
      this.buffer.shift();
      this.scrollY -= this.tileH;
      this._worldRowBottom++;
    }
  }

  setSpeed(value, duration, easing) {
    if (this._isTransitioningTo(value, duration, easing)) return;
    this._speedStart = this.scrollSpeed;
    this._speedTarget = value;
    this._speedTimer = 0;
    this._speedDuration = duration || 0;
    this._speedEasing = easing || 'linear';
    if (this._speedDuration === 0) this.scrollSpeed = value;
  }

  _isTransitioningTo(value, duration, easing) {
    return this._speedDuration > 0
      && value === this._speedTarget
      && (duration || 0) === this._speedDuration
      && (easing || 'linear') === this._speedEasing;
  }

  update() {
    if (this._speedDuration > 0) {
      this._speedTimer++;
      const t = Math.min(this._speedTimer / this._speedDuration, 1);
      this.scrollSpeed = this._speedStart + (this._speedTarget - this._speedStart) * ease(t, this._speedEasing);
      if (t >= 1) this._speedDuration = 0;
    }

    this.scrollY += this.scrollSpeed;
    this._shave();
    this._fill();
    this._checkPendingReady();
  }

  getRenderData() {
    const visible = [];
    const count = Math.min(this.buffer.length, this.viewportRows + 1);
    for (let i = 0; i < count; i++) {
      visible.push({ layers: this.buffer[i].layers, screenRow: i });
    }
    return {
      rows: visible,
      scrollY: this.scrollY,
      tileW: this.tileW,
      tileH: this.tileH,
      mapWidth: this.mapWidth,
      viewportH: this.viewportH,
      tilesetImage: this.tilesetImage,
      layerNames: this.layerNames,
    };
  }

  get currentPortionIdx() { return this._cursor.index; }
  get appearancesLeft() { return this._cursor.appearancesLeft; }
  get bufferRows() { return this.buffer.length; }
}

export default Background;
