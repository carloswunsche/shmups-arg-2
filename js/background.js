// Background: owns a sliding BUFFER of tile rows and scrolls them downward.
// The renderer is dumb — it asks the Background for the rows currently
// visible plus a sub-pixel offset, and draws only those. The Background
// knows nothing about pixels-on-screen beyond the viewport height it is
// told; the renderer knows nothing about portions, appearances, speed or
// wrapping.
//
// ── Coordinate convention ───────────────────────────────────────────────
// Rows are bottom-first. buffer[0] is the BOTTOM-most row (scrolls off the
// bottom of the screen last); buffer[last] is the TOP-most row (enters the
// viewport first as the world moves down).
//
// `scrollY` is a small pixel offset in [0, tileH): how far the bottom row
// has scrolled out below the viewport's bottom edge. When scrollY crosses
// tileH we shave one row off the bottom of the buffer and subtract tileH,
// so scrollY never grows unbounded.
//
// ── Buffer fill rule ────────────────────────────────────────────────────
// We keep enough rows buffered that the viewport is always fully covered
// with one extra screen of headroom on top. Whenever the buffer's top is
// within `viewportRows + FILL_MARGIN_ROWS` of the viewport top, we append
// the next portion (handling appearances) on top.
//
// ── Appearances (per portion) ───────────────────────────────────────────
//   N >= 1 : append this portion N times, decrementing each append; when it
//            reaches 1 the next append moves to the FOLLOWING portion.
//   -1     : endless — keep re-appending the same portion until something
//            external flips it to 1 (see requestEndPortion()).
//
// ── Block handshake ─────────────────────────────────────────────────────
// Portions are grouped by block. The Background reports, via onBlockReady,
// when a block's first portion has "started" (default: fully scrolled into
// the viewport; switch to "appended" via blockReadyOnAppend). The scene
// uses this to gate the next block's events.

const EASING = {
  'linear':      t => t,
  'ease-in':     t => t * t,
  'ease-out':    t => t * (2 - t),
  'ease-in-out': t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
};
const ease = (t, kind) => (EASING[kind] || EASING.linear)(t);

const FILL_MARGIN_ROWS = 2;

class Background {
  // bgData is the per-stage background produced by AssetManager._loadBackground:
  //   { tileW, tileH, mapWidth, tilesetImage, layerNames, blocks: [{portions:[...]}] }
  constructor(bgData, opts = {}) {
    this.tileW = bgData.tileW;
    this.tileH = bgData.tileH;
    this.mapWidth = bgData.mapWidth;
    this.tilesetImage = bgData.tilesetImage;
    this.layerNames = bgData.layerNames;
    this.blocks = bgData.blocks;

    // viewport height in pixels (rows shown) — needed for fill/visibility.
    this.viewportH = opts.viewportH ?? 120;
    this.viewportRows = Math.ceil(this.viewportH / this.tileH);

    // If true, the block-ready handshake fires the moment the block's first
    // portion is APPENDED to the buffer (rather than when it has scrolled
    // fully into view). Lets you experiment with eager block starts.
    this.blockReadyOnAppend = opts.blockReadyOnAppend ?? false;

    // Called once per block when its first portion is "ready". Receives the
    // block index. Set by the scene.
    this.onBlockReady = opts.onBlockReady || null;

    // The buffer: bottom-first list of rows.
    //   row = { layers: { [name]: number[] }, portionRef }
    this.buffer = [];
    this.scrollY = 0;          // pixel offset in [0, tileH)
    this.scrollSpeed = 0;      // pixels per tic

    // Speed transition state.
    this._speedStart = 0;
    this._speedTarget = 0;
    this._speedTimer = 0;
    this._speedDuration = 0;
    this._speedEasing = 'linear';

    // Skip state (accelerated transition between blocks).
    this._skipping = false;

    // The "cursor" describing what to append next:
    //   blockIdx        — which block we are pulling portions from
    //   portionIdx      — which portion within that block
    //   appearancesLeft — remaining appends of the current portion
    this._cursor = { blockIdx: 0, portionIdx: 0, appearancesLeft: 0 };

    // Block-ready bookkeeping.
    this._readyFiredFor = new Set();   // block indices already announced
    // Tracks, per block, the buffer row that is the first row of that
    // block's first portion, so we can detect when it scrolls into view.
    this._pendingReady = [];           // [{ blockIdx, worldRow }]
    this._worldRowTop = 0;             // world-row index of buffer[last]+1 boundary
    this._worldRowBottom = 0;          // world-row index of buffer[0]
  }

