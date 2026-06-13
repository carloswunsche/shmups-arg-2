import Particle from "./entities/particle.js";

const DEFAULT_WIDTH_FALLBACK = 12;

const offsetAround = (entity, spread) => {
  const s = (entity.width || DEFAULT_WIDTH_FALLBACK) * spread;
  return {
    x: entity.x + (Math.random() - 0.5) * s,
    y: entity.y + (Math.random() - 0.5) * s,
  };
};

export function setupDeathEffects(events, entityManager, vw, vh) {
  events.on('enemy.damaged', ({ enemy }) => {
    const cfg = enemy.deathDef.damageFlash;
    if (cfg) enemy.addEffect('flash', cfg);
  });

  events.on('entity.dying.start', (entity) => {
    const def = entity.deathDef;
    if (def.startBurstCount > 0) {
      const { x, y } = offsetAround(entity, def.burstSpread);
      entityManager.spawn(Particle.explosion(x, y, def.startBurstCount), vw, vh);
    }
    if (def.dyingFlash) entity.addEffect('flash', def.dyingFlash);
  });

  events.on('entity.dying.explosion', (entity) => {
    const def = entity.deathDef;
    if (def.intervalBurstCount > 0) {
      const { x, y } = offsetAround(entity, def.burstSpread);
      entityManager.spawn(Particle.explosion(x, y, def.intervalBurstCount), vw, vh);
    }
  });

  events.on('entity.killed', (entity) => {
    const def = entity.deathDef;
    if (!def || def.bangSizeMultiplier <= 0) return;
    const sz = entity.width || 8;
    const opts = {
      opacityDecay: def.emberOpacityDecay,
      scaleMin: def.emberScaleMin,
      scaleMax: def.emberScaleMax,
      speedMin: def.emberSpeedMin,
      speedMax: def.emberSpeedMax,
    };
    if (def.emberPalette) opts.palette = def.emberPalette;
    if (def.flashCycle) opts.flashCycle = def.flashCycle;
    entityManager.spawn(Particle.bang(entity.x, entity.y, sz * def.bangSizeMultiplier, def.emberCount, opts), vw, vh);
    if (def.onKilled) {
      entityManager.spawn(def.onKilled(entity), vw, vh);
    }
  });
}
