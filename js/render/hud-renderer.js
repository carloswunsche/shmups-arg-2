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

  renderWaveTic(ctx, hud, font, scale, width){
    if (hud.waveTic === null) return;
    const time = this.ticsToTime(hud.waveTic, 2)
    ctx.fillStyle = '#fff';
    drawText(ctx, `${time}`, {
      x: 0, y: 1 * scale,
      width: width * scale,
      height: 16 * scale,
      fontSize: 8 * scale,
      font,
      align: 'center', vAlign: 'top',
    });
  }

  renderBonus(ctx, hud, font, scale, width){
    if (hud.waveBonus !== null) {
      drawText(ctx, `bonus +${hud.waveBonus}`, {
        // x: 10 * scale, y: 9 * scale,
        x: 2 * scale, y: 9 * scale,
        width: 148 * scale,
        height: 7 * scale,
        // fontSize: 6 * scale,
        fontSize: 4 * scale,
        font,
        align: 'left', vAlign: 'top',
        // debug: true,
      });
    }
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
