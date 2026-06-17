type InputState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  buttonA: boolean;
  buttonB: boolean;
};

class InputManager {
  isEnabled: boolean;
  gamepad: Gamepad | null | undefined;
  touchAxisDistance: number;
  state: InputState;
  stateLive: InputState;
  _gpState: InputState;
  _initialized: boolean;

  constructor() {
    this.isEnabled = true;
    this.gamepad = undefined;
    this.touchAxisDistance = 25;
    this.state = {
      up: false,
      down: false,
      left: false,
      right: false,
      buttonA: false,
      buttonB: false,
    };
    this.stateLive = {...this.state};
    this._gpState = {...this.state};
    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    /* ------------------------------------------------- */
    /*              KEYBOARD EVENT LISTENERS             */
    /* ------------------------------------------------- */
    window.addEventListener('keydown', e => {
      this.setStateUsingKeyboard(e.code, true);
      // Prevent scrolling when using the arrow keys
      if (e.code.includes('Arrow')) e.preventDefault();
    });

    window.addEventListener('keyup', e => {
      this.setStateUsingKeyboard(e.code, false);
    });

    /* Clear stuck keys when window loses focus */
    window.addEventListener('blur', () => {
      for (const btn of Object.keys(this.stateLive) as (keyof InputState)[]) {
        this.stateLive[btn] = false;
      }
    });

    /* ------------------------------------------------- */
    /*                TOUCH EVENT LISTENERS              */
    /* ------------------------------------------------- */
    const analog  = document.querySelector('[data-analog]');
    const buttonA = document.querySelector('[data-buttonA]');
    const buttonB = document.querySelector('[data-buttonB]');

    if (analog) {
      analog.addEventListener('touchstart', event => this.setStateUsingAnalogTouch(event as TouchEvent));
      analog.addEventListener('touchmove',  event => {
          this.setStateUsingAnalogTouch(event as TouchEvent);
          event.preventDefault(); // Prevent touch scrolling on mobile
        }, {passive: false} // Also required to prevent scrolling
      );
      analog.addEventListener('touchend',    () => this.setStateUsingAnalogTouch(null, true));
      analog.addEventListener('touchcancel', () => this.setStateUsingAnalogTouch(null, true));
    }

    if (buttonA) {
      buttonA.addEventListener('touchstart',  () => { this.stateLive.buttonA = true; });
      buttonA.addEventListener('touchend',    () => { this.stateLive.buttonA = false; });
      buttonA.addEventListener('touchcancel', () => { this.stateLive.buttonA = false; });
    }

    if (buttonB) {
      buttonB.addEventListener('touchstart',  () => { this.stateLive.buttonB = true; });
      buttonB.addEventListener('touchend',    () => { this.stateLive.buttonB = false; });
      buttonB.addEventListener('touchcancel', () => { this.stateLive.buttonB = false; });
    }
  }

  setStateUsingKeyboard(keyCode: string, isPressed: boolean) {
    switch (keyCode) {
      case 'ArrowUp':    this.stateLive.up      = isPressed; break;
      case 'ArrowRight': this.stateLive.right   = isPressed; break;
      case 'ArrowDown':  this.stateLive.down    = isPressed; break;
      case 'ArrowLeft':  this.stateLive.left    = isPressed; break;
      case 'KeyZ':       this.stateLive.buttonA = isPressed; break;
      case 'KeyX':       this.stateLive.buttonB = isPressed; break;
    }
  }

  setStateFromGamepad() {
    this.gamepad = navigator.getGamepads()[0];
    if (!this.gamepad) {
      for (const btn of Object.keys(this._gpState) as (keyof InputState)[]) {
        this._gpState[btn] = false;
      }
      return;
    }
    this._gpState.up      = this.gamepad.buttons[12].pressed;
    this._gpState.right   = this.gamepad.buttons[15].pressed;
    this._gpState.down    = this.gamepad.buttons[13].pressed;
    this._gpState.left    = this.gamepad.buttons[14].pressed;
    this._gpState.buttonA = this.gamepad.buttons[0].pressed;
    this._gpState.buttonB = this.gamepad.buttons[1].pressed;
  }

  setStateUsingAnalogTouch(event: TouchEvent | null, fingerWasRemoved?: boolean) {
    if (fingerWasRemoved) {
      this.stateLive.up    = false;
      this.stateLive.down  = false;
      this.stateLive.left  = false;
      this.stateLive.right = false;
      return;
    }

    const touch = event!.targetTouches[0];
    const rect  = (touch.target as Element).getBoundingClientRect();
    const axisX = touch.clientX - rect.left - rect.width  / 2;
    const axisY = touch.clientY - rect.top  - rect.height / 2;
    const d = this.touchAxisDistance;

    this.stateLive.left  = axisX <= -d;
    this.stateLive.right = axisX >=  d;
    this.stateLive.up    = axisY <= -d;
    this.stateLive.down  = axisY >=  d;
  }

  commitState() {
    if (!this.isEnabled) {
      for (const btn of Object.keys(this.state) as (keyof InputState)[]) {
        this.state[btn] = false;
      }
      return;
    }
    this.setStateFromGamepad();
    for (const btn of Object.keys(this.state) as (keyof InputState)[]) {
      this.state[btn] = this.stateLive[btn] || this._gpState[btn];
    }
  }
}

export default InputManager;
