// AssetManager loads all game assets in one pass:
//   - Entity images (with shadow/flash tint variants pre-baked)
//   - Stages: events JSON + composed tilemap (per-event-set tilemaps or single)
//
// Tilemap coordinate convention:
//   The renderer expects `tiles[row][col]` where row 0 is the BOTTOM of the
//   world (highest scrollY) and row N-1 is the TOP. Tiled exports row 0 at
//   the top, so each layer's data array is vertically flipped during load.
//   For event-tilemap stages, individual bgPortions are concatenated in the
//   order they appear in the events JSON; each bgPortion is itself flipped.
//
// Sprite animation:
//   Each entity may have an Aseprite JSON alongside the PNG. We parse it
//   into an `animations` map: { [name]: [{sx, sy, sw, sh, duration}, ...] }.
//   When no JSON is present, a single-frame "default" animation is built
//   from the image bounds. Per-frame durations are in tics (aseprite ms / 16).

const DEFAULT_APPEARANCES = 1;
const MS_PER_TIC = 16;
const TIC_DEFAULT_DURATION = 1;

class AssetManager {
  constructor() {
    this.graphics = { entities: {} };
    this.stages = {};
  }

  async loadImages(manifestUrl) {
    const manifest = await this._fetchJson(manifestUrl);
    const baseDir = this._baseDir(manifestUrl);
    await Promise.all((manifest.entities || []).map(async entry => {
      const url = baseDir + entry.file;
      const img = await this._loadImage(url);
      const key = entry.file.replace(/\.\w+$/, '');
      const animations = entry.aseprite
        ? await this._loadAsepriteAnimations(baseDir + entry.aseprite)
        : { default: [{ sx: 0, sy: 0, sw: img.width, sh: img.height, duration: TIC_DEFAULT_DURATION }] };
      this.graphics.entities[key] = {
        image: img,
        shadowImage: this._makeTintedCanvas(img, 'black'),
        flashImage: this._makeTintedCanvas(img, '#f00'),
        flashWhiteImage: this._makeTintedCanvas(img, '#fff'),
        animations,
      };
    }));
  }

  async _loadAsepriteAnimations(url) {
    const data = await this._fetchJson(url);
    const frames = data.frames || [];
    const tags = (data.meta && data.meta.frameTags) || [];
    if (tags.length === 0) {
      return { default: frames.map(f => this._asepriteFrame(f)) };
    }
    const animations = {};
    for (const tag of tags) {
      const range = [];
      const lo = Math.min(tag.from, tag.to);
      const hi = Math.max(tag.from, tag.to);
      for (let i = lo; i <= hi; i++) {
        const idx = tag.direction === 'reverse' ? tag.to - (i - lo) : i;
        const f = frames[idx];
        if (f) range.push(this._asepriteFrame(f));
      }
      animations[tag.name] = range;
    }
    return animations;
  }

  _asepriteFrame(f) {
    return {
      sx: f.frame.x, sy: f.frame.y, sw: f.frame.w, sh: f.frame.h,
      duration: Math.max(1, Math.round((f.duration || 0) / MS_PER_TIC)),
    };
  }

  async loadStageManifest(manifestUrl) {
    const manifest = await this._fetchJson(manifestUrl);
    await Promise.all((manifest.stages || []).map(stage => this._loadStage(stage, manifestUrl)));
  }

  // A stage has either `events` (block-based, drives tilemap composition)
  // or `tilemap` (single tilemap, no events). `events` takes precedence
  // if both are present. Paths inside the stage entry are resolved
  // relative to the manifest URL.
  async _loadStage(stage, manifestUrl) {
    const entry = { id: stage.id };
    this.stages[stage.id] = entry;

    if (stage.events) {
      const eventsUrl = this._resolveAssetUrl(stage.events, manifestUrl);
      const data = await this._fetchJson(eventsUrl);
      const blocks = Array.isArray(data) ? data : data.events;
      if (!Array.isArray(blocks)) {
        throw new Error(`[assets] events JSON has invalid format: ${eventsUrl}`);
      }
      entry.events = blocks;
      entry.testFromIdx = Array.isArray(data) ? undefined : data._testFromIdx;

      if (this._stageHasBgPortions(blocks)) {
        const { tilemap, image } = await this._loadBlockTilemap(blocks, eventsUrl);
        entry.tilemap = tilemap;
        entry.tilemapImage = image;
      }
    } else if (stage.tilemap) {
      const { tilemap, image } = await this._loadTilemap(stage.tilemap);
      entry.tilemap = tilemap;
      entry.tilemapImage = image;
    }
  }

  _stageHasBgPortions(blocks) {
    for (const block of blocks) {
      if (block.bgPortions && block.bgPortions.length > 0) return true;
    }
    return false;
  }

  async _loadTilemap(url) {
    const tilemap = await this._fetchJson(url);
    const rawTilesetPath = tilemap.tileset || tilemap.tilesets?.[0]?.image || '';
    const tilesetPath = this._resolveAssetUrl(rawTilesetPath, url);
    const image = await this._loadImage(tilesetPath);
    return {
      tilemap: this._normalizeTilemap(tilemap, tilesetPath),
      image,
    };
  }

