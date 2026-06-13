const EASING_OPTIONS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];
const ENTITY_CLASSES = ['Popcorn1', 'Popcorn2', 'Popcorn3', 'Popcorn4', 'Midboss1', 'Brick1', 'Player', 'PlayerBullet', 'EnemyBullet', 'Particle'];
const TILEMAP_FILES = [
  'stage1-bgPortion1.json', 'stage1-bgPortion2.json', 'stage1-bgPortion3.json',
  'stage1-bgPortion4.json', 'stage1-bgPortion5.json', 'stage1-bgPortion6.json',
  'stage1-bgPortion7.json', 'stage1-bgPortion8.json',
  'stage1-bgPortion9.json', 'stage1-bgPortion10.json',
];
const EVENTS_AUTOLOAD_PATH = '../assets/stage-events/stage1-events.json';
const TILEMAP_DIR = '/assets/backgrounds/';

const SPRITE_FILES = {
  'Popcorn1': 'enemy-popcorn1.png',
  'Popcorn2': 'enemy-popcorn2.png',
  'Popcorn3': 'enemy-popcorn3.png',
  'Popcorn4': 'enemy-popcorn4.png',
  'Brick1': 'enemy-brick1.png',
  'Player': 'player-ship.png',
  'PlayerBullet': 'player-bullet.png',
  'Midboss1': 'enemy-midboss1.png',
};
let entitySprites = {};

function populateDatalist(id, values) {
  const dl = document.getElementById(id);
  if (!dl) return;
  dl.innerHTML = values.map(v => `<option value="${v}">`).join('');
}

function loadEntitySprites() {
  const base = '../assets/images/';
  Object.entries(SPRITE_FILES).forEach(([name, file]) => {
    const img = new Image();
    img.onload = () => { entitySprites[name] = img; };
    img.src = base + file;
  });
}

let blocks = [];
let selectedBlockIdx = -1;
let selectedEventSetIdx = -1;
let currentFileName = null;
let fileHandle = null;
let copiedEvent = null;
let blockPreviews = {};
let portionPreviewTimers = {};

const BACKUP_KEY = 'editor_backup_json';
const BACKUP_TIMESTAMP_KEY = 'editor_backup_timestamp';
const BACKUP_FILENAME_KEY = 'editor_backup_filename';

function backup() {
  if (blocks.length === 0) return false;
  try {
    const data = buildOutput();
    const json = JSON.stringify(data, null, 2);
    localStorage.setItem(BACKUP_KEY, json);
    localStorage.setItem(BACKUP_TIMESTAMP_KEY, String(Date.now()));
    localStorage.setItem(BACKUP_FILENAME_KEY, currentFileName || '');
    return true;
  } catch (err) {
    console.warn('Backup failed:', err);
    return false;
  }
}

function getBackup() {
  const json = localStorage.getItem(BACKUP_KEY);
  if (!json) return null;
  return {
    json,
    timestamp: parseInt(localStorage.getItem(BACKUP_TIMESTAMP_KEY) || '0', 10),
    filename: localStorage.getItem(BACKUP_FILENAME_KEY) || '',
  };
}

function restoreFromBackup() {
  const b = getBackup();
  if (!b) { setStatus('No backup available'); return; }
  try {
    const data = JSON.parse(b.json);
    loadData(data, b.filename || 'restored.json');
    setStatus('Restored from backup (' + new Date(b.timestamp).toLocaleTimeString() + ')');
  } catch (err) {
    setStatus('Backup is corrupt: ' + err.message);
  }
}

const $ = id => document.getElementById(id);
const blockList = $('blockList');
const placeholder = $('placeholder');
const detailContent = $('detailContent');
const eventsList = $('eventsList');
const statusEl = $('status');
const fileLabel = $('fileLabel');
const timelineBar = $('timelineBar');
const timelineMarkers = $('timelineMarkers');
const timelineLabels = $('timelineLabels');

document.addEventListener('DOMContentLoaded', () => {
  populateDatalist('entityClasses', ENTITY_CLASSES);
  populateDatalist('tilemapFiles', TILEMAP_FILES);

  $('btnLoad').addEventListener('click', () => $('fileInput').click());
  $('btnSave').addEventListener('click', saveFile);
  $('btnBackup').addEventListener('click', () => {
    if (backup()) {
      const ts = new Date(parseInt(localStorage.getItem(BACKUP_TIMESTAMP_KEY) || '0', 10)).toLocaleTimeString();
      setStatus('Backed up at ' + ts);
    } else {
      setStatus('Backup failed (localStorage full?)');
    }
  });
  $('btnRestore').addEventListener('click', restoreFromBackup);
  $('btnAddBlock').addEventListener('click', addBlock);
  $('btnAddPortion').addEventListener('click', () => {
    if (selectedBlockIdx < 0) return;
    blocks[selectedBlockIdx].bgPortions.push(makeDefaultPortion());
    renderAll();
    loadPortionPreviews();
  });
  $('btnAddEventSet').addEventListener('click', addEventSet);
  $('btnAddEvent').addEventListener('click', addEvent);
  $('btnPasteEvent').addEventListener('click', pasteEvent);
  $('btnExpandAll').addEventListener('click', () => setAllCards(false));
  $('btnCollapseAll').addEventListener('click', () => setAllCards(true));

  $('fileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadFile(file);
  });

  $('blockKind').addEventListener('change', onBlockMetaChange);
  $('blockStartBonus').addEventListener('input', onBlockMetaChange);
  $('blockDecay').addEventListener('input', onBlockMetaChange);
  $('setQuota').addEventListener('input', () => {
    const s = getCurrentEventSet();
    if (!s) return;
    s.quota = Math.max(0, parseInt($('setQuota').value) || 0);
    renderEventSetList();
  });

  $('spriteModal').addEventListener('click', function () { this.classList.add('hidden'); });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveFile(); }
  });

  document.addEventListener('dragover', e => { e.preventDefault(); });
  document.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.json')) loadFile(file);
  });

  $('btnStartAt0').addEventListener('click', () => { $('testFromIdx').value = 0; });
  $('btnStartAtSelected').addEventListener('click', () => {
    if (selectedBlockIdx >= 0) $('testFromIdx').value = selectedBlockIdx;
  });

  loadEntitySprites();

  fetch(EVENTS_AUTOLOAD_PATH)
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(text => {
      if (!text || !text.trim()) {
        const b = getBackup();
        if (b) {
          try {
            const data = JSON.parse(b.json);
            loadData(data, 'stage1-events.json');
            setStatus('stage1-events.json is empty — restored from local backup');
            return null;
          } catch (err) {
            setStatus('stage1-events.json is empty and backup is corrupt');
            return null;
          }
        }
        setStatus('stage1-events.json is empty, no backup available');
        return null;
      }
      return JSON.parse(text);
    })
    .then(data => { if (data) loadData(data, 'stage1-events.json'); })
    .catch(() => setStatus('Could not load stage1-events.json — open a file or load sample'));
});

