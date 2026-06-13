import Debug from './debug.js';

const RENDER_LAYERS = [
  'enemies_air',
  'particles',
  'player_bullets',
  'players',
  'enemy_bullets',
];

const MAX_POOL_ERRORS = 5;

class EntityManager {
  constructor() {
    this.activeEntities = new Map(RENDER_LAYERS.map(name => [name, []]));
    this.pool = {};
    this.registry = [];
    this.events = null;
  }

  register(classRef, quantity, renderLayer) {
    this.registry.push({ classRef, quantity, renderLayer });
  }

  // Materialize the pool from the registry. Call once after all register()s.
  prepare(entityGraphics) {
    this.pool = Object.fromEntries(this.registry.map(entry => [
      entry.classRef.name,
      Array.from({ length: entry.quantity }, () => new entry.classRef()),
    ]));

    for (const entityArr of Object.values(this.pool)) {
      for (const entity of entityArr) {
        entity.active = false;
        entity.activeIndex = -1;
        for (const entry of this.registry) {
          if (entity instanceof entry.classRef) entity.renderLayer = entry.renderLayer;
        }
        const gfx = entityGraphics[entity.gfxName];
        if (gfx) {
          let maxW = 0, maxH = 0;
          for (const anim of Object.values(gfx.animations)) {
            for (const f of anim) {
              if (f.sw > maxW) maxW = f.sw;
              if (f.sh > maxH) maxH = f.sh;
            }
          }
          entity.width = maxW;
          entity.height = maxH;
          entity.animations = gfx.animations;
        }
      }
    }
  }

  getPlayer() {
    return this.pool.Player ? this.pool.Player[0] : null;
  }

  spawn(requestArr, vw, vh) {
    for (const [className, params] of requestArr) {
      const pool = this.pool[className];
      if (!pool) {
        this._recordPoolError(`unknown:${className}`);
        continue;
      }
      const entity = pool.find(e => !e.active);
      if (!entity) {
        this._recordPoolError(className);
        continue;
      }
      entity.active = true;
      entity.activeIndex = this.activeEntities.get(entity.renderLayer).push(entity) - 1;
      entity.init(params, vw, vh);
      if (params) Object.assign(entity, params);
      if (this.events) entity.onAttach(this.events);
    }
  }

  // O(1) per despawn via swap-and-pop. Active-list order is not preserved.
  despawn(requestArr) {
    for (const entity of requestArr) {
      if (!entity.active) continue;
      const arr = this.activeEntities.get(entity.renderLayer);
      const last = arr.length - 1;
      const idx = entity.activeIndex;
      if (idx !== last) {
        arr[idx] = arr[last];
        arr[idx].activeIndex = idx;
      }
      arr.pop();
      entity.active = false;
      entity.activeIndex = -1;
    }
  }

  update(vw, vh, input, player) {
    const spawns = [];
    this.activeEntities.forEach(layer => {
      for (let i = 0; i < layer.length; i++) {
        const result = layer[i].update(vw, vh, input, player);
        if (result.length > 0) spawns.push(...result);
      }
    });
    return spawns;
  }

  cleanup(events) {
    const dead = [];
    this.activeEntities.forEach(layer => {
      for (let i = 0; i < layer.length; i++) {
        const e = layer[i];
        if (e.dying) {
          if (e.deathDef.burstInterval > 0 && e.deathTimer % e.deathDef.burstInterval === 0 && events) {
            events.emit('entity.dying.explosion', e);
          }
          if (e.deathTimer <= 0) {
            e.dying = false;
            dead.push(e);
            if (events) events.emit('entity.killed', e);
          }
          continue;
        }
        if (e.escaped) {
          dead.push(e);
          continue;
        }
        if (e.hp <= 0) {
          if (e.deathDef.duration > 0) {
            e.dying = true;
            e.deathTimer = e.deathDef.duration;
            if (events) events.emit('entity.dying.start', e);
            if (e.deathDef.burstInterval && events) events.emit('entity.dying.explosion', e);
          } else {
            dead.push(e);
            if (events) events.emit('entity.killed', e);
          }
        }
      }
    });
    return dead;
  }

  _recordPoolError(className) {
    Debug.poolErrors.push(className);
    if (Debug.poolErrors.length > MAX_POOL_ERRORS) Debug.poolErrors.shift();
  }
}

export default EntityManager;
