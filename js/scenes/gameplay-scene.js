import EntityManager from "../entity-manager.js";
import BlockRunner from "../timeline.js";
import EventBus from "../event-bus.js";
import Background from "../background.js";
import Debug from "../debug.js";
import Hud from "../hud.js";
import HudRenderer from "../hud-renderer.js";
import GameState from "../game-state.js";
import Player from "../entities/player.js";
import PlayerBullet from "../entities/player-bullet.js";
import Particle from "../entities/particle.js";
import Popcorn1 from "../entities/popcorn1.js";
import Popcorn2 from "../entities/popcorn2.js";
import Popcorn3 from "../entities/popcorn3.js";
import Popcorn4 from "../entities/popcorn4.js";
import Midboss1 from "../entities/midboss1.js";
import Brick1 from "../entities/brick1.js";
import EnemyBullet from "../entities/enemy-bullet.js";
import { setupDeathEffects } from "../death-effects.js";


class GameplayScene {
  constructor(manager, renderer, input, assets, stageId) {
    this.sceneManager = manager;
    this.renderer = renderer;
    this.assets = assets;
    this.input = input;
    this.stageId = stageId || 'stage1';
    this.events = new EventBus();
    this.entityManager = new EntityManager();
    this.entityManager.events = this.events;
    this.timeline = new BlockRunner();
    this.timeline.events = this.events;
    this.gameState = new GameState(this.events);
    this.hud = new Hud(this.gameState, this.events);
    this.hudRenderer = new HudRenderer(this.renderer);
    this.tic = 0;
    this._processTic = 0;
    this._pendingSpawns = [];
    this._pendingActivations = new Set();

    this.backgroundEnabled = true;
  }

  init() {
    this._registerEntities();
    this.entityManager.prepare(this.assets.graphics.entities);
    this.entityManager.spawn([['Player']], this.renderer.width, this.renderer.height);

    this._setupStage();
    this._setupCollisions();
    this._setupFireCallbacks();

    setupDeathEffects(this.events, this.entityManager, this.renderer.width, this.renderer.height);
    this.events.on('entity.killed', (entity) => this._onEntityKilled(entity));
    this.events.on('entity.escaped', (entity) => this._onEntityEscaped(entity));
  }

  _registerEntities() {
    this.entityManager.register(Player, 1, 'players');
    this.entityManager.register(PlayerBullet, 26, 'player_bullets');
    this.entityManager.register(Particle, 500, 'particles');
    this.entityManager.register(Popcorn1, 10, 'enemies_air');
    this.entityManager.register(Popcorn2, 15, 'enemies_air');
    this.entityManager.register(Popcorn3, 15, 'enemies_air');
    this.entityManager.register(Popcorn4, 15, 'enemies_air');
    this.entityManager.register(Midboss1, 3, 'enemies_air');
    this.entityManager.register(Brick1, 15, 'enemies_air');
    this.entityManager.register(EnemyBullet, 50, 'enemy_bullets');
  }

  _setupStage() {
    const stageDef = this.stageId ? this.assets.stages[this.stageId] : null;
    if (!stageDef || !stageDef.events) return;

    this.timeline.init(stageDef.events);
    const startBlock = stageDef.testFromIdx || 0;

    // Start the first block immediately so tic-0 events fire.
    this._startBlock(startBlock);
    if (this.backgroundEnabled && stageDef.background) {
      this.background = new Background(stageDef.background, {
        viewportH: this.renderer.height,
        onBlockReady: (activateBlock) => this._onBlockReady(activateBlock),
      });
      // The background runs its own timeline. For a normal run it starts at
      // portion 0; when testing from a mid-stage block, start at the portion
      // that would have activated that block so the right scenery is shown
      // and we don't stall on an unreleased endless portion.
      this.background.start(this._bgStartPortionFor(startBlock, stageDef.background));
    } else {
      this.background = null;
    }
  }

  // Find the portion index whose activateBlock targets `blockIdx`; fall back
  // to 0 (the natural stage start).
  _bgStartPortionFor(blockIdx, bg) {
    if (!blockIdx || !bg || !bg.portions) return 0;
    const i = bg.portions.findIndex(p => p.activateBlock === blockIdx);
    return i >= 0 ? i : 0;
  }

  // Position the timeline at a block and (re)start its wave. A block is
  // "running" while it has a live event set; guard against starting the
  // one that is already running (defensive against duplicate activations).
  _startBlock(blockIdx) {
    if (blockIdx === this.timeline.currentBlockIdx && this.timeline.currentEventSet) return;
    this.timeline.change(blockIdx, this.tic);
    if (this.timeline.currentBlock?.kind === 'wave') {
      this.timeline.startWave(this.timeline.currentBlock, this.tic);
    }
  }

