import HudEntity from '../hud-entity.js';

function ticsToTime(tics) {
  const totalMs = tics * 16;
  const seconds = Math.floor(totalMs / 1000);
  const ms = totalMs % 1000;
  return `${seconds}.${String(ms).padStart(3, '0')}`;
}

class WaveTicDisplay extends HudEntity {
  constructor() {
    super();
    this.x = 0;
    this.y = 1;
    this.width = 158;
    this.height = 5;
    this.fontSize = 4;
    this.align = 'right';
    this.vAlign = 'top';
    this.color = '#fff';
    this.opacity = 0;
    this.text = 'culo'
  }

  _subscribe(events) {
    events.on('wave.tic', ({ tic }) => {
      this.text = `${ticsToTime(tic)} sec`;
      this.initAnimation();
    });
  }

  initAnimation() {
    this.opacity = 100;
    this.waits.anim = 60;
  }

  _advanceAnimation() {
    if (!this.waits.anim) this.opacity -= 4;
  }
}

export default WaveTicDisplay;