function makeDefaultBlock(kind = 'waveless') {
  return {
    kind,
    startBonus: kind === 'wave' ? 1000 : 0,
    decay: 0,
    bgPortions: [makeDefaultPortion()],
    eventSets: [],
  };
}

function makeDefaultPortion() {
  return {
    file: 'stage1-bgPortion1.json',
    appearances: -1,
  };
}

function makeDefaultEventSet() {
  return { quota: 0, events: [] };
}

function makeDefaultEvent() {
  return {
    tic: 0,
    _collapsed: true,
    _spawnEnabled: false,
    _spawnClass: '',
    _spawnParams: [],
    _spawnCount: 1,
    _spawnInterval: 0,
    _speedEnabled: false,
    _speedValue: '',
    _speedTransition: '',
    _speedEasing: 'linear',
    _broadcastEnabled: false,
    _broadcast: '',
    _disabled: false,
  };
}

function getCurrentBlock() {
  return selectedBlockIdx >= 0 && selectedBlockIdx < blocks.length ? blocks[selectedBlockIdx] : null;
}

function getCurrentEventSet() {
  const b = getCurrentBlock();
  if (!b) return null;
  if (selectedEventSetIdx < 0 || selectedEventSetIdx >= b.eventSets.length) return null;
  return b.eventSets[selectedEventSetIdx];
}

function onFileSelected(e) {
  const file = e.target.files[0];
  if (file) loadFile(file);
}

function loadFile(file) {
  currentFileName = file.name;
  fileHandle = null;
  const reader = new FileReader();
  reader.onload = e => {
    const content = e.target.result;
    if (!content || !content.trim()) {
      const b = getBackup();
      if (b && confirm('File is empty. Restore from local backup?')) {
        try {
          const data = JSON.parse(b.json);
          loadData(data, file.name);
          setStatus('Restored from local backup');
          return;
        } catch (err) {
          setStatus('Backup is also corrupt: ' + err.message);
          return;
        }
      }
      setStatus('File is empty (no backup)');
      return;
    }
    try {
      const data = JSON.parse(content);
      loadData(data, file.name);
    } catch (err) {
      setStatus('Error: Invalid JSON — ' + err.message);
    }
  };
  reader.readAsText(file);
}

function loadData(data, name) {
  if (!data || !Array.isArray(data.events)) {
    setStatus('Error: expected an "events" array of blocks');
    return;
  }
  blocks = data.events.map(b => normalizeBlock(b));
  selectedBlockIdx = blocks.length > 0 ? 0 : -1;
  selectedEventSetIdx = (selectedBlockIdx >= 0 && blocks[0].eventSets.length > 0) ? 0 : -1;
  $('testFromIdx').value = data._testFromIdx !== undefined ? data._testFromIdx : 0;
  fileLabel.textContent = name;
  setStatus(`Loaded ${blocks.length} block(s)`);
  loadPortionPreviews().then(() => renderAll());
}

function normalizeBlock(b) {
  return {
    kind: b.kind === 'wave' ? 'wave' : 'waveless',
    startBonus: b.startBonus || 0,
    decay: b.decay || 0,
    bgPortions: (b.bgPortions || []).map(p => normalizePortion(p)),
    eventSets: (b.eventSets || []).map(s => normalizeEventSet(s)),
  };
}

function normalizePortion(p) {
  return {
    file: p.file || 'stage1-bgPortion1.json',
    appearances: p.appearances !== undefined ? p.appearances : -1,
  };
}

function normalizeEventSet(s) {
  return {
    quota: s.quota || 0,
    events: (s.events || []).map(e => {
      const copy = { ...e };
      copy._collapsed = e._collapsed !== false;
      denormalizeEvent(copy);
      return copy;
    }),
  };
}

async function loadPortionPreview(portion, blockIdx, portionIdx) {
  const key = blockIdx + ':' + portionIdx;
  if (!portion.file) { blockPreviews[key] = null; return; }
  const url = resolveTilemapPath(portion.file);
  try {
    const data = await fetch(url).then(r => r.json());
    let tsPath = data.tileset || data.tilesets?.[0]?.image || '';
    if (!tsPath) return;
    if (!tsPath.startsWith('/')) {
      const base = url.substring(0, url.lastIndexOf('/') + 1);
      tsPath = base + tsPath;
    }
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = tsPath;
    });
    blockPreviews[key] = renderPortionPreview(data, img);
  } catch (_) {
    blockPreviews[key] = null;
  }
}