  // Background handshake: a portion whose `activateBlock` points at `blockIdx`
  // has scrolled into view. Only `preventFromStart` blocks care about this.
  //
  // Pacing rule (one block runs at a time):
  //   - If the scene is sitting idle AT this block (previous block cleared,
  //     this one armed but not started) -> start it now.
  //   - If the scene hasn't reached this block yet (player still fighting an
  //     earlier block) -> remember it; _onBlockCleared starts it on arrival.
  //   - If the scene is already past it -> ignore (stale signal).
  _onBlockReady(blockIdx) {
    const blockDef = this.timeline.blockData[blockIdx];
    if (!blockDef || !blockDef.preventFromStart) return;

    if (blockIdx === this.timeline.currentBlockIdx) {
      this._startBlock(blockIdx);
    } else if (blockIdx > this.timeline.currentBlockIdx) {
      this._pendingActivations.add(blockIdx);
    }
    // blockIdx < currentBlockIdx: stale, ignore.
  }

  _setupCollisions() {
    this.collisionPairs = [
      {
        groupA: 'player_bullets', groupB: 'enemies_air',
        onCollision: (playerBullet, enemy) => {
          playerBullet.hp = 0;
          enemy.hp -= playerBullet.power;
          if (enemy.fromWave) this.timeline.addWaveKillScore(playerBullet.hitScore || 0);
          else                this.events.emit('score.add', { amount: playerBullet.hitScore || 0 });
          this.events.emit('enemy.damaged', { enemy });
        }
      },
      {
        groupA: 'players', groupB: 'enemies_air',
        onCollision: (player, enemy) => {
          enemy.hp = 0;
          player.addEffect('flash', { color: '#f00', duration: 2, intensity: 0.5 });
          player.addEffect('shake', { intensity: 4, duration: 6, ease: 'out' });
        }
      },
      {
        groupA: 'enemy_bullets', groupB: 'players',
        onCollision: (enemyBullet, player) => {
          enemyBullet.hp = 0;
          player.addEffect('flash', { color: '#f00', duration: 2, intensity: 0.5 });
          player.addEffect('shake', { intensity: 4, duration: 6, ease: 'out' });
        }
      },
    ];
  }

  _setupFireCallbacks() {
    this._fireCallbacks = {
      spawn: (reqArr, eventData) => {
        const [className, rawParams] = reqArr[0];
        const count = eventData.spawnCount || 1;
        const interval = eventData.spawnInterval || 0;
        const vw = this.renderer.width;
        const vh = this.renderer.height;
        const fromWave = this.timeline.currentBlock?.kind === 'wave';

        const makeParams = (i) => {
          const out = { ...(rawParams || {}), _spawnIndex: i, _spawnCount: count, fromWave };
          for (const key in out) {
            if (Array.isArray(out[key])) {
              const arr = out[key];
              out[key] = arr[i] !== undefined ? arr[i] : arr[arr.length - 1];
            }
          }
          return out;
        };

        if (count > 1 && interval > 0) {
          this.entityManager.spawn([[className, makeParams(0)]], vw, vh);
          for (let i = 1; i < count; i++) {
            this._pendingSpawns.push({ tic: this.tic + i * interval, reqArr: [[className, makeParams(i)]] });
          }
        } else {
          for (let i = 0; i < count; i++) {
            this.entityManager.spawn([[className, makeParams(i)]], vw, vh);
          }
        }
      },
      speed: (cfg) => {
        if (this.background) this.background.setSpeed(cfg.value, cfg.transitionTime, cfg.easing);
      },
    };
  }

  _onEntityKilled(entity) {
    // A killed enemy counts against the quota and awards score.
    if (entity.renderLayer === 'enemies_air') {
      this.timeline.decrementQuota(1);
    }
    if (entity.fromWave) return; // wave kills are routed via the kill handler above
    this.events.emit('score.add', { amount: entity.score || 0 });
  }

  _onEntityEscaped(entity) {
    // An escaped enemy still counts against the quota so the set can clear,
    // but awards no score and triggers no death effects.
    if (entity.renderLayer === 'enemies_air') {
      this.timeline.decrementQuota(1);
    }
  }

