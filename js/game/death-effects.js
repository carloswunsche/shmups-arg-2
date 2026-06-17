import { spawnExplosion, spawnBang } from "./particle-factory.js";

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
    const cfg = enemy.deathDef.flash.damageFlash;
    if (cfg) enemy.addEffect('flash', cfg);
  });

  events.on('entity.dying.start', (entity) => {
    const def = entity.deathDef;
    if (def.bursts.startBurstCount > 0) {
      const { x, y } = offsetAround(entity, def.bursts.burstSpread);
      entityManager.spawn(spawnExplosion(x, y, def.bursts.startBurstCount), vw, vh);
    }
    if (def.flash.dyingFlash) entity.addEffect('flash', def.flash.dyingFlash);
  });

  events.on('entity.dying.explosion', (entity) => {
    const def = entity.deathDef;
    if (def.bursts.intervalBurstCount > 0) {
      const { x, y } = offsetAround(entity, def.bursts.burstSpread);
      entityManager.spawn(spawnExplosion(x, y, def.bursts.intervalBurstCount), vw, vh);
    }
  });

  events.on('entity.killed', (entity) => {
    const def = entity.deathDef;
    if (!def || def.bang.bangSizeMultiplier <= 0) return;
    const sz = entity.width || 8;
    const b = def.bang;
    const opts = {
      opacityDecay: b.emberOpacityDecay,
      scaleMin: b.emberScaleMin,
      scaleMax: b.emberScaleMax,
      speedMin: b.emberSpeedMin,
      speedMax: b.emberSpeedMax,
    };
    if (b.emberPalette) opts.palette = b.emberPalette;
    if (b.flashCycle) opts.flashCycle = b.flashCycle;
    entityManager.spawn(spawnBang(entity.x, entity.y, sz * b.bangSizeMultiplier, b.emberCount, opts), vw, vh);
    if (def.killSpawns) {
      for (const ks of def.killSpawns) {
        const spawned = [];
        for (let i = 0; i < ks.count; i++) {
          spawned.push([ks.class, { x: entity.x, y: entity.y, angle: ks.angleStep * i, speed: ks.speed }]);
        }
        entityManager.spawn(spawned, vw, vh);
      }
    }
  });
}