function loadPortionPreviews() {
  const tasks = [];
  blocks.forEach((b, bi) => {
    b.bgPortions.forEach((p, pi) => {
      tasks.push(loadPortionPreview(p, bi, pi));
    });
  });
  return Promise.all(tasks);
}

function renderPortionPreview(data, tilesetImg) {
  const W = data.width;
  const H = data.height;
  const tileW = data.tilewidth || 8;
  const tileH = data.tileheight || 8;
  const ts = data.tilesets && data.tilesets[0];
  const tsCols = ts ? ts.columns : 6;

  const scale = 4;
  const cw = W * scale;
  const ch = H * scale;

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  (data.layers || []).forEach(layer => {
    const flat = layer.data;
    if (!flat) return;
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const gid = flat[r * W + c];
        if (!gid || gid === 0) continue;
        const idx = gid - 1;
        const sx = (idx % tsCols) * tileW;
        const sy = Math.floor(idx / tsCols) * tileH;
        ctx.drawImage(tilesetImg, sx, sy, tileW, tileH, c * scale, r * scale, scale, scale);
      }
    }
  });

  const img = document.createElement('img');
  img.src = canvas.toDataURL();
  img.className = 'portion-preview';
  img.width = cw;
  img.height = ch;
  img.alt = '';
  return img;
}

async function saveFile() {
  if (blocks.length === 0) { setStatus('Nothing to save'); return; }
  const data = buildOutput();
  const json = JSON.stringify(data, null, 2);
  backup();

  if (fileHandle) {
    try {
      const writable = await fileHandle.createWritable({ keepExistingData: true });
      await writable.write(json);
      await writable.close();
      setStatus('Saved to ' + fileHandle.name);
    } catch (err) {
      setStatus('Save failed: ' + err.message);
    }
    return;
  }

  if ('showSaveFilePicker' in window) {
    const suggested = currentFileName || 'stage1-events.json';
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggested,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      fileHandle = handle;
      currentFileName = handle.name;
      fileLabel.textContent = handle.name;
      setStatus('Saved to ' + handle.name);
    } catch (err) {
      if (err.name !== 'AbortError') setStatus('Save cancelled or failed');
    }
    return;
  }

  const name = currentFileName || 'events.json';
  download(json, name, 'application/json');
  setStatus('Downloaded as ' + name);
}

function buildOutput() {
  const testFrom = parseInt($('testFromIdx').value) || 0;
  return {
    _testFromIdx: testFrom,
    events: blocks.map(b => serializeBlock(b)),
  };
}

function serializeBlock(b) {
  const out = {
    kind: b.kind,
    bgPortions: b.bgPortions.map(p => ({
      file: p.file,
      appearances: p.appearances,
    })),
    eventSets: b.eventSets.map(s => ({
      quota: s.quota,
      events: s.events.map(e => serializeEvent(e)),
    })),
  };
  if (b.kind === 'wave') {
    out.startBonus = b.startBonus;
    out.decay = b.decay;
  }
  return out;
}

function serializeEvent(e) {
  const out = {};
  out.tic = e.tic;
  if (e._collapsed === false) out._collapsed = false;
  if (e._disabled) out._disabled = true;

  if (e._spawnEnabled && e._spawnClass) {
    out.spawn = [e._spawnClass];
    if (e._spawnParams && e._spawnParams.length > 0) {
      const obj = {};
      e._spawnParams.forEach(p => {
        if (p.key && p.key.trim()) obj[p.key.trim()] = parseValue(p.val);
      });
      if (Object.keys(obj).length > 0) out.spawn.push(obj);
    }
    if (e._spawnCount > 1) out.spawnCount = e._spawnCount;
    if (e._spawnInterval) out.spawnInterval = e._spawnInterval;
  }

  if (e._speedEnabled && e._speedValue !== undefined && e._speedValue !== '') {
    const sp = { value: Number(e._speedValue) };
    if (e._speedTransition !== undefined && e._speedTransition !== '') sp.transitionTime = Number(e._speedTransition);
    if (e._speedEasing && e._speedEasing !== 'linear') sp.easing = e._speedEasing;
    out.speed = sp;
  }

  if (e._broadcastEnabled && e._broadcast) out.broadcast = e._broadcast;

  return out;
}

function parseValue(str) {
  str = String(str).trim();
  if (str === 'true') return true;
  if (str === 'false') return false;
  if (str === 'null') return null;
  if (str !== '' && !isNaN(Number(str))) return Number(str);
  if (str.startsWith('[') || str.startsWith('{')) {
    try { return JSON.parse(str); } catch (e) { return str; }
  }
  return str;
}

function hasPerSpawnLists(e) {
  if (!e._spawnParams) return false;
  return e._spawnParams.some(p => p.key && p.key.trim() && Array.isArray(parseValue(p.val)));
}

function perSpawnSummary(e) {
  if (!e._spawnParams) return '';
  return e._spawnParams
    .filter(p => p.key && p.key.trim() && Array.isArray(parseValue(p.val)))
    .map(p => `${p.key.trim()}(${parseValue(p.val).length})`)
    .join(', ');
}

