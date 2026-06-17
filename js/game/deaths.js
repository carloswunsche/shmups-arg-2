const DEFAULTS = {
  timing: {
    duration: 0,
    burstInterval: 0,
  },
  motion: {
    momentumDecay: 0.92,
    drift: false,
    driftVxRange: [0, 0],
    driftVy: 0,
    shrinkFade: true,
  },
  flash: {
    damageFlash: { color: '#f00', duration: 3, intensity: 0.6 },
    dyingFlash: { duration: 8, intensity: 0.9, buildUp: false },
  },
  bursts: {
    startBurstCount: 0,
    intervalBurstCount: 6,
    burstSpread: 0.5,
  },
  bang: {
    bangSizeMultiplier: 1.2,
    emberCount: 24,
    emberScaleMin: 1.5,
    emberScaleMax: 2.5,
    emberOpacityDecay: 7,
    emberSpeedMin: 0.3,
    emberSpeedMax: 1.5,
    emberPalette: null,
    flashCycle: null,
  },
  killSpawns: null,
};

function merge(base, overrides) {
  if (!overrides) return { ...base };
  const out = {};
  for (const key of Object.keys(base)) {
    if (overrides[key] !== undefined && overrides[key] !== null) {
      out[key] = typeof base[key] === 'object' && base[key] !== null
        ? { ...base[key], ...overrides[key] }
        : overrides[key];
    } else {
      out[key] = base[key];
    }
  }
  return out;
}

const registry = {
  silent: {
    timing: { duration: 0, burstInterval: 0 },
    bursts: { intervalBurstCount: 0 },
    flash: { damageFlash: null },
    bang: { bangSizeMultiplier: 0 },
  },

  popcorn: {},

  bomb: {
    timing: { duration: 0 },
    bang: {
      bangSizeMultiplier: 2.5,
      emberCount: 60,
      emberScaleMin: 2.5,
      emberScaleMax: 4.0,
      emberSpeedMax: 2.5,
    },
    killSpawns: [
      { class: 'EnemyBullet', count: 16, angleStep: 22.5, speed: 1 },
    ],
  },

  brick: {
    bang: {
      emberPalette: ['#a3f', '#94f', '#c6f', '#fff'],
      flashCycle: ['#fff', '#a3f', '#94f'],
    },
  },

  midboss: {
    timing: { duration: 90, burstInterval: 20 },
    motion: { drift: true, driftVxRange: [0.06, 0.15], driftVy: 0.08, shrinkFade: false },
    flash: { dyingFlash: { duration: 90, intensity: 0.7, buildUp: true } },
    bang: {
      bangSizeMultiplier: 1.5,
      emberCount: 40,
      emberScaleMin: 2.0,
      emberScaleMax: 3.5,
      emberOpacityDecay: 4,
      emberSpeedMax: 1.8,
    },
  },
};

export function getDeath(name) {
  return merge(DEFAULTS, registry[name] || registry.popcorn);
}