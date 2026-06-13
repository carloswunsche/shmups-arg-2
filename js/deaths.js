// Death profiles. Each entity has `this.death = 'popcorn'` (etc.) and
// Entity.init looks it up via getDeath() to populate entity.deathDef.
//
// Field consumers:
//   entity-manager.cleanup: duration, burstInterval
//   entity.updateDying:     momentumDecay, drift, driftVxRange, driftVy, shrinkFade, duration
//   death-effects:          damageFlash, dyingFlash, startBurstCount,
//                           intervalBurstCount, burstSpread,
//                           bangSizeMultiplier, ember*

const DEFAULTS = {
  // --- Timing ---
  duration: 0,         // tics the dying animation lasts (0 = immediate kill)
  burstInterval: 0,    // tics between dying-burst emissions (0 = no bursts)

  // --- Physics during dying ---
  momentumDecay: 0.92, // fraction of momentum retained per tic
  drift: false,
  driftVxRange: [0, 0],
  driftVy: 0,
  shrinkFade: true,

  // --- Visual effects ---
  damageFlash: { color: '#f00', duration: 3, intensity: 0.6 },
  dyingFlash:  { duration: 8, intensity: 0.9, buildUp: false },

  // --- Particle bursts during dying ---
  startBurstCount: 0,     // particles spawned at dying.start
  intervalBurstCount: 6,  // particles spawned at each dying.explosion
  burstSpread: 0.5,       // offset multiplier (entity.width * spread)

  // --- Final "bang" on entity.killed ---
  bangSizeMultiplier: 1.2,
  emberCount: 24,
  emberScaleMin: 1.5,
  emberScaleMax: 2.5,
  emberOpacityDecay: 7,
  emberSpeedMin: 0.3,
  emberSpeedMax: 1.5,
};

const profile = (overrides) => ({ ...DEFAULTS, ...overrides });

const registry = {
  // Bullets, particles, the player: no death animation, no bang.
  silent: profile({
    bangSizeMultiplier: 0,
    intervalBurstCount: 0,
    damageFlash: null,
  }),

  popcorn: profile({}),

  bomb: profile({
    duration: 0,
    bangSizeMultiplier: 2.5,
    emberCount: 60,
    emberScaleMin: 2.5,
    emberScaleMax: 4.0,
    emberSpeedMax: 2.5,
    emberPalette: ['#0bc', '#2cb', '#4d8', '#fff'],
    flashCycle: ['#fff', '#0bc', '#09c'],
    onKilled: (entity) => {
      const count = 16;
      const ring = [];
      for (let i = 0; i < count; i++) {
        const angle = (360 / count) * i;
        ring.push(['EnemyBullet', { x: entity.x, y: entity.y, angle, speed: 1 }]);
      }
      return ring;
    },
  }),

  brick: profile({
    emberPalette: ['#a3f', '#94f', '#c6f', '#fff'],
    flashCycle: ['#fff', '#a3f', '#94f'],
  }),

  midboss: profile({
    duration: 90,
    burstInterval: 20,
    drift: true,
    driftVxRange: [0.06, 0.15],
    driftVy: 0.08,
    shrinkFade: false,
    dyingFlash: { duration: 90, intensity: 0.7, buildUp: true },
    bangSizeMultiplier: 1.5,
    emberCount: 40,
    emberScaleMin: 2.0,
    emberScaleMax: 3.5,
    emberOpacityDecay: 4,
    emberSpeedMax: 1.8,
  }),
};

export function getDeath(name) {
  if (name && !registry[name]) {
    console.warn(`[deaths] unknown death type '${name}', falling back to 'popcorn'`);
  }
  return registry[name] || registry.popcorn;
}
