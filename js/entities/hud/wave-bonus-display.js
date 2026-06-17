import HudEntity from '../hud-entity.js';

class WaveBonusDisplay extends HudEntity {
  constructor() {
    super();
    this.x = 0;
    this.y = 6;
    this.width = 158;
    this.height = 5;
    this.fontSize = 4;
    this.align = 'right';
    this.vAlign = 'top';
    this.color = '#fff';
    this.opacity = 0;
    this.text = '';
  }

  _subscribe(events) {
    events.on('wave.tic', ({ bonus }) => {
      if (bonus !== null) this.text = `${bonus} bonus`; // fix this!
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

export default WaveBonusDisplay;