  // Begin scrolling at a given block. Resets the buffer and seeds it with
  // that block's first portion, then fills.
  start(blockIdx = 0) {
    this.buffer = [];
    this.scrollY = 0;
    this.scrollSpeed = 0;
    this._speedDuration = 0;
    this._skipping = false;
    this._startBlockIdx = blockIdx;
    this._readyFiredFor = new Set();
    this._pendingReady = [];
    this._worldRowBottom = 0;
    this._worldRowTop = 0;
    this._setCursor(blockIdx, 0);
    this._fill();
    // Block 0 (the starting block) is ready immediately: its first rows are
    // on screen from tic 0.
    this._announceReady(blockIdx);
  }

  _setCursor(blockIdx, portionIdx) {
    this._cursor.blockIdx = blockIdx;
    this._cursor.portionIdx = portionIdx;
    const portion = this._portionAt(blockIdx, portionIdx);
    this._cursor.appearancesLeft = portion ? portion.appearances : 0;
  }

  _portionAt(blockIdx, portionIdx) {
    const block = this.blocks[blockIdx];
    if (!block) return null;
    return block.portions[portionIdx] || null;
  }

  // Advance the cursor to the next portion to append. Honors appearances:
  //   - endless (-1): stays on the same portion.
  //   - >1: decrement and stay.
  //   - ==1 (or done): move to the next portion; if the block is exhausted,
  //     move to the next block's first portion.
  _advanceCursor() {
    const c = this._cursor;
    const portion = this._portionAt(c.blockIdx, c.portionIdx);
    if (!portion) return false;

    if (c.appearancesLeft < 0) {
      // Endless: keep the same portion. appearancesLeft stays -1.
      return true;
    }
    if (c.appearancesLeft > 1) {
      c.appearancesLeft--;
      return true;
    }

    // appearancesLeft === 1 (or 0): this was the last copy — move on.
    let nextBlock = c.blockIdx;
    let nextPortion = c.portionIdx + 1;
    if (!this._portionAt(nextBlock, nextPortion)) {
      nextBlock = c.blockIdx + 1;
      nextPortion = 0;
      // Skip over any blocks that have no portions.
      while (nextBlock < this.blocks.length && !this._portionAt(nextBlock, nextPortion)) {
        nextBlock++;
      }
      if (nextBlock >= this.blocks.length) return false; // no more portions
    }
    this._setCursor(nextBlock, nextPortion);
    return true;
  }

  // External: end the endless portion belonging to `blockIdx` so the buffer
  // advances to the next portion (and eventually the next block). Called by
  // the scene when that block's event-set quota clears. Turning -1 into 1
  // means "append one more time, then move on".
  //
  // We only act if the append cursor is still parked on the requested block.
  // Blocks with FINITE portions (e.g. a waveless block of appearances:1
  // portions) auto-advance the cursor onto the FOLLOWING block's endless
  // portion during prefetch; without this guard, clearing the finite block
  // would wrongly cut short the next block's endless portion.
  requestEndPortion(blockIdx) {
    if (blockIdx !== undefined && this._cursor.blockIdx !== blockIdx) return;
    if (this._cursor.appearancesLeft < 0) this._cursor.appearancesLeft = 1;
  }

  // Append one portion's worth of rows to the top of the buffer, then move
  // the cursor on. Returns false if there's nothing left to append.
  _appendNextPortion() {
    const c = this._cursor;
    const portion = this._portionAt(c.blockIdx, c.portionIdx);
    if (!portion) return false;

    // If this is the FIRST portion of a block, remember the world-row where
    // its bottom sits so we can fire the block-ready handshake.
    const isBlockFirstPortion = c.portionIdx === 0;
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

    if (isBlockFirstPortion && !this._readyFiredFor.has(c.blockIdx)) {
      if (this.blockReadyOnAppend) {
        this._announceReady(c.blockIdx);
      } else {
        // Fire when the block's first row scrolls into the viewport (i.e.
        // when worldRowBottom + viewportRows reaches appendStartWorldRow).
        this._pendingReady.push({ blockIdx: c.blockIdx, worldRow: appendStartWorldRow });
      }
    }

    this._advanceCursor();
    return true;
  }

