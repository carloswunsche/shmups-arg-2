// Wave oscillator that drives an entity's position on one axis.
// Owns the full state machine from midboss1: optional linear entry phase with
// deceleration, then wave oscillation around a locked center, with configurable
// trigger delay so a different axis's entry can gate when oscillation starts.
//
// Use one oscillator per oscillating axis. Call osc.update() once per tic from
// the entity's updatePos(). For linear motion on a different axis, just do
// `this.x += N` next to the osc.update() call.

const easeToward = (current, target, rate) => current + (target - current) * rate;

// Wave shape functions. Each takes a phase in radians and returns a value
// in the range [-1, 1]. Plug into an Oscillator's `waveFn` to change the shape
// of the oscillation while keeping all the state-machine machinery (entry
// phase, trigger, clamping, frequency ramp) the same.
//
// Lissajous / figure-8 patterns are just two Oscillators with different
// frequencies on different axes — no special class needed.
const WAVE = {
  sin: Math.sin,
  cos: (phase) => Math.cos(phase),
  triangle: (phase) => {
    const t = (phase / (Math.PI * 2)) % 1;
    return t < 0.5 ? (t * 4 - 1) : (3 - t * 4);
  },
  saw: (phase) => {
    const t = (phase / (Math.PI * 2)) % 1;
    return t * 2 - 1;
  },
  easeIn: (phase) => {
    const t = (phase / (Math.PI * 2)) % 1;
    return t * t * 2 - 1;
  },
  easeOut: (phase) => {
    const t = (phase / (Math.PI * 2)) % 1;
    return (1 - (1 - t) * (1 - t)) * 2 - 1;
  },
  easeInOut: (phase) => {
    const t = (phase / (Math.PI * 2)) % 1;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    return eased * 2 - 1;
  },
};

// Convert Hz (cycles per second) to radians per tic, given the engine's
// tic rate. The game runs at 60 tics/second, so 1 Hz = 2π/60 radians/tic.
const hzToRadians = (hz, ticsPerSecond = 60) => hz * (Math.PI * 2) / ticsPerSecond;

class Oscillator {
  constructor(config) {
    this.axis = config.axis;
    this.amplitude = config.amplitude ?? 0;
    this.frequency = config.frequency ?? 0.03;
    this.waveFn = config.waveFn ?? WAVE.sin;
    this.entrySpeed = config.entrySpeed ?? 0;
    this.entryDecay = config.entryDecay ?? 0;
    this.entrySettled = config.entrySettled ?? 0;
    this.oscStartTrigger = config.oscStartTrigger ?? 0;
    this.rampTics = config.rampTics ?? 0;
    this.initialPhase = config.initialPhase ?? 0;
    this.center = config.center;
    this.clamp = config.clamp;

    this.entity = null;
    this.phase = this.initialPhase;
    this.currentFrequency = 0;
    this._decaying = false;

    // No entry phase: skip the entry state machine and start oscillating
    // from the first update(). If rampTics is set, start at 0 and ramp up
    // linearly to `frequency` over that many tics. Otherwise jump straight
    // to the target frequency — otherwise the wave would never move.
    if (this.entrySpeed === 0) {
      this._decaying = false;
      this.inWave = true;
      this.currentFrequency = this.rampTics > 0 ? 0 : this.frequency;
    } else {
      this._decaying = true;
      this.inWave = false;
    }
  }

  attach(entity, center) {
    this.entity = entity;
    // Priority: explicit center argument > config center > entity's current
    // position on the axis. Lets you set the origin in the constructor for
    // simple cases, or override per-spawn via attach() for randomized spawns.
    if (center !== undefined) {
      this.center = center;
    } else if (this.center === undefined) {
      this.center = entity[this.axis];
    }
  }

  setPhase(phase) {
    this.phase = phase;
  }

  update() {
    if (!this.entity) return;

    if (this._decaying) {
      this.entity[this.axis] += this.entrySpeed;
      this.entrySpeed = easeToward(this.entrySpeed, 0, this.entryDecay);
      if (this.entrySpeed < this.entrySettled) {
        this._decaying = false;
        this.center = this.entity[this.axis];
      }
    }

    // The wave can start while still in decay if a trigger is configured,
    // otherwise it starts once the decay has finished.
    if (!this.inWave && (!this._decaying || this.entrySpeed < this.oscStartTrigger)) {
      this.inWave = true;
      if (this._decaying) this.center = this.entity[this.axis];
    }

    if (this.inWave) {
      if (this.rampTics > 0) {
        const step = this.frequency / this.rampTics;
        if (this.currentFrequency < this.frequency) {
          this.currentFrequency = Math.min(this.frequency, this.currentFrequency + step);
        }
      } else {
        this.currentFrequency = this.frequency;
      }
      this.phase += this.currentFrequency;
      let value = this.center + this.waveFn(this.phase) * this.amplitude;
      if (this.clamp) {
        value = Math.max(this.clamp[0], Math.min(value, this.clamp[1]));
      }
      this.entity[this.axis] = value;
    }
  }
}

export { Oscillator, WAVE, hzToRadians };
