const HUD = {
  fontSize: 2,       // game-units (multiplied by scale at render time)
  lineHeight: 5,
  col1Offset: 48,    // panel left edge, distance from canvas right
  col2Offset: 20,    // right-column text x
  panelPadX: 2,
  panelPadY: 4,
  trailMaxAge: 240,
  trailMaxPoints: 10000,
};

const TRAIL_LAYER = 'enemies_air';

const Debug = {
  enabled: false,
  showTrails: false,
  trailPoints: [],
  poolErrors: [],

  init(engine, renderer, hooks = {}) {
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'Backquote':
          this.enabled = !this.enabled;
          if (renderer) renderer.showHitboxes = this.enabled;
          this.showTrails = this.enabled;
          this.trailPoints = [];
          break;
        case 'KeyP':
          if (engine.paused) engine.resume();
          else engine.pause();
          break;
        case 'KeyO':
          engine.pause();
          hooks.update?.();
          hooks.render?.();
          break;
        case 'KeyH':
          if (renderer) renderer.showHitboxes = !renderer.showHitboxes;
          break;
        case 'KeyT':
          this.showTrails = !this.showTrails;
          this.trailPoints = [];
          break;
        case 'KeyR':
          hooks.bootstrap?.();
          break;
      }
    });
  },

  tickTrails(entities) {
    if (!this.showTrails) return;
    const group = entities.get(TRAIL_LAYER);
    if (group) {
      for (const e of group) this.trailPoints.push({ x: e.x, y: e.y, age: 0 });
    }
    let write = 0;
    for (let read = 0; read < this.trailPoints.length; read++) {
      const p = this.trailPoints[read];
      p.age++;
      if (p.age <= HUD.trailMaxAge) {
        if (read !== write) this.trailPoints[write] = p;
        write++;
      }
    }
    this.trailPoints.length = write;
    if (this.trailPoints.length > HUD.trailMaxPoints) {
      this.trailPoints.splice(0, this.trailPoints.length - HUD.trailMaxPoints);
    }
  },

  render(ctx, d, canvasWidth, scale) {
    if (!d) return;
    ctx.save();
    ctx.font = `${HUD.fontSize * scale}px monospace`;
    ctx.textAlign = 'left';

    this._renderInfo(ctx, d, canvasWidth, scale);
    if (this.showTrails) this._renderTrails(ctx, scale);
    if (this.poolErrors.length > 0) this._renderPoolError(ctx, canvasWidth, scale);

    ctx.restore();
  },

  _renderInfo(ctx, d, canvasWidth, scale) {
    const s = scale;
    const lh = HUD.lineHeight * s;
    const col1 = canvasWidth - HUD.col1Offset * s;
    const col2 = canvasWidth - HUD.col2Offset * s;
    const baseY = HUD.panelPadY * s;

    const rows = [
      [`Block: ${d.blockIdx} / Set: ${d.setIndex}${d.label ? ' - ' + d.label : ''}`, `Appear: ${d.appearances}`],
      [`BgSpeed: ${d.bgSpeed.toFixed(2)}`, d.quota ? `Quota: ${d.quota}` : ''],
      [`Portion: ${d.portionIdx} / Buf: ${d.bufferRows}`, ''],
    ];

    const panelH = (1 + rows.length) * lh + HUD.panelPadY * s;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(col1 - HUD.panelPadX * s, 0, canvasWidth - col1 + HUD.panelPadX * s, panelH);

    const eventSetTicTxt = 'Event Set Tic: ' + d.elapsedTic;
    ctx.fillStyle = '#0f0';
    ctx.fillText(eventSetTicTxt, col1, baseY);
    if (d.advanceOn) {
      const tw = ctx.measureText(eventSetTicTxt).width;
      ctx.fillStyle = '#ff0';
      ctx.fillText('ADVANCE ON', col1 + tw + 4 * s, baseY);
    }

    rows.forEach(([left, right], i) => {
      const y = baseY + (i + 1) * lh;
      ctx.fillStyle = '#0f0';
      ctx.fillText(left, col1, y);
      if (right) ctx.fillText(right, col2, y);
    });
  },

  _renderTrails(ctx, scale) {
    for (const p of this.trailPoints) {
      const alpha = Math.max(0, 1 - p.age / HUD.trailMaxAge);
      ctx.fillStyle = `rgba(0, 255, 255, ${alpha.toFixed(3)})`;
      ctx.fillRect(p.x * scale, p.y * scale, 1, 1);
    }
  },

  _renderPoolError(ctx, canvasWidth, scale) {
    const s = scale;
    const lh = HUD.lineHeight * s;
    const col1 = canvasWidth - HUD.col1Offset * s;
    const col2 = canvasWidth - HUD.col2Offset * s;
    // Position below the info panel (4 lines: tic + 3 info rows)
    const y = HUD.panelPadY * s + 4 * lh;
    ctx.fillStyle = '#f44';
    ctx.fillText('POOL:', col1, y);
    ctx.fillText(this.poolErrors[this.poolErrors.length - 1], col2, y);
  },
};

export default Debug;
