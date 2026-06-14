import Debug from "../core/debug.js";

const SHADOW_LAYERS = new Set(['players', 'enemies_air']);

class GameplayRenderer {
  constructor(viewport) {
    this.viewport = viewport;
    this.showHitboxes = false;
  }

  get width() { return this.viewport.width; }
  get height() { return this.viewport.height; }
  get scale() { return this.viewport.scale; }

  render({ background, entities, graphics, hud, hudRenderer, debug }) {
    const ctx = this.viewport.ctx;
    ctx.clearRect(0, 0, this.viewport.canvas.width, this.viewport.canvas.height);

    if (background) this.renderBackground(ctx, background.getRenderData());
    if (entities) this.renderEntities(entities, graphics);
    if (this.showHitboxes && entities) this.renderHitboxes(entities);
    if (hud && hudRenderer) hudRenderer.render(ctx, hud);
    if (debug) Debug.render(ctx, debug, this.viewport.canvas.width, this.scale);
  }

  // Dumb tile drawing. `data` comes straight from Background.getRenderData():
  //   { rows, scrollY, tileW, tileH, mapWidth, viewportH, tilesetImage, layerNames }
  // rows are bottom-first: row.screenRow 0 is the BOTTOM-most visible row.
  // This method knows nothing about scrolling logic, portions or wrapping —
  // it only places the rows it was handed and skips anything off-screen.
  renderBackground(ctx, data) {
    if (!data || !data.tilesetImage || data.rows.length === 0) return;
    const s = this.scale;
    const tw = data.tileW * s;
    const th = data.tileH * s;
    const tilesetCols = Math.floor(data.tilesetImage.width / data.tileW);
    const viewportPx = data.viewportH * s;
    const subY = Math.round(data.scrollY * s);

    for (const name of data.layerNames) {
      for (const row of data.rows) {
        const tileRow = row.layers[name];
        if (!tileRow) continue;
        // Bottom-most visible row sits flush against the viewport bottom,
        // shifted down by the sub-pixel scroll offset.
        const dy = viewportPx - (row.screenRow + 1) * th + subY;
        if (dy >= viewportPx || dy + th <= 0) continue; // fully off-screen
        for (let col = 0; col < data.mapWidth; col++) {
          const id = tileRow[col];
          if (!id || id <= 0) continue;
          const sx = ((id - 1) % tilesetCols) * data.tileW;
          const sy = Math.floor((id - 1) / tilesetCols) * data.tileH;
          ctx.drawImage(data.tilesetImage, sx, sy, data.tileW, data.tileH, col * tw, dy, tw, th);
        }
      }
    }
  }

  renderEntities(entities, gfxEntities) {
    this._renderShadows(entities, gfxEntities);
    for (const group of entities.values()) {
      for (const entity of group) {
        this._renderEntity(entity, gfxEntities);
      }
    }
  }

  _renderShadows(entities, gfxEntities) {
    const ctx = this.viewport.ctx;
    const s = this.scale;
    for (const [layerName, group] of entities) {
      if (!SHADOW_LAYERS.has(layerName)) continue;
      for (const entity of group) {
        if (entity.isParticle) continue;
        const graphic = gfxEntities[entity.gfxName];
        if (!graphic) continue;
        const frame = graphic.animations[entity.currentAnimation][entity.currentFrame];
        const ss = entity.shadowScale;
        const w = frame.sw * entity.scale * s * ss;
        const h = frame.sh * entity.scale * s * ss;
        ctx.save();
        ctx.globalAlpha = entity.shadowAlpha;
        ctx.translate((entity.x + entity.shadowOffsetX) * s, (entity.y + entity.shadowOffsetY) * s);
        ctx.drawImage(graphic.shadowImage, frame.sx, frame.sy, frame.sw, frame.sh, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
  }

  _renderEntity(entity, gfxEntities) {
    const ctx = this.viewport.ctx;
    const s = this.scale;
    ctx.save();
    ctx.globalAlpha = entity.opacity / 100;
    ctx.translate(entity.x * s, entity.y * s);
    ctx.rotate(entity.rotation * Math.PI / 180);

    // Transform-affecting effects (currently just shake)
    const shake = entity.effects.find(e => e.type === 'shake');
    if (shake) {
      const p = 1 - shake.timer / shake.duration;
      const eased = shake.ease === 'out' ? (1 - p) : 1;
      const intensity = shake.intensity * eased;
      ctx.translate(
        (Math.random() - 0.5) * 2 * intensity,
        (Math.random() - 0.5) * 2 * intensity,
      );
    }

    let graphic = null;
    let frame = null;
    if (entity.isParticle) {
      const sz = entity.scale * s;
      ctx.fillStyle = entity.color || 'whitesmoke';
      ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
    } else {
      graphic = gfxEntities[entity.gfxName];
      if (graphic) {
        frame = graphic.animations[entity.currentAnimation][entity.currentFrame];
        const w = frame.sw * entity.scale * s;
        const h = frame.sh * entity.scale * s;
        ctx.drawImage(graphic.image, frame.sx, frame.sy, frame.sw, frame.sh, -w / 2, -h / 2, w, h);
      }
    }

    // Flash overlay on sprites only
    if (graphic && frame) {
      const flash = entity.effects.find(e => e.type === 'flash');
      if (flash) {
        const flashGfx = flash.color === '#fff' ? graphic.flashWhiteImage : graphic.flashImage;
        const progress = flash.timer / flash.duration;
        const buildup = flash.buildUp ? (1 - progress) : progress;
        ctx.globalAlpha = (entity.opacity / 100) * flash.intensity * buildup;
        const w = frame.sw * entity.scale * s;
        const h = frame.sh * entity.scale * s;
        ctx.drawImage(flashGfx, frame.sx, frame.sy, frame.sw, frame.sh, -w / 2, -h / 2, w, h);
      }
    }

    ctx.restore();
  }

  renderHitboxes(entities) {
    const ctx = this.viewport.ctx;
    const s = this.scale;
    ctx.strokeStyle = 'red';
    for (const group of entities.values()) {
      for (const entity of group) {
        if (!entity.hitbox) continue;
        const h = entity.hitbox;
        ctx.beginPath();
        ctx.rect(h[0] * s, h[2] * s, (h[1] - h[0]) * s, (h[3] - h[2]) * s);
        ctx.stroke();
      }
    }
  }
}

export default GameplayRenderer;
