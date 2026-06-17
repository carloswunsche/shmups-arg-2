import HudEntity from '../hud-entity.js';

class PreviousBonusDisplay extends HudEntity {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.width = 160;
    this.height = 10;
    this.fontSize = 10;
    this.align = 'center';
    this.vAlign = 'top';
    this.color = '#0f0';
    this.opacity = 0;
    this.text = '';
  }

  _subscribe(events) {
    events.on('wave.cleared', ({ bonus }) => {
      if (bonus > 0) {
        this.text = `+${bonus}`;
        this._initAnimation();
      }
    });
  }

  _initAnimation(){
    this.opacity = 100;
    this.waits.anim = 60;
  }

  _advanceAnimation() {
    if (!this.waits.anim) this.opacity -= 4;
  }
}

export default PreviousBonusDisplay;