  // The current block has been cleared (its last event set quota hit 0).
  //   1. Award the wave bonus (wave blocks only).
  //   2. If the block has `releasesPortionOf`, flip that block's looping (-1)
  //      background portion to 1 so the background can scroll past it.
  //   3. Advance the scene position to the next block. Auto-start it unless
  //      it is `preventFromStart`, in which case it waits for a background
  //      portion's activateBlock (which may already have arrived and been
  //      parked in _pendingActivations).
  _onBlockCleared() {
    const clearedIdx = this.timeline.currentBlockIdx;
    const cleared = this.timeline.currentBlock || {};

    if (cleared.kind === 'wave') {
      const bonus = this.timeline.computeWaveBonus(this.tic);
      if (bonus > 0) this.events.emit('score.add', { amount: bonus });
    }
    this.timeline.endWave();

    if (this.background && cleared.releasesPortionOf !== undefined && cleared.releasesPortionOf >= 0) {
      this.background.releasePortion(cleared.releasesPortionOf);
    }

    const nextIdx = clearedIdx + 1;
    if (nextIdx >= this.timeline.blockData.length) {
      // Stage's last block cleared. Go idle; the background keeps scrolling.
      this.timeline.currentEventSet = null;
      this.timeline.currentEventSetIdx = -1;
      return;
    }

    const nextDef = this.timeline.blockData[nextIdx];

    // Move the scene position to the next block but stay idle (no live event
    // set) so the update loop won't try to advance again until it actually
    // starts. This lets _onBlockReady recognise "we are sitting at nextIdx".
    this.timeline.currentBlockIdx = nextIdx;
    this.timeline.currentBlock = nextDef;
    this.timeline.currentEventSet = null;
    this.timeline.currentEventSetIdx = -1;

    if (!nextDef.preventFromStart) {
      this._startBlock(nextIdx);
    } else if (this._pendingActivations.delete(nextIdx)) {
      // A portion already announced this block while we were busy — start now.
      this._startBlock(nextIdx);
    }
    // else: armed and idle, waiting for the portion's activateBlock.
  }

  update() {
    const { renderer, input, entityManager } = this;
    this._processTic = this.tic;

    input.commitState();

    this.timeline.fire(this.tic, this._fireCallbacks);
    this.hud.update();

    // Drain pending spawns in place
    let write = 0;
    for (let read = 0; read < this._pendingSpawns.length; read++) {
      const ps = this._pendingSpawns[read];
      if (this.tic >= ps.tic) {
        entityManager.spawn(ps.reqArr, renderer.width, renderer.height, ps.overrides);
      } else {
        if (read !== write) this._pendingSpawns[write] = ps;
        write++;
      }
    }
    this._pendingSpawns.length = write;

    const spawns = entityManager.update(renderer.width, renderer.height, input.state, entityManager.getPlayer());
    if (spawns.length > 0) entityManager.spawn(spawns, renderer.width, renderer.height);

    Debug.tickTrails(entityManager.activeEntities);

    this.checkCollisions(entityManager.activeEntities, renderer.width, renderer.height);

    const dead = entityManager.cleanup(this.events);
    if (dead.length > 0) entityManager.despawn(dead);

    if (this.background) this.background.update();

    // Event-set / block advance.
    if (this.timeline.isEventSetClear()
        && this.timeline.currentEventSet) {
      if (!this.timeline.advanceEventSet(this.tic)) {
        this._onBlockCleared();
      }
    }

    if (this.timeline.wave) {
      this.events.emit('wave.tic', {
        tic: this.tic - (this.timeline.wave.startTic || 0),
        bonus: this.timeline.computeWaveBonus(this.tic),
      });
    }

    this.tic++;
  }

  checkCollisions(entities, vw, vh) {
    this.collisionPairs.forEach(({ groupA, groupB, onCollision }) => {
      const listA = entities.get(groupA);
      const listB = entities.get(groupB);
      if (!listA || !listB || !listA.length || !listB.length) return;
      for (let i = 0; i < listA.length; i++) {
        const a = listA[i];
        if (a.hp <= 0 || a.dying) continue;
        const ah = a.hitbox;
        if (ah[1] < 0 || ah[0] > vw || ah[3] < 0 || ah[2] > vh) continue;
        for (let j = 0; j < listB.length; j++) {
          const b = listB[j];
          if (b.hp <= 0 || b.dying) continue;
          const bh = b.hitbox;
          if (bh[1] < 0 || bh[0] > vw || bh[3] < 0 || bh[2] > vh) continue;
          if (bh[0] < ah[1] && ah[0] < bh[1] && bh[2] < ah[3] && ah[2] < bh[3]) {
            onCollision(a, b);
            break;
          }
        }
      }
    });
  }

  render() {
    const bg = this.background;
    const debug = Debug.enabled ? {
      setIndex: this.timeline.currentEventSetIdx,
      label: this.timeline.currentBlock ? (this.timeline.currentBlock.kind || '') : '',
      elapsedTic: this._processTic - (this.timeline.currentEventSetStartTic || 0),
      appearances: bg ? bg.appearancesLeft : 0,
      bgSpeed: bg ? bg.scrollSpeed : 0,
      quota: this.timeline.currentEventSet ? this.timeline.currentEventSet.quota : 0,
      blockIdx: this.timeline.currentBlockIdx,
      portionIdx: bg ? bg.currentPortionIdx : -1,
      bufferRows: bg ? bg.bufferRows : 0,
    } : null;

    this.renderer.render({
      background: this.background,
      entities: this.entityManager.activeEntities,
      graphics: this.assets.graphics.entities,
      hud: this.hud,
      hudRenderer: this.hudRenderer,
      debug,
    });
  }

  exit() {
    this.events = null;
    this.entityManager = null;
    this.timeline = null;
    this.background = null;
  }
}

export default GameplayScene;
