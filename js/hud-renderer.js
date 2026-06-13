// HudRenderer: pure drawing. Reads only from Hud. Score is rendered white
// when not flashing, yellow while flashTimer > 0. Wave tic is rendered in
// the top center, with the current wave bonus underneath it.

import { drawText } from './canvas-txt.js';

class HudRenderer {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(ctx, hud) {
    const s = this.renderer.scale;
    const w = this.renderer.width;
    const font = '"PICO-8", monospace';
    const fontSize = 8 * s;
    const height = 16 * s;

    ctx.fillStyle = hud.flashTimer > 0 ? '#fe0' : '#000';
    drawText(ctx, `${hud.displayedScore}`, {
      x: 2 * s, y: 1 * s,
      width: (w - 8) * s, height,
      fontSize, font,
      align: 'left', vAlign: 'top',
    });

    if (hud.waveTic !== null) {
      ctx.fillStyle = '#000';
      drawText(ctx, `${hud.waveTic}`, {
        x: 0, y: 1 * s,
        width: w * s, height,
        fontSize, font,
        align: 'center', vAlign: 'top',
      });
      if (hud.waveBonus !== null) {
        drawText(ctx, `${hud.waveBonus}`, {
          x: 0, y: 9 * s,
          width: w * s, height,
          fontSize, font,
          align: 'center', vAlign: 'top',
        });
      }
    }
  }
}

export default HudRenderer;
