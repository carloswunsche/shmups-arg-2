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

    // ── Testing switches ──────────────────────────────────────────────
    // gatedBlockStart: when true (default), a new block's events only start
    //   once the Background reports its first portion is on screen. When
    //   false, blocks advance immediately on quota-clear (aggressive mode /
    //   no-handshake testing).
    // backgroundEnabled: when false, no Background is created and block
    //   advancement always ignores the handshake (pure gameplay testing).
    this.gatedBlockStart = true;
    this.backgroundEnabled = true;

    // True while we've cleared a block and are waiting for the Background's
    // block-ready handshake before starting the next block's events.
    this._awaitingBlockReady = false;
    this._pendingBlockIdx = -1;
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

    if (this.backgroundEnabled && stageDef.background) {
      this.background = new Background(stageDef.background, {
        viewportH: this.renderer.height,
        blockReadyOnAppend: false,
        onBlockReady: (blockIdx) => this._onBlockReady(blockIdx),
      });
    } else {
      this.background = null;
    }

    // Start the first block immediately. The Background's start() will fire
    // onBlockReady for the start block right away, but the timeline also
    // needs to be positioned now so tic-0 events can fire even without a bg.
    this._startBlock(startBlock);
    if (this.background) this.background.start(startBlock);
  }

  // Position the timeline at a block and (re)start its wave. Called for the
  // start block and whenever a block-ready handshake (or ungated advance)
  // moves us forward.
  _startBlock(blockIdx) {
    this.timeline.change(blockIdx, this.tic);
    if (this.timeline.currentBlock?.kind === 'wave') {
      this.timeline.startWave(this.timeline.currentBlock, this.tic);
    }
    this._awaitingBlockReady = false;
    this._pendingBlockIdx = -1;
  }

  // Background handshake: the requested block's first portion is on screen.
  // The Background has already ended its skip and applied the new portion's
  // speed before invoking this; we just start the block's events.
  _onBlockReady(blockIdx) {
    if (!this.gatedBlockStart) return;        // ungated: scene already advanced
    if (!this._awaitingBlockReady) return;    // not waiting on anything
    if (blockIdx !== this._pendingBlockIdx) return;
    this._startBlock(blockIdx);
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
  // Award the wave bonus now, release the background's endless portion and
  // kick off the accelerated skip. The NEXT block's events do not start
  // here — they start when the Background reports the next block is on
  // screen (gated), unless gating is disabled.
  _onBlockCleared() {
    const clearedBlockIdx = this.timeline.currentBlockIdx;
    const cleared = this.timeline.currentBlock || {};
    const wasWave = cleared.kind === 'wave';
    if (wasWave) {
      const bonus = this.timeline.computeWaveBonus(this.tic);
      if (bonus > 0) this.events.emit('score.add', { amount: bonus });
    }
    this.timeline.endWave();

    const nextIdx = clearedBlockIdx + 1;
    if (nextIdx >= this.timeline.blockData.length) {
      // Last block cleared — let the endless portion run out but nothing
      // more to start.
      if (this.background) this.background.requestEndPortion(clearedBlockIdx);
      this._awaitingBlockReady = false;
      this._pendingBlockIdx = -1;
      return;
    }

    // Ungated (or no background): start the next block right now. The
    // background (if any) simply releases its endless portion and flows on
    // at normal speed — no accelerated skip, since we aren't waiting.
    if (!this.gatedBlockStart || !this.background) {
      if (this.background) this.background.requestEndPortion(clearedBlockIdx);
      this._startBlock(nextIdx);
      return;
    }

    // Gated: release the endless portion, skip, and wait for the handshake.
    // If the next block's handshake already fired (its portions were prefilled
    // during the cleared block's finite portions), advance immediately.
    if (this.background.isBlockReady(nextIdx)) {
      this._startBlock(nextIdx);
      this.background.finishAcceleratedSkip();
      return;
    }
    this._awaitingBlockReady = true;
    this._pendingBlockIdx = nextIdx;
    this.background.requestEndPortion(clearedBlockIdx);
    this.background.startAcceleratedSkip({
      speedMul: cleared.skipSpeedMul ?? 2,
      transition: cleared.skipTransitionTime ?? 30,
      easing: cleared.skipEasing || 'ease-in-out',
    });
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

    // Event-set / block advance. While waiting for a gated block-ready
    // handshake, we hold: no event-set advance, no re-clearing. The player,
    // bullets and particles keep simulating above; only the next block's
    // event firing is gated.
    if (!this._awaitingBlockReady
        && this.timeline.isEventSetClear()
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
      advanceOn: this._awaitingBlockReady || (bg ? bg.isSkipping() : false),
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
