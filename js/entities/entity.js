import { getDeath } from '../game/deaths.js';

class Entity {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.rotation = 0;
    this.direction = 1;
    this.scale = 1;
    this.opacity = 100;
    this.speed = 1;
    this.hp = 1;
    this.hitbox = new Array(4).fill(0);
    this.waits = {};
    this.effects = [];
    this.gfxName = '';
    this.death = 'silent';
    this.shadowOffsetX = 4;
    this.shadowOffsetY = 6;
    this.shadowAlpha = 0.2;
    this.shadowScale = 0.5;
    this.xMargin = 0;
    this.yMargin = 0;
    this.xOffset = 0;
    this.yOffset = 0;
    this.momentumVx = 0;
    this.momentumVy = 0;
    this.driftVx = undefined;
    this._subscribed = false;
    this.listenedTo = null;
    this.animations = null;
    this.currentAnimation = 'default';
    this.currentFrame = 0;
    this.frameTimer = 0;
    this.reverseDirection = 1;
    this.animationLoops = true;
    this.animationLoopPoint = 0;
    this.animationLoopsInReverse = false;
  }

  init(params, vw, vh) {
    this.hp = 1;
    this.opacity = 100;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.rotation = 0;
    this.waits = {};
    this.escaped = false;
    this.dying = false;
    this.deathTimer = 0;
    this.deathDef = getDeath(this.death);
    this.momentumVx = 0;
    this.momentumVy = 0;
    this.driftVx = undefined;
    this.effects.length = 0;
    this.listenedTo = null;
    this.currentAnimation = 'default';
    this.currentFrame = 0;
    this.frameTimer = 0;
    this.reverseDirection = 1;
    this.updateHitbox();
  }

  // Called by the entity manager after init(). Every entity subscribes to
  // the canonical "broadcast" event by default; subclasses react by
  // checking this.listenedTo in updateShooting(). The _subscribed guard makes
  // the subscription happen exactly once per entity instance (pool reuse).
  onAttach(events) {
    if (this._subscribed) return;
    this._subscribed = true;
    events.on('broadcast', (tag) => {
      if (!this.active) return;
      this.listenedTo = tag;
    });
  }

  updatePosWithVector() {
    this.x += Math.cos(this.angle * Math.PI / 180) * this.speed;
    this.y -= Math.sin(this.angle * Math.PI / 180) * this.speed;
  }

  update(vw, vh, input, player) {
    this.updateWaits();
    this.updateEffects();

    if (this.dying) {
      this.deathTimer--;
      const dyingSpawns = this.updateDying(vw, vh) || [];
      if (this.hitbox) this.updateHitbox();
      return dyingSpawns;
    }

    const px = this.x, py = this.y;
    this.updatePos(vw, vh, input, player);
    this.momentumVx = this.x - px;
    this.momentumVy = this.y - py;
    if (this.hitbox) this.updateHitbox();
    this.escapeWhenOutOfBounds(vw, vh);
    this.advanceAnimation(input);
    return [
      ...(this.updateEtc?.(vw, vh, input, player) || []),
      ...(this.updateShooting?.(vw, vh, input, player) || []),
    ];
  }

  // General per-tic hook for non-shooting behaviors (e.g. particle fade).
  // Subclasses override without needing to call super.
  updateEtc(vw, vh, input, player) {
    return [];
  }

  setAnimation(name, startFrame = 0) {
    this.currentAnimation = name;
    this.currentFrame = startFrame;
    this.frameTimer = 0;
    this.reverseDirection = 1;
  }

  advanceAnimation(input) {
    if (!this.animations) return;
    const anim = this.animations[this.currentAnimation];
    if (!anim || anim.length <= 1) return;
    this.frameTimer++;
    const frame = anim[this.currentFrame];
    if (this.frameTimer < frame.duration) return;
    this.frameTimer = 0;

    const last = anim.length - 1;
    if (this.animationLoopsInReverse) {
      const next = this.currentFrame + this.reverseDirection;
      if (next > last) {
        this.reverseDirection = -1;
        this.currentFrame = last - 1;
      } else if (next < 0) {
        this.reverseDirection = 1;
        this.currentFrame = 1;
      } else {
        this.currentFrame = next;
      }
    } else if (this.animationLoops) {
      this.currentFrame++;
      if (this.currentFrame > last) {
        this.currentFrame = this.animationLoopPoint;
      }
    } else if (this.currentFrame < last) {
      this.currentFrame++;
    } else {
      this.onAnimationFinished?.(input);
    }
  }

  // True when this animation has played through to its final frame and
  // the last frame's duration has elapsed. Lets callers switch to a
  // follow-up animation (e.g. 'shooting' → 'default') after the
  // one-shot completes.
  animationFinished() {
    if (!this.animations) return true;
    const anim = this.animations[this.currentAnimation];
    if (!anim) return true;
    const last = anim.length - 1;
    if (this.currentFrame !== last) return false;
    return this.frameTimer >= anim[last].duration - 1;
  }

  updateDying(vw, vh) {
    const def = this.deathDef;
    this.momentumVx *= def.momentumDecay;
    this.momentumVy *= def.momentumDecay;
    this.x += this.momentumVx;
    this.y += this.momentumVy;
    if (def.drift) {
      if (this.driftVx === undefined) {
        const dir = this.momentumVx >= 0 ? 1 : -1;
        this.driftVx = dir * (def.driftVxRange[0] + Math.random() * (def.driftVxRange[1] - def.driftVxRange[0]));
      }
      this.x += this.driftVx;
      this.y += def.driftVy;
      this.driftVx *= 0.995;
    }
    if (def.shrinkFade && def.duration > 0) {
      const t = Math.max(0, this.deathTimer / def.duration);
      this.scale = t;
      this.opacity = t * 100;
    }
  }

  // Waits are free-form: the entity declares whatever named wait slots it
  // needs (this.waits.shootCooldown, this.waits.dashTimer, etc.) and
  // this decrements every positive numeric value each tic. Zero and
  // missing slots are no-ops, so unused slots cost nothing.
  updateWaits() {
    for (const key in this.waits) {
      if (typeof this.waits[key] === 'number' && this.waits[key] > 0) {
        this.waits[key]--;
      }
    }
  }

  // Add or refresh an effect of the given type in place. Pass a `key` to
  // stack multiple effects of the same type without them overwriting
  // each other.
  addEffect(type, opts = {}, key = type) {
    const effect = {
      type,
      key,
      timer: opts.duration || 1,
      duration: opts.duration || 1,
      intensity: opts.intensity ?? 1,
      color: opts.color || '#f00',
      ease: opts.ease || null,
      buildUp: opts.buildUp || false,
    };
    for (let i = 0; i < this.effects.length; i++) {
      if (this.effects[i].key === key) {
        this.effects[i] = effect;
        return;
      }
    }
    this.effects.push(effect);
  }

  updateEffects() {
    let write = 0;
    for (let read = 0; read < this.effects.length; read++) {
      const e = this.effects[read];
      e.timer--;
      if (e.timer > 0) {
        if (read !== write) this.effects[write] = e;
        write++;
      }
    }
    this.effects.length = write;
  }

  setupHitbox(xMargin, yMargin, xOffset = 0, yOffset = 0) {
    this.xMargin = xMargin;
    this.yMargin = yMargin;
    this.xOffset = xOffset;
    this.yOffset = yOffset;
  }

  updateHitbox() {
    if (!this.hitbox) return;
    this.hitbox[0] = this.x - this.xMargin + this.xOffset; // x1 (left)
    this.hitbox[1] = this.x + this.xMargin + this.xOffset; // x2 (right)
    this.hitbox[2] = this.y - this.yMargin + this.yOffset; // y1 (up)
    this.hitbox[3] = this.y + this.yMargin + this.yOffset; // y2 (down)
  }

  // The entity has left the play area without being destroyed — it's just
  // leaving the field. We flag it escaped and let cleanup() despawn it on
  // the next tick without firing entity.killed (no score, no death
  // effects, no kill credit).
  escapeWhenOutOfBounds(vw, vh) {
    if (this.y >= vh + this.height * 1.5) {this.escaped = true; return}
    if (this.x >= vw + this.width * 1.5) {this.escaped = true; return}
    if (this.x <= -this.width * 1.5) {this.escaped = true; return}
    if (this.y <= -this.height * 1.5) {this.escaped = true; return}
  }
}

export default Entity;