function refreshPerSpawnHint(card, ev) {
  const hint = card.querySelector('.per-spawn-hint');
  if (!hint) return;
  if (hasPerSpawnLists(ev)) {
    hint.classList.remove('hidden');
    const detail = hint.querySelector('.hint-detail');
    if (detail) detail.textContent = perSpawnSummary(ev);
  } else {
    hint.classList.add('hidden');
  }
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function resolveTilemapPath(p) {
  if (!p) return p;
  if (p.startsWith('http')) return p;
  if (p.startsWith('/')) return p;
  if (p.startsWith('../backgrounds/')) return '/assets/' + p.substring('../'.length);
  return TILEMAP_DIR + p;
}

function renderAll() {
  renderSidebar();
  renderDetail();
}

function renderSidebar() {
  const savedScroll = blockList.scrollTop;
  blockList.innerHTML = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const div = document.createElement('div');
    div.className = 'block-item' + (i === selectedBlockIdx ? ' selected' : '');
    div.dataset.idx = i;

    const head = document.createElement('div');
    head.className = 'block-head';
    head.innerHTML = `<span class="block-idx">#${i}</span><span class="block-kind kind-${b.kind}">${b.kind}</span>`;
    div.appendChild(head);

    const summary = document.createElement('div');
    summary.className = 'block-summary';
    const portionText = b.bgPortions.length === 0 ? 'no bg' :
      b.bgPortions.map(p => p.file.replace('.json', '').replace('stage1-bgPortion', '#')).join(' ');
    const evTotal = b.eventSets.reduce((a, s) => a + s.events.length, 0);
    let line = `${portionText} · ${b.eventSets.length} set${b.eventSets.length === 1 ? '' : 's'} (${evTotal} ev)`;
    if (b.kind === 'wave') line += ` · bonus ${b.startBonus} d${b.decay}`;
    summary.textContent = line;
    div.appendChild(summary);

    if (i === selectedBlockIdx) {
      b.eventSets.forEach((s, j) => {
        const chip = document.createElement('div');
        chip.className = 'eventset-chip' + (j === selectedEventSetIdx ? ' selected' : '');
        chip.dataset.setIdx = j;
        chip.innerHTML = `<span class="set-idx">#${j}</span> <span>events: ${s.events.length}</span><span class="set-quota">quota ${s.quota}</span>`;
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-del-eventset';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', e => { e.stopPropagation(); removeEventSet(j); });
        chip.appendChild(delBtn);
        chip.addEventListener('click', () => { selectedEventSetIdx = j; renderAll(); });
        div.appendChild(chip);
      });
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-del-block';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', e => { e.stopPropagation(); removeBlock(i); });
    div.appendChild(delBtn);

    const moveBtns = document.createElement('div');
    moveBtns.className = 'block-move';
    const upBtn = document.createElement('button');
    upBtn.textContent = '▲';
    upBtn.disabled = i === 0;
    upBtn.addEventListener('click', e => { e.stopPropagation(); moveBlock(i, -1); });
    const downBtn = document.createElement('button');
    downBtn.textContent = '▼';
    downBtn.disabled = i === blocks.length - 1;
    downBtn.addEventListener('click', e => { e.stopPropagation(); moveBlock(i, 1); });
    moveBtns.appendChild(upBtn);
    moveBtns.appendChild(downBtn);
    div.appendChild(moveBtns);

    div.addEventListener('click', e => {
      if (e.target.closest('.btn-del-block')) return;
      if (e.target.closest('.eventset-chip')) return;
      if (e.target.closest('.block-move')) return;
      selectedBlockIdx = i;
      selectedEventSetIdx = blocks[i].eventSets.length > 0 ? 0 : -1;
      renderAll();
    });

    blockList.appendChild(div);
  }
  blockList.scrollTop = savedScroll;
}

function renderEventSetList() {
  renderSidebar();
}

function renderDetail() {
  const b = getCurrentBlock();
  if (!b) {
    placeholder.classList.remove('hidden');
    detailContent.classList.add('hidden');
    return;
  }
  placeholder.classList.add('hidden');
  detailContent.classList.remove('hidden');

  $('blockKind').value = b.kind;
  $('blockStartBonus').value = b.startBonus;
  $('blockDecay').value = b.decay;
  const isWave = b.kind === 'wave';
  $('blockStartBonus').disabled = !isWave;
  $('blockDecay').disabled = !isWave;
  $('blockHint').textContent = isWave
    ? `+${b.startBonus} on block end, −${b.decay}/tic + kill scores`
    : 'no wave bonus';

  renderPortions(b);
  renderEventSets();
  renderSetDetail();
}

function renderPortions(b) {
  const list = $('bgPortionList');
  list.innerHTML = '';
  b.bgPortions.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'bg-portion';
    const previewKey = selectedBlockIdx + ':' + i;
    const preview = blockPreviews[previewKey];
    if (preview) row.appendChild(preview.cloneNode(true));
    else {
      const ph = document.createElement('div');
      ph.className = 'portion-preview';
      row.appendChild(ph);
    }

    const fields = document.createElement('div');
    fields.className = 'field-row';
    fields.innerHTML = `
      <label>File</label>
      <input type="text" class="p-file" value="${escapeHtml(p.file)}" list="tilemapFiles">
      <label>Appear</label>
      <input type="number" class="p-app" min="-1" value="${p.appearances}">
    `;
    row.appendChild(fields);

    const ctrl = document.createElement('div');
    ctrl.className = 'field-row';
    const upBtn = document.createElement('button');
    upBtn.className = 'btn-move-portion';
    upBtn.textContent = '▲';
    upBtn.disabled = i === 0;
    upBtn.addEventListener('click', () => movePortion(i, -1));
    const downBtn = document.createElement('button');
    downBtn.className = 'btn-move-portion';
    downBtn.textContent = '▼';
    downBtn.disabled = i === b.bgPortions.length - 1;
    downBtn.addEventListener('click', () => movePortion(i, 1));
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-del-portion';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => removePortion(i));
    ctrl.appendChild(upBtn);
    ctrl.appendChild(downBtn);
    ctrl.appendChild(delBtn);
    row.appendChild(ctrl);

    fields.querySelector('.p-file').addEventListener('input', function () {
      p.file = this.value;
      schedulePortionPreviewReload(i);
    });
    fields.querySelector('.p-app').addEventListener('input', function () {
      p.appearances = Math.max(-1, parseInt(this.value) || -1);
    });

    list.appendChild(row);
  });
}