  // Concatenate the bgPortions from all blocks into a single composite
  // tilemap. Each block contributes its bgPortions in order. The
  // resulting bgPortion metadata carries appearances + speed for the
  // engine to consume.
  async _loadBlockTilemap(blocks, eventsUrl) {
    const entries = [];
    for (const block of blocks) {
      for (const bp of (block.bgPortions || [])) {
        entries.push({ block, bp });
      }
    }
    if (entries.length === 0) {
      throw new Error(`[assets] _loadBlockTilemap called with no bgPortions: ${eventsUrl}`);
    }

    const loaded = await Promise.all(entries.map(async ({ block, bp }) => {
      const url = this._resolveAssetUrl(bp.file, eventsUrl);
      const data = await this._fetchJson(url);
      return { block, bp, data, url };
    }));

    const { layers, bgPortionMeta, totalRows, ref } = this._concatBgPortions(loaded, (item, startRow, H) => ({
      label: item.bp.label || '',
      startRow,
      height: H,
      appearances: item.bp.appearances !== undefined ? item.bp.appearances : DEFAULT_APPEARANCES,
      speed: item.bp.speed || 0,
      speedTransitionTime: item.bp.speedTransitionTime || 0,
      speedEasing: item.bp.speedEasing || 'linear',
    }));

    const rawTilesetPath = ref.tileset || ref.tilesets?.[0]?.image || '';
    const tilesetPath = this._resolveAssetUrl(rawTilesetPath, loaded[0].url);
    const image = await this._loadImage(tilesetPath);

    return {
      tilemap: {
        tileW: ref.tilewidth,
        tileH: ref.tileheight,
        width: ref.width,
        height: totalRows,
        layers,
        tiles: layers[0] ? layers[0].tiles : [],
        bgPortions: bgPortionMeta,
        tileset: tilesetPath,
      },
      image,
    };
  }

  // Concatenate multiple bgPortion tilemaps into one composite tilemap with
  // aligned layers and per-bgPortion metadata. Each bgPortion's layer data
  // is Y-flipped (Tiled's top-row-first → engine's bottom-row-first).
  _concatBgPortions(bgPortions, buildMeta) {
    const layerMap = {};
    const bgPortionMeta = [];
    let totalRows = 0;
    let ref = null;

    bgPortions.forEach(item => {
      const data = item.data;
      if (!ref) ref = data;
      const W = data.width;
      const H = data.height;
      const rowBase = totalRows;

      // Pad existing layers with H null rows so all layers stay aligned
      const prevLayerHeights = {};
      Object.entries(layerMap).forEach(([name, l]) => {
        prevLayerHeights[name] = l.tiles.length;
        for (let i = 0; i < H; i++) l.tiles.push(null);
      });

      (data.layers || []).forEach(layer => {
        const name = layer.name || '';
        if (!layerMap[name]) {
          // New layer: pad with rowBase nulls then H placeholder rows
          layerMap[name] = { name, tiles: [], width: W };
          for (let i = 0; i < rowBase; i++) layerMap[name].tiles.push(null);
          for (let i = 0; i < H; i++) layerMap[name].tiles.push(null);
        }
        const flat = layer.data;
        const offset = prevLayerHeights[name] !== undefined ? prevLayerHeights[name] : rowBase;
        for (let r = 0; r < H; r++) {
          const row = [];
          const j = H - 1 - r; // Y-flip
          for (let c = 0; c < W; c++) row.push(flat[j * W + c] || 0);
          layerMap[name].tiles[offset + r] = row;
        }
      });

      bgPortionMeta.push(buildMeta(item, totalRows, H));
      totalRows += H;
    });

    return {
      layers: Object.values(layerMap),
      bgPortionMeta,
      totalRows,
      ref,
    };
  }

  _normalizeTilemap(tilemap, resolvedTilesetPath) {
    const W = tilemap.width || 0;
    const H = tilemap.height || 0;
    const layers = (tilemap.layers || []).map(layer => {
      const data = layer.data || [];
      const tiles = [];
      // Y-flip
      for (let r = H - 1; r >= 0; r--) {
        const row = [];
        for (let c = 0; c < W; c++) row.push(data[r * W + c] || 0);
        tiles.push(row);
      }
      return { name: layer.name || '', tiles, width: W, height: H };
    });

    let bgPortions = [];
    if (tilemap.properties) {
      const prop = tilemap.properties.find(p => p.name === 'portions');
      if (prop && prop.value) {
        try { bgPortions = JSON.parse(prop.value); } catch (e) {}
      }
    }

    return {
      tileW: tilemap.tilewidth,
      tileH: tilemap.tileheight,
      width: W,
      height: H,
      layers,
      tiles: layers[0] ? layers[0].tiles : [],
      bgPortions,
      tileset: resolvedTilesetPath,
    };
  }

  _makeTintedCanvas(img, color) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, img.width, img.height);
    return c;
  }

  async _fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`[assets] HTTP ${res.status} for ${url}`);
    return res.json();
  }

  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`[assets] failed to load image: ${url}`));
      img.src = url;
    });
  }

  // Resolve `relativePath` against `baseUrl`. The URL constructor handles
  // ../ normalization and respects absolute paths (starts with /).
  _resolveAssetUrl(relativePath, baseUrl) {
    if (!relativePath) return '';
    return new URL(relativePath, new URL(baseUrl, document.baseURI)).href;
  }

  _baseDir(url) {
    return url.substring(0, url.lastIndexOf('/') + 1);
  }
}

export default AssetManager;
