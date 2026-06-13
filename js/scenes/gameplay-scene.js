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
    // Block-level bgPortion cursor. We advance this when the bgPortion
    // finishes scrolling (independent of event-set advance). The scene
    // asks the background to scroll each bgPortion in order; the bg
    // tracks its own loop count.
    this._bgPortionIdx = 0;
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
    if (!stageDef || !stageDef.tilemap) return;

    this.background = new Background(stageDef.tilemap, stageDef.tilemapImage);
    this.timeline.init(stageDef.events);

    const startBlock = stageDef.testFromIdx || 0;
    this.timeline.change(startBlock, this.tic);
    if (this.timeline.currentBlock?.kind === 'wave') {
      this.timeline.startWave(this.timeline.currentBlock, this.tic);
    }
    this._bgPortionIdx = 0;
    if (this.background) {
      this.background.jumpToBgPortion(this._compositeBgPortionIndex(startBlock));
    }
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
    // Decrement the current event set's quota (1 per enemy killed or
    // escaped).
    if (entity.renderLayer === 'enemies_air') {
      this.timeline.decrementQuota(1);
    }
    if (entity.fromWave) return; // wave kills are routed via the kill handler above
    if (!entity.escaped) this.events.emit('score.add', { amount: entity.score || 0 });
  }

  // Move to the next block. Awards the wave's bonus if the current
  // block is a wave. On a wave clear, the background is told to
  // accelerated-skip through the remaining bgPortions of the current
  // block until it reaches the next block's first portion.
  _advanceToNextBlock() {
    const clearedBlockIdx = this.timeline.currentBlockIdx;
    const wasWave = this.timeline.currentBlock?.kind === 'wave';
    if (wasWave) {
      const bonus = this.timeline.computeWaveBonus(this.tic);
      if (bonus > 0) this.events.emit('score.add', { amount: bonus });
    }
    this.timeline.endWave();
    const nextIdx = clearedBlockIdx + 1;
    if (nextIdx >= this.timeline.blockData.length) return false;
    this.timeline.change(nextIdx, this.tic);
    if (this.timeline.currentBlock?.kind === 'wave') {
      this.timeline.startWave(this.timeline.currentBlock, this.tic);
    }
    this._bgPortionIdx = 0;
    if (this.background) {
      const nextCompositeIdx = this._compositeBgPortionIndex(nextIdx);
      if (wasWave) {
        const cleared = this.timeline.blockData[clearedBlockIdx] || {};
        this._bgSkipTarget = nextCompositeIdx;
        this.background.startAcceleratedSkip({
          speedMul: cleared.skipSpeedMul ?? 2,
          transition: cleared.skipTransitionTime ?? 30,
          easing: cleared.skipEasing || 'ease-in-out',
        });
      } else {
        this._bgSkipTarget = -1;
        this.background.jumpToBgPortion(nextCompositeIdx);
      }
    }
    return true;
  }

  // The asset manager concatenates all blocks' bgPortions into a single
  // composite tilemap. The scene translates a block index into the
  // composite bgPortion index by summing the bgPortions of all
  // preceding blocks.
  _compositeBgPortionIndex(blockIdx) {
    let idx = 0;
    for (let i = 0; i < blockIdx && i < this.timeline.blockData.length; i++) {
      idx += (this.timeline.blockData[i].bgPortions || []).length;
    }
    return idx;
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

    if (this.background) {
      this.background.update();
      // End the ON-CLEAR skip when the bg reaches the next block's
      // first portion.
      if (this._bgSkipTarget >= 0 && this.background.bgPortionIndex >= this._bgSkipTarget) {
        this.background.finishAcceleratedSkip();
        this._bgSkipTarget = -1;
      }
    }

    // Event-set advance: if quota hit zero, advance to the next event
    // set in the current block. If the block has no more event sets,
    // advance to the next block.
    if (this.timeline.isEventSetClear() && this.timeline.currentEventSet) {
      if (!this.timeline.advanceEventSet(this.tic)) {
        this._advanceToNextBlock();
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
    const debug = Debug.enabled ? {
      tic: this._processTic,
      blockIdx: this.timeline.currentBlockIdx,
      eventSetIdx: this.timeline.currentEventSetIdx,
      bgPortionIndex: this.background ? this.background.bgPortionIndex : -1,
      label: this.timeline.currentBlock ? (this.timeline.currentBlock.kind || '') : '',
      appearances: this.background ? this.background.passesCompleted : 0,
      bgSpeed: this.background ? this.background.scrollSpeed : 0,
      advanceOn: this.background ? this.background.isSkipping() : false,
      wave: this.timeline.wave
        ? `${this.timeline.computeWaveBonus(this._processTic)} (${this.timeline.wave.killScore} from kills)`
        : '',
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
