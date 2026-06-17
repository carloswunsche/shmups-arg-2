class HudEntity {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.width = 160;
    this.height = 10;
    this.color = '#fff';
    this.fontSize = 14;
    this.font = '"PICO-8", monospace';
    this.align = 'left';
    this.vAlign = 'top';
    this.opacity = 100;
    this.scale = 1;
    this.text = '';
    this.renderLayer = 'hud';
    this.waits = {};
  }

  init(params, vw, vh) {
    this.opacity = 100;
    this.scale = 1;
    this.waits = {};
  }

  update() {
    this.updateWaits();
    this._refreshText();
    this._advanceAnimation();
    return [];
  }

  updateWaits() {
    for (const key in this.waits) {
      if (typeof this.waits[key] === 'number' && this.waits[key] > 0) {
        this.waits[key]--;
      }
    }
  }

  _refreshText() {return}

  _advanceAnimation() {return}

  onAttach(events) {this._subscribe(events)}

  _subscribe(events) {}

  _easeOut(t) {return 1 - (1 - t) * (1 - t)}
}

export default HudEntity;