function schedulePortionPreviewReload(portionIdx) {
  const key = selectedBlockIdx + ':' + portionIdx;
  if (portionPreviewTimers[key]) clearTimeout(portionPreviewTimers[key]);
  portionPreviewTimers[key] = setTimeout(async () => {
    const b = getCurrentBlock();
    if (!b) return;
    await loadPortionPreview(b.bgPortions[portionIdx], selectedBlockIdx, portionIdx);
    renderAll();
  }, 300);
}

function renderEventSets() {
  const b = getCurrentBlock();
  if (!b) return;
  const list = $('eventSetList');
  list.innerHTML = '';
  b.eventSets.forEach((s, j) => {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.style.cssText = 'padding: 4px 0; border-bottom: 1px solid var(--border); cursor: pointer;';
    if (j === selectedEventSetIdx) row.style.background = 'var(--surface2)';
    row.innerHTML = `<span style="color:var(--accent);font-weight:bold;width:30px;">#${j}</span>
      <span>events: ${s.events.length}</span>
      <span style="color:var(--text2);font-size:11px;">quota ${s.quota}</span>`;
    row.addEventListener('click', () => { selectedEventSetIdx = j; renderAll(); });
    list.appendChild(row);
  });
}

function renderSetDetail() {
  const s = getCurrentEventSet();
  const setDetail = $('setDetail');
  if (!s) {
    setDetail.classList.add('hidden');
    return;
  }
  setDetail.classList.remove('hidden');
  $('setQuota').value = s.quota;
  $('setDetailHint').textContent = `${s.events.length} event(s)`;

  renderTimeline(s);
  renderEventsList(s);
}

function renderTimeline(s) {
  const events = s.events;
  if (events.length === 0) {
    timelineMarkers.innerHTML = '';
    timelineLabels.innerHTML = '';
    return;
  }

  const maxTic = Math.max(500, ...events.map(e => e.tic));
  const barWidth = timelineMarkers.parentElement.clientWidth - 20 || 600;
  if (barWidth <= 0) return;

  timelineMarkers.innerHTML = '';
  timelineLabels.innerHTML = '';

  events.filter(e => !e._disabled).forEach(e => {
    const pct = (e.tic / maxTic) * 100;
    const types = [];
    if (e._spawnEnabled) types.push('spawn');
    if (e._speedEnabled) types.push('speed');
    const type = types.length === 0 ? 'spawn' : (types.length === 1 ? types[0] : 'mixed');

    const marker = document.createElement('div');
    marker.className = `tl-marker type-${type}`;
    marker.style.left = `${pct}%`;
    marker.style.height = `${12 + (e._spawnCount > 1 ? Math.min(e._spawnCount * 3, 18) : 0)}px`;
    marker.title = `tic:${e.tic} ${types.join('+')}`;
    timelineMarkers.appendChild(marker);

    if (e._spawnEnabled && e._spawnClass && entitySprites[e._spawnClass]) {
      const sprite = document.createElement('img');
      sprite.src = entitySprites[e._spawnClass].src;
      sprite.className = 'tl-sprite';
      sprite.style.left = `${pct}%`;
      sprite.title = `tic:${e.tic} spawn ${e._spawnClass}`;
      sprite.addEventListener('click', function (ev) {
        ev.stopPropagation();
        const m = $('spriteModal');
        const img = m.querySelector('img');
        img.src = this.src;
        img.onload = () => { img.style.width = (img.naturalWidth * 8) + 'px'; };
        if (img.complete) img.style.width = (img.naturalWidth * 8) + 'px';
        m.classList.remove('hidden');
      });
      timelineMarkers.appendChild(sprite);
    }

    const lbl = document.createElement('div');
    lbl.className = 'tl-label';
    lbl.style.left = `${pct}%`;
    const spawnName = e._spawnEnabled && e._spawnClass ? e._spawnClass : '';
    const labelParts = types.map(t => t === 'spawn' && spawnName ? spawnName : t);
    lbl.innerHTML = `<span class="tl-tic">${e.tic}</span> ${labelParts.map(escapeHtml).join('+')}`;
    timelineLabels.appendChild(lbl);
  });
}

function renderEventsList(s) {
  eventsList.innerHTML = '';
  s.events.forEach((e, i) => {
    const card = createEventCard(s, i);
    if (e._collapsed === false) card.classList.remove('collapsed');
    eventsList.appendChild(card);
  });
}

function denormalizeEvent(e) {
  if (Array.isArray(e.spawn)) {
    e._spawnEnabled = true;
    e._spawnClass = e.spawn[0] || '';
    e._spawnParams = [];
    if (e.spawn[1] && typeof e.spawn[1] === 'object') {
      for (const [k, v] of Object.entries(e.spawn[1])) {
        const val = (Array.isArray(v) || (v && typeof v === 'object')) ? JSON.stringify(v) : String(v);
        e._spawnParams.push({ key: k, val });
      }
    }
  } else {
    e._spawnEnabled = false;
    e._spawnClass = '';
    e._spawnParams = [];
  }
  e._spawnCount = e.spawnCount || 1;
  e._spawnInterval = e.spawnInterval || 0;

  if (e.speed && typeof e.speed === 'object') {
    e._speedEnabled = true;
    e._speedValue = e.speed.value ?? '';
    e._speedTransition = e.speed.transitionTime ?? '';
    e._speedEasing = e.speed.easing || 'linear';
  } else {
    e._speedEnabled = false;
    e._speedValue = '';
    e._speedTransition = '';
    e._speedEasing = 'linear';
  }

  if (typeof e.broadcast === 'string' && e.broadcast) {
    e._broadcastEnabled = true;
    e._broadcast = e.broadcast;
  } else {
    e._broadcastEnabled = false;
    e._broadcast = '';
  }

  e._disabled = e._disabled || false;
}

function buildEventSummary(e) {
  const parts = [];
  parts.push('@' + (e.tic ?? 0));
  if (e._spawnEnabled && e._spawnClass) {
    let s = 'spawn ' + e._spawnClass;
    if (e._spawnCount > 1) s += ' x' + e._spawnCount;
    parts.push(s);
  }
  if (e._speedEnabled && e._speedValue !== '') parts.push('speed ' + e._speedValue);
  if (e._broadcastEnabled && e._broadcast) parts.push('broadcast ' + e._broadcast);
  return parts.join(', ') || '—';
}

function updateSummary(card, e) {
  const el = card.querySelector('.event-summary');
  if (el) el.textContent = buildEventSummary(e);
}

function createEventCard(s, evIdx) {
  const e = s.events[evIdx];
  const card = document.createElement('div');
  card.className = 'event-card collapsed' + (e._disabled ? ' event-disabled' : '');
  card.dataset.evIdx = evIdx;

  const summary = buildEventSummary(e);

  card.innerHTML = `
    <div class="event-header">
      <div class="event-title">
        <input type="checkbox" class="ev-toggle-event" ${e._disabled ? '' : 'checked'} title="Enable/disable this event">
        <span class="event-num">#${evIdx + 1}</span>
        <span class="event-summary">${escapeHtml(summary)}</span>
      </div>
      <div class="event-actions">
        <button class="btn-event-up" title="Move event up" ${evIdx === 0 ? 'disabled' : ''}>▲</button>
        <button class="btn-event-down" title="Move event down" ${evIdx === s.events.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="btn-del-event" title="Remove this event">✕</button>
      </div>
    </div>
    <div class="event-tic-row">
      <label>Tic</label>
      <input type="number" class="ev-tic" value="${e.tic}" min="0">
    </div>
    <div class="event-fields">
      <div class="event-section ${e._spawnEnabled ? 'section-active' : ''}">
        <label class="section-toggle">
          <input type="checkbox" class="ev-toggle" data-field="spawn" ${e._spawnEnabled ? 'checked' : ''}>
          <span class="toggle-label">Spawn</span>
        </label>
        <div class="section-body ${e._spawnEnabled ? '' : 'hidden'}">
          <div class="field-row">
            <label>Class</label>
            <input type="text" class="ev-spawn-class" value="${escapeHtml(e._spawnClass)}" list="entityClasses">
            <label>Count</label>
            <button type="button" class="ev-spawn-count-minus">−</button>
            <input type="number" class="ev-spawn-count" value="${e._spawnCount}" min="1" max="99">
            <button type="button" class="ev-spawn-count-plus">+</button>
            <label class="interval-label ${e._spawnCount > 1 ? '' : 'hidden'}">Interval</label>
            <input type="number" class="ev-spawn-interval ${e._spawnCount > 1 ? '' : 'hidden'}" value="${e._spawnInterval}" min="0" placeholder="tics">
          </div>
          <div class="per-spawn-hint ${hasPerSpawnLists(e) ? '' : 'hidden'}">
            <span class="hint-badge">per-spawn list</span>
            <span class="hint-detail">${perSpawnSummary(e)}</span>
          </div>
          <div class="sparam-section">
            <div class="sparam-header">
              <button class="btn-add-sparam">+</button>
              <span>Spawn Params</span>
            </div>
            <div class="sparam-list"></div>
          </div>
        </div>
      </div>

      <div class="event-section ${e._speedEnabled ? 'section-active' : ''}">
        <label class="section-toggle">
          <input type="checkbox" class="ev-toggle" data-field="speed" ${e._speedEnabled ? 'checked' : ''}>
          <span class="toggle-label">Speed</span>
        </label>
        <div class="section-body ${e._speedEnabled ? '' : 'hidden'}">
          <div class="field-row">
            <label>Value</label>
            <input type="number" class="ev-speed-value" value="${e._speedValue}" step="0.1" min="0">
            <label>Transition</label>
            <input type="number" class="ev-speed-transition" value="${e._speedTransition}" placeholder="tics" min="0">
            <label>Easing</label>
            <select class="ev-speed-easing">
              ${EASING_OPTIONS.map(opt => `<option value="${opt}" ${e._speedEasing === opt ? 'selected' : ''}>${opt}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="event-section ${e._broadcastEnabled ? 'section-active' : ''}">
        <label class="section-toggle">
          <input type="checkbox" class="ev-toggle" data-field="broadcast" ${e._broadcastEnabled ? 'checked' : ''}>
          <span class="toggle-label">Broadcast</span>
        </label>
        <div class="section-body ${e._broadcastEnabled ? '' : 'hidden'}">
          <div class="field-row">
            <label>Event name</label>
            <input type="text" class="ev-broadcast" value="${escapeHtml(e._broadcast)}" placeholder="e.g. shot_at_player">
          </div>
        </div>
      </div>

      <div class="event-section">
        <div class="switch-section">
          <button class="btn-copy-event" title="Copy this event">Copy event</button>
          <button class="btn-dup-event" title="Duplicate this event">Duplicate event</button>
          <span class="switch-divider">|</span>
          <label>Swap actions with event</label>
          <input type="number" class="ev-switch-idx" min="1" max="${s.events.length}" placeholder="#" value="">
          <button class="btn-switch">Go</button>
        </div>
      </div>
    </div>
  `;

  card.querySelector('.event-header').addEventListener('click', function (e) {
    if (e.target.closest('.event-actions')) return;
    if (e.target.closest('.ev-toggle-event')) return;
    card.classList.toggle('collapsed');
    s.events[evIdx]._collapsed = card.classList.contains('collapsed');
  });

  card.querySelector('.btn-del-event').addEventListener('click', () => removeEvent(evIdx));
  card.querySelector('.btn-dup-event').addEventListener('click', () => duplicateEvent(evIdx));
  card.querySelector('.btn-event-up').addEventListener('click', () => moveEvent(evIdx, -1));
  card.querySelector('.btn-event-down').addEventListener('click', () => moveEvent(evIdx, 1));

  const toggleEv = card.querySelector('.ev-toggle-event');
  if (toggleEv) toggleEv.addEventListener('change', function () {
    s.events[evIdx]._disabled = !this.checked;
    card.classList.toggle('event-disabled', !this.checked);
    renderTimeline(s);
  });

  card.querySelector('.btn-copy-event').addEventListener('click', function (e) {
    e.stopPropagation();
    copiedEvent = JSON.parse(JSON.stringify(s.events[evIdx]));
    $('btnPasteEvent').disabled = false;
    setStatus('Copied event');
  });

  card.querySelector('.ev-tic').addEventListener('input', function () {
    s.events[evIdx].tic = parseInt(this.value) || 0;
    updateSummary(card, s.events[evIdx]);
    renderTimeline(s);
  });

  const br = card.querySelector('.ev-broadcast');
  if (br) br.addEventListener('input', function () {
    s.events[evIdx]._broadcast = this.value;
    updateSummary(card, s.events[evIdx]);
  });

  card.querySelector('.btn-switch').addEventListener('click', function () {
    const input = card.querySelector('.ev-switch-idx');
    const target = parseInt(input.value);
    if (!target || target < 1 || target > s.events.length || target === evIdx + 1) return;
    const toIdx = target - 1;
    swapEventActions(s.events[evIdx], s.events[toIdx]);
    input.value = '';
    renderSetDetail();
    setStatus(`Swapped actions event #${evIdx + 1} <-> #${target}`);
  });

  card.querySelectorAll('.ev-toggle').forEach(cb => {
    cb.addEventListener('change', function () {
      const field = this.dataset.field;
      s.events[evIdx]['_' + field + 'Enabled'] = this.checked;
      updateSummary(card, s.events[evIdx]);
      renderSetDetail();
    });
  });

  const sc = card.querySelector('.ev-spawn-class');
  if (sc) sc.addEventListener('input', function () {
    s.events[evIdx]._spawnClass = this.value;
    updateSummary(card, s.events[evIdx]);
  });

  const scnt = card.querySelector('.ev-spawn-count');
  if (scnt) scnt.addEventListener('input', function () {
    s.events[evIdx]._spawnCount = parseInt(this.value) || 1;
    const multi = s.events[evIdx]._spawnCount > 1;
    card.querySelector('.ev-spawn-interval').classList.toggle('hidden', !multi);
    card.querySelector('.interval-label').classList.toggle('hidden', !multi);
    updateSummary(card, s.events[evIdx]);
    renderTimeline(s);
  });

  const bumpCount = (delta) => {
    const cur = s.events[evIdx]._spawnCount || 1;
    const next = Math.max(1, Math.min(99, cur + delta));
    s.events[evIdx]._spawnCount = next;
    scnt.value = next;
    scnt.dispatchEvent(new Event('input'));
  };
  const scntMinus = card.querySelector('.ev-spawn-count-minus');
  const scntPlus = card.querySelector('.ev-spawn-count-plus');
  if (scntMinus) scntMinus.addEventListener('click', () => bumpCount(-1));
  if (scntPlus) scntPlus.addEventListener('click', () => bumpCount(1));

  const spr = card.querySelector('.ev-spawn-interval');
  if (spr) spr.addEventListener('input', function () {
    s.events[evIdx]._spawnInterval = parseInt(this.value) || 0;
  });

  const sparamList = card.querySelector('.sparam-list');
  const btnAddSparam = card.querySelector('.btn-add-sparam');

  function renderSpawnParams() {
    if (!sparamList) return;
    sparamList.innerHTML = '';
    const params = s.events[evIdx]._spawnParams || [];
    params.forEach((p, pi) => {
      const row = document.createElement('div');
      row.className = 'ov-row';
      row.innerHTML = `
        <input class="ov-key" type="text" value="${escapeHtml(p.key)}" placeholder="key" spellcheck="false">
        <input class="ov-val" type="text" value="${escapeHtml(p.val)}" placeholder="value" spellcheck="false">
        <button class="btn-del-ov">&#10005;</button>
      `;
      row.querySelector('.ov-key').addEventListener('input', function () {
        s.events[evIdx]._spawnParams[pi].key = this.value;
      });
      row.querySelector('.ov-val').addEventListener('input', function () {
        s.events[evIdx]._spawnParams[pi].val = this.value;
        refreshPerSpawnHint(card, s.events[evIdx]);
      });
      row.querySelector('.btn-del-ov').addEventListener('click', () => {
        s.events[evIdx]._spawnParams.splice(pi, 1);
        renderSpawnParams();
        refreshPerSpawnHint(card, s.events[evIdx]);
      });
      sparamList.appendChild(row);
    });
  }

  renderSpawnParams();

  if (btnAddSparam) btnAddSparam.addEventListener('click', () => {
    if (!s.events[evIdx]._spawnParams) s.events[evIdx]._spawnParams = [];
    s.events[evIdx]._spawnParams.push({ key: '', val: '' });
    renderSpawnParams();
    refreshPerSpawnHint(card, s.events[evIdx]);
  });

  const sv = card.querySelector('.ev-speed-value');
  if (sv) sv.addEventListener('input', function () {
    s.events[evIdx]._speedValue = this.value;
    updateSummary(card, s.events[evIdx]);
  });

  const st = card.querySelector('.ev-speed-transition');
  if (st) st.addEventListener('input', function () {
    s.events[evIdx]._speedTransition = this.value;
  });

  const se = card.querySelector('.ev-speed-easing');
  if (se) se.addEventListener('change', function () {
    s.events[evIdx]._speedEasing = this.value;
  });

  return card;
}

