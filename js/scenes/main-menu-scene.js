class MainMenuScene {
  constructor(manager, viewport, input) {
    this.sceneManager = manager;
    this.viewport = viewport;
    this.input = input;
  }

  init() {
    this.tic = 0;
  }

  update() {
    this.input.commitState();
    if (this.input.state.buttonA) this.sceneManager.nextScene();
    this.tic++;
  }

  render() {
    const { ctx, width, height, scale } = this.viewport;
    const cw = width * scale;
    const ch = height * scale;

    ctx.fillStyle = 'whitesmoke';
    ctx.fillRect(0, 0, cw, ch);

    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `${8 * scale}px "PICO-8", monospace`;
    ctx.fillText('vanilla js game engine', cw / 2, (height / 2 - 20) * scale);

    if (Math.floor(this.tic / 30) % 2 === 0) {
      ctx.font = `${4 * scale}px "PICO-8", monospace`;
      ctx.fillText('press z to start', cw / 2, (height / 2 + 25) * scale);
    }
  }

  exit() {}
}

export default MainMenuScene;
