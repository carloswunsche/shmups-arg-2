// HudRenderer: pure drawing. Reads only from Hud. Score is rendered white
// when not flashing, yellow while flashTimer > 0. Wave tic is rendered in
// the top center, with the current wave bonus underneath it.

import { drawText } from './canvas-txt.js';

class HudRenderer {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(ctx, hud) {
    const scale = this.renderer.scale;
    const width = this.renderer.width;
    const font = '"PICO-8", monospace';

    this.renderScore(ctx, hud, font, scale, width)
    this.renderWaveTic(ctx, hud, font, scale, width)
    if (hud.previousBonusExit) this._renderPreviousBonusExit(ctx, hud, font, scale, width)
    this.renderBonus(ctx, hud, font, scale, width)

  }

  renderScore(ctx, hud, font, scale, width) {
    ctx.fillStyle = '#fff';
    drawText(ctx, `score ${hud.displayedScore}`, {
      x: 2 * scale, y: 1 * scale,
      width: 156 * scale, 
      height: 7 * scale,
      fontSize: 6 * scale, 
      font,
      align: 'left', vAlign: 'top',
      // debug: true,
    });
  }

  renderWaveTic(ctx, hud, font, scale, width) {
    if (hud.waveTicExit) {
      console.log('[RENDER waveTic] exit animation, finalTic=', hud.waveTicExit.finalTic, 'progress=', hud.waveTicExit.progress, 'delay=', hud.waveTicExit.delay);
      this._renderWaveTicExit(ctx, hud, font, scale, width);
      return;
    }
    if (hud.waveTic === null) {
      console.log('[RENDER waveTic] waveTic=null --> returning early');
      return;
    }
    const time = this.ticsToTime(hud.waveTic, 3);
    ctx.fillStyle = '#fff';
    drawText(ctx, `${time} sec`, {
      x: 0, y: 1 * scale,
      width: width * scale,
      height: 7 * scale,
      fontSize: 4 * scale,
      font,
      align: 'right', vAlign: 'top',
      // debug: true
    });
  }

  _renderWaveTicExit(ctx, hud, font, scale, width) {
    const anim = hud.waveTicExit;
    const p = this._easeOut(anim.progress);
    const alpha = 1 - p;
    const time = this.ticsToTime(anim.finalTic, 3);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff';
    drawText(ctx, `${time} sec`, {
      x: 0, y: 1 * scale,
      width: width * scale,
      height: 7 * scale,
      fontSize: 4 * scale,
      font,
      align: 'right', vAlign: 'top',
      // debug: true
    });
    ctx.globalAlpha = 1;
  }

  _renderPreviousBonusExit(ctx, hud, font, scale, width) {
    const anim = hud.previousBonusExit;
    const p = this._easeOut(anim.progress);
    const alpha = 1 - p;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgb(0, 255, 0)';
    drawText(ctx, `+${anim.finalBonus}`, {
      x: 2 * scale, y: 0,
      width: width * scale,
      height: 10 * scale,
      fontSize: 10 * scale,
      font,
      align: 'center', vAlign: 'top',
      // debug: true
    });
    ctx.globalAlpha = 1;
  }

  renderBonus(ctx, hud, font, scale, width) {
    if (hud.bonusExit) {
      console.log('[RENDER bonusExit] drawing animation, finalBonus=', hud.bonusExit.finalBonus, 'progress=', hud.bonusExit.progress, 'delay=', hud.bonusExit.delay);
      this._renderBonusExit(ctx, hud, font, scale, width);
      return;
    }
    if (hud.waveBonus === null || hud.waveBonus <= 0) {
      console.log('[RENDER bonus] waveBonus=', hud.waveBonus, '--> returning early, no draw');
      return;
    }
    console.log('[RENDER bonus] drawing static, waveBonus=', hud.waveBonus);
    ctx.fillStyle = '#fff';
    drawText(ctx, `${hud.waveBonus} bonus`, {
      x: 0, y: 6 * scale,
      width: width * scale,
      height: 7 * scale,
      fontSize: 4 * scale,
      font,
      align: 'right', vAlign: 'top',
      // debug: true
    });
  }

  _renderBonusExit(ctx, hud, font, scale, width) {
    const anim = hud.bonusExit;
    const p = this._easeOut(anim.progress);
    const alpha = 1 - p;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff';
    drawText(ctx, `${anim.finalBonus} bonus`, {
      x: 0, y: 6 * scale,
      width: width * scale,
      height: 7 * scale,
      fontSize: 4 * scale,
      font,
      align: 'right', vAlign: 'top',
      // debug: true
    });
    ctx.globalAlpha = 1;
  }

  _easeOut(t) {
    return 1 - (1 - t) * (1 - t);
  }

  ticsToTime(tics, digits = 2, msPerTic = 16) {
    const totalMs = tics * msPerTic;
    const seconds = Math.floor(totalMs / 1000);
    const ms = totalMs % 1000;
    if (digits === 3) return `${seconds}.${String(ms).padStart(3, '0')}`;
    if (digits === 2) return `${seconds}.${String(ms).padStart(3, '0').slice(0, 2)}`;
  }
}

export default HudRenderer;