const ACTION_KEYS = [
  '_spawnEnabled', '_spawnClass', '_spawnParams', '_spawnCount', '_spawnInterval',
  '_speedEnabled', '_speedValue', '_speedTransition', '_speedEasing',
  '_broadcastEnabled', '_broadcast',
  '_disabled'
];

function swapEventActions(a, b) {
  for (const key of ACTION_KEYS) {
    const tmp = a[key];
    a[key] = b[key];
    b[key] = tmp;
  }
}

function addBlock() {
  const insertAt = selectedBlockIdx >= 0 ? selectedBlockIdx + 1 : blocks.length;
  blocks.splice(insertAt, 0, makeDefaultBlock('waveless'));
  selectedBlockIdx = insertAt;
  selectedEventSetIdx = -1;
  renderAll();
  loadPortionPreviews();
  setStatus(`Added block #${selectedBlockIdx}`);
}

function removeBlock(idx) {
  if (blocks.length <= 1) { setStatus('Cannot remove the last block'); return; }
  blocks.splice(idx, 1);
  if (selectedBlockIdx >= blocks.length) selectedBlockIdx = blocks.length - 1;
  if (selectedBlockIdx < 0) {
    selectedEventSetIdx = -1;
  } else {
    selectedEventSetIdx = blocks[selectedBlockIdx].eventSets.length > 0 ? 0 : -1;
  }
  renderAll();
  setStatus(`Removed block #${idx}`);
}

