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

    // The "cursor" describing what to append next:
    //   blockIdx        — which block we are pulling portions from
    //   portionIdx      — which portion within that block
    //   appearancesLeft — remaining appends of the current portion
    this._cursor = { blockIdx: 0, portionIdx: 0, appearancesLeft: 0 };

    // Blocks whose endless portions should end when the cursor reaches them.
    // Set by requestEndPortion() — see that method for why.
    this._endedBlocks = new Set();

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
    this._worldRowBottom = 0;
    this._worldRowTop = 0;
    this._endedBlocks = new Set();
    this._setCursor(blockIdx, 0);
    this._fill();
  }

  _setCursor(blockIdx, portionIdx) {
    this._cursor.blockIdx = blockIdx;
    this._cursor.portionIdx = portionIdx;
    const portion = this._portionAt(blockIdx, portionIdx);
    this._cursor.appearancesLeft = portion ? portion.appearances : 0;
    if (this._cursor.appearancesLeft < 0 && this._endedBlocks.has(blockIdx)) {
      this._cursor.appearancesLeft = 1;
    }
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

  // External: end the endless portion of `blockIdx` so the buffer advances
  // past it. Called by the scene when the block's event-set quota clears.
  //
  // If the cursor is already on this block and the portion is endless, flip
  // it to 1 immediately. Otherwise, mark the block as ended — when the
  // cursor later enters this block's first portion (via _setCursor), it
  // will auto-flip. This handles two cases:
  //   - Cursor already past the block (e.g. finite portions auto-advanced):
  //     the mark is harmless (never applied) — correct, the block's portions
  //     are already done.
  //   - Cursor hasn't reached the block yet (scene cleared faster than
  //     buffer filled): the mark applies when _setCursor enters the block.
  requestEndPortion(blockIdx) {
    this._endedBlocks.add(blockIdx);
    if (this._cursor.blockIdx === blockIdx && this._cursor.appearancesLeft < 0) {
      this._cursor.appearancesLeft = 1;
    }
  }

  // Append one portion's worth of rows to the top of the buffer, then move
  // the cursor on. Returns false if there's nothing left to append.
  _appendNextPortion() {
    const c = this._cursor;
    const portion = this._portionAt(c.blockIdx, c.portionIdx);
    if (!portion) return false;

    for (let r = 0; r < portion.height; r++) {
      const layers = {};
      for (const name of this.layerNames) {
        const rows = portion.layers[name];
        layers[name] = rows ? rows[r] : null;
      }
      this.buffer.push({ layers, portionRef: portion });
    }
    this._worldRowTop += portion.height;

    this._advanceCursor();
    return true;
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

  // ── Debug accessors ──────────────────────────────────────────────────────

  get currentBlockIdx() { return this._cursor.blockIdx; }
  get currentPortionIdx() { return this._cursor.portionIdx; }
  get appearancesLeft() { return this._cursor.appearancesLeft; }
  get bufferRows() { return this.buffer.length; }
}

export default Background;