  _announceReady(blockIdx) {
    if (this._readyFiredFor.has(blockIdx)) return;
    this._readyFiredFor.add(blockIdx);
    // The block's first portion is now the active one. End any accelerated
    // skip and apply this portion's own scroll speed. The start block
    // applies instantly; later blocks honor the portion's transition.
    this._skipping = false;
    const portion = this._firstPortionOf(blockIdx);
    if (portion) {
      const instant = blockIdx === this._startBlockIdx;
      this.setSpeed(
        portion.speed || 0,
        instant ? 0 : (portion.speedTransitionTime || 0),
        portion.speedEasing || 'linear',
      );
    }
    if (this.onBlockReady) this.onBlockReady(blockIdx);
  }

  _firstPortionOf(blockIdx) {
    const block = this.blocks[blockIdx];
    if (!block) return null;
    return block.portions[0] || null;
  }

  // Keep the buffer tall enough to cover the viewport plus headroom.
  _fill() {
    const needTopWorldRow = this._worldRowBottom + this.viewportRows + FILL_MARGIN_ROWS;
    let guard = 0;
    while (this._worldRowTop < needTopWorldRow) {
      if (!this._appendNextPortion()) break;
      if (++guard > 10000) break; // safety against misconfigured data
    }
  }

  // Shave fully-scrolled rows off the bottom of the buffer.
  _shave() {
    while (this.scrollY >= this.tileH && this.buffer.length > 0) {
      this.buffer.shift();
      this.scrollY -= this.tileH;
      this._worldRowBottom++;
    }
  }

  // Fire any pending block-ready announcements whose first row has scrolled
  // into the viewport.
  _checkPendingReady() {
    if (this._pendingReady.length === 0) return;
    const viewportTopWorldRow = this._worldRowBottom + this.viewportRows;
    let write = 0;
    for (let read = 0; read < this._pendingReady.length; read++) {
      const p = this._pendingReady[read];
      if (viewportTopWorldRow >= p.worldRow) {
        this._announceReady(p.blockIdx);
      } else {
        if (read !== write) this._pendingReady[write] = p;
        write++;
      }
    }
    this._pendingReady.length = write;
  }

  // ── Speed control ───────────────────────────────────────────────────────

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

  // ── Skip (accelerated block transition) ──────────────────────────────────

  isSkipping() { return this._skipping; }

  // Speed up the current portion's scroll so the next block arrives sooner.
  // The scene also calls requestEndPortion() to release an endless portion.
  startAcceleratedSkip({ speedMul = 2, transition = 30, easing = 'linear' } = {}) {
    this._skipping = true;
    const base = this.scrollSpeed || this._currentPortionSpeed() || 1;
    this.setSpeed(Math.abs(base) * speedMul || speedMul, transition, easing);
  }

  finishAcceleratedSkip() {
    this._skipping = false;
    const portion = this._portionAt(this._cursor.blockIdx, this._cursor.portionIdx);
    if (portion) this.setSpeed(portion.speed || 0, portion.speedTransitionTime || 0, portion.speedEasing || 'linear');
  }

  _currentPortionSpeed() {
    const portion = this._portionAt(this._cursor.blockIdx, this._cursor.portionIdx);
    return portion ? portion.speed || 0 : 0;
  }

  // ── Per-tic update ───────────────────────────────────────────────────────

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

  // ── Render data ──────────────────────────────────────────────────────────

  // Hand the renderer exactly what it needs and nothing more: the buffer
  // rows visible in the viewport, the sub-pixel scroll offset, and how to
  // draw them. Rows are returned bottom-first.
  //
  // The returned `rows` covers from the bottom of the viewport up to its
  // top. Each entry is { layers, screenRow } where screenRow 0 is the
  // BOTTOM-most visible row. The renderer places row R at:
  //   y = viewportH - (screenRow + 1) * tileH + scrollY
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

  // Returns true if the given block's ready handshake has already fired.
  isBlockReady(blockIdx) {
    return this._readyFiredFor.has(blockIdx);
  }

  // ── Debug accessors ──────────────────────────────────────────────────────

  get currentBlockIdx() { return this._cursor.blockIdx; }
  get currentPortionIdx() { return this._cursor.portionIdx; }
  get appearancesLeft() { return this._cursor.appearancesLeft; }
  get bufferRows() { return this.buffer.length; }
}

export default Background;