function moveBlock(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= blocks.length) return;
  [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
  selectedBlockIdx = target;
  renderAll();
  setStatus(`Moved block #${idx} → #${target}`);
}

function movePortion(idx, dir) {
  const b = getCurrentBlock();
  if (!b) return;
  const target = idx + dir;
  if (target < 0 || target >= b.bgPortions.length) return;
  [b.bgPortions[idx], b.bgPortions[target]] = [b.bgPortions[target], b.bgPortions[idx]];
  renderAll();
  loadPortionPreviews();
}

function removePortion(idx) {
  const b = getCurrentBlock();
  if (!b) return;
  if (b.bgPortions.length <= 1) { setStatus('Cannot remove the last portion'); return; }
  b.bgPortions.splice(idx, 1);
  renderAll();
  loadPortionPreviews();
}

function onBlockMetaChange() {
  const b = getCurrentBlock();
  if (!b) return;
  const prevKind = b.kind;
  b.kind = $('blockKind').value;
  if (prevKind === 'wave' && b.kind !== 'wave') {
    b.startBonus = 0;
    b.decay = 0;
  } else if (prevKind !== 'wave' && b.kind === 'wave' && b.startBonus === 0) {
    b.startBonus = 1000;
  }
  b.startBonus = parseInt($('blockStartBonus').value) || 0;
  b.decay = parseFloat($('blockDecay').value) || 0;
  renderDetail();
  renderSidebar();
}

function addEventSet() {
  const b = getCurrentBlock();
  if (!b) return;
  b.eventSets.push(makeDefaultEventSet());
  selectedEventSetIdx = b.eventSets.length - 1;
  renderAll();
  setStatus(`Added event set #${selectedEventSetIdx}`);
}

function removeEventSet(idx) {
  const b = getCurrentBlock();
  if (!b) return;
  b.eventSets.splice(idx, 1);
  if (selectedEventSetIdx >= b.eventSets.length) selectedEventSetIdx = b.eventSets.length - 1;
  if (b.eventSets.length === 0) selectedEventSetIdx = -1;
  renderAll();
  setStatus(`Removed event set #${idx}`);
}

function addEvent() {
  const s = getCurrentEventSet();
  if (!s) return;
  s.events.push(makeDefaultEvent());
  renderSetDetail();
  setStatus('Added new event');
}

function pasteEvent() {
  const s = getCurrentEventSet();
  if (!s || !copiedEvent) return;
  const copy = JSON.parse(JSON.stringify(copiedEvent));
  denormalizeEvent(copy);
  s.events.push(copy);
  renderSetDetail();
  setStatus('Pasted event');
}

function setAllCards(collapsed) {
  const s = getCurrentEventSet();
  if (!s) return;
  document.querySelectorAll('.event-card').forEach(c => {
    const idx = parseInt(c.dataset.evIdx);
    c.classList.toggle('collapsed', collapsed);
    if (s.events[idx]) s.events[idx]._collapsed = collapsed;
  });
}

function removeEvent(evIdx) {
  const s = getCurrentEventSet();
  if (!s) return;
  s.events.splice(evIdx, 1);
  renderSetDetail();
  setStatus('Removed event');
}

function duplicateEvent(evIdx) {
  const s = getCurrentEventSet();
  if (!s) return;
  const copy = JSON.parse(JSON.stringify(s.events[evIdx]));
  const isSpawn = !!copy._spawnEnabled;
  const offset = isSpawn ? (s.events[evIdx]._spawnInterval || 30) : 30;
  copy.tic = (s.events[evIdx].tic || 0) + offset;
  s.events.splice(evIdx + 1, 0, copy);
  renderSetDetail();
  setStatus('Duplicated event #' + (evIdx + 1));
}

function moveEvent(evIdx, delta) {
  const s = getCurrentEventSet();
  if (!s) return;
  const target = evIdx + delta;
  if (target < 0 || target >= s.events.length) return;
  const tmp = s.events[evIdx];
  s.events[evIdx] = s.events[target];
  s.events[target] = tmp;
  renderSetDetail();
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
