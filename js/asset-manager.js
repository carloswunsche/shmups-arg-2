// AssetManager loads all game assets in one pass:
//   - Entity images (with shadow/flash tint variants pre-baked)
//   - Stages: events JSON + per-block background portions
//
// Background coordinate convention:
//   Rows are stored BOTTOM-first: row index 0 is the bottom-most row of a
//   portion (the row that scrolls off-screen last as the world moves down),
//   the highest index is the top-most row (enters the viewport first). Tiled
//   exports row 0 at the top, so each portion's layer data is vertically
//   flipped on load.
//
//   Portions are kept GROUPED BY BLOCK (not flattened into one composite).
//   The Background owns a sliding buffer that pulls rows from these portions
//   on demand; the renderer only draws the rows currently visible.
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

  // A stage carries `events` (gameplay blocks) and an independent
  // `background.portions` array (the background's own timeline). Portions are
  // loaded as a flat, ordered sequence of Y-flipped, per-layer row data that
  // the Background walks on its own.
  async _loadStage(stage, manifestUrl) {
    const entry = { id: stage.id };
    this.stages[stage.id] = entry;

    if (!stage.events) return;

    const eventsUrl = this._resolveAssetUrl(stage.events, manifestUrl);
    const data = await this._fetchJson(eventsUrl);
    const blocks = Array.isArray(data) ? data : data.events;
    if (!Array.isArray(blocks)) {
      throw new Error(`[assets] events JSON has invalid format: ${eventsUrl}`);
    }
    entry.events = blocks;
    entry.testFromIdx = Array.isArray(data) ? undefined : data._testFromIdx;

    const portions = (!Array.isArray(data) && data.background && data.background.portions) || [];
    if (portions.length > 0) {
      entry.background = await this._loadBackground(portions, eventsUrl);
    }
  }

  // Load the stage's background portions as a flat, ordered sequence. Returns:
  //   {
  //     tileW, tileH, mapWidth, tilesetPath, tilesetImage,
  //     layerNames: [...],            // union of all layer names, draw order
  //     portions: [ Portion, ... ]    // flat timeline, in authoring order
  //   }
  // Portion = {
  //   height,                         // row count
  //   appearances, speed, speedTransitionTime, speedEasing, activateBlock, label,
  //   layers: { [layerName]: row[] }  // each row[] is bottom-first, length=mapWidth
  // }
  async _loadBackground(portionDefs, eventsUrl) {
    const loaded = await Promise.all(portionDefs.map(async (bp, idx) => {
      const url = this._resolveAssetUrl(this._portionFileRef(bp.file), eventsUrl);
      const data = await this._fetchJson(url);
      return { idx, bp, data, url };
    }));

    const layerNameSet = [];
    let ref = null;
    const portions = new Array(portionDefs.length);

    for (const item of loaded) {
      const data = item.data;
      if (!ref) ref = { data, url: item.url };
      const W = data.width;
      const H = data.height;

      const layers = {};
      (data.layers || []).forEach(layer => {
        const name = layer.name || '';
        if (!layerNameSet.includes(name)) layerNameSet.push(name);
        const flat = layer.data || [];
        const rows = [];
        for (let r = 0; r < H; r++) {
          const j = H - 1 - r; // Y-flip: Tiled top-first -> bottom-first
          const row = new Array(W);
          for (let c = 0; c < W; c++) row[c] = flat[j * W + c] || 0;
          rows.push(row);
        }
        layers[name] = rows;
      });

      portions[item.idx] = {
        height: H,
        appearances: item.bp.appearances !== undefined ? item.bp.appearances : DEFAULT_APPEARANCES,
        speed: item.bp.speed || 0,
        speedTransitionTime: item.bp.speedTransitionTime || 0,
        speedEasing: item.bp.speedEasing || 'linear',
        activateBlock: item.bp.activateBlock !== undefined ? item.bp.activateBlock : -1,
        label: item.bp.label || '',
        layers,
      };
    }

    const refData = ref.data;
    const rawTilesetPath = refData.tileset || refData.tilesets?.[0]?.image || '';
    const tilesetPath = this._resolveAssetUrl(rawTilesetPath, ref.url);
    const tilesetImage = await this._loadImage(tilesetPath);

    return {
      tileW: refData.tilewidth,
      tileH: refData.tileheight,
      mapWidth: refData.width,
      tilesetPath,
      tilesetImage,
      layerNames: layerNameSet,
      portions,
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

  // Background portion `file` may be a bare filename (e.g. "stage1-bgPortion1.json"),
  // which lives in the sibling backgrounds dir relative to the events JSON.
  // Paths that already contain a slash (e.g. "../backgrounds/x.json", "/abs", "http")
  // are returned untouched for backward compatibility.
  _portionFileRef(file) {
    if (!file) return file;
    if (file.includes('/')) return file;
    return '../backgrounds/' + file;
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
