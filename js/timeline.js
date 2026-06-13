// BlockRunner plays back per-block timed events. A block is a list of
// bgPortions (visual) and event sets (gameplay). Wave blocks award a
// bonus on clear; waveless blocks don't.
//
// Schema:
//   block:
//     kind:        'wave' | 'waveless'
//     startBonus?: number  (only for kind: 'wave')
//     decay?:      number  (only for kind: 'wave'; points/tic)
//     bgPortions:   [{ file, appearances }, ...]
//     eventSets:    [{ quota, events: [...] }, ...]
//   event:
//     tic:         number (mandatory; relative to the event set's start tic)
//     spawn:       [className, params?]   (calls callbacks.spawn)
//     speed:       {value, transitionTime?, easing?}  (calls callbacks.speed)
//     broadcast:   string (emits via the event bus)
//     _disabled:   boolean (editor flag)
//
// On init() each event gets a generated `_id` so re-init is deterministic.
//
// The runner tracks the current block, the current event set within it,
// the block's quota (how many enemies left), and a wave bonus accumulator.
// The scene drives the per-tic `fire` and the per-event-set advance
// logic.

class BlockRunner {
  constructor() {
    this.blockData = [];
    this.currentBlockIdx = -1;
    this.currentBlock = null;
    this.currentEventSetIdx = -1;
    this.currentEventSet = null;
    this.currentEventSetStartTic = 0;
    this.firedEvents = new Set();
    // Wave state for the current block (only set if kind === 'wave'):
    //   { startTic, startBonus, decay, killScore, quotaRemaining }
    this.wave = null;
    this.events = null;
  }

  init(blockData) {
    this.blockData = blockData;
    this.blockData.forEach((block, bi) => {
      (block.eventSets || []).forEach((es, ei) => {
        (es.events || []).forEach((ev, k) => {
          ev._id = `${bi}-${ei}-${k}`;
        });
        // Quota is taken from the explicit `quota` field on the event
        // set. If absent, the engine can still derive it from spawn
        // events.
        if (es.quota === undefined) {
          es.quota = this._computeQuota(es);
        }
      });
    });
  }

  // Count the number of enemies that will be spawned by this event set's
  // events. Reads `spawn` events with `spawnCount` and `spawnInterval`
  // for multi-spawn groups.
  _computeQuota(es) {
    let total = 0;
    for (const ev of (es.events || [])) {
      if (ev._disabled || !ev.spawn) continue;
      total += ev.spawnCount || 1;
    }
    return total;
  }

  // Move to a specific block index. The caller passes the engine's
  // current tic so the wave (if any) can stamp its start.
  change(blockIdx, currentTic) {
    this.currentBlockIdx = blockIdx;
    this.currentBlock = this.blockData[blockIdx] || null;
    this.currentEventSetIdx = -1;
    this.firedEvents = new Set();
    this._enterEventSet(0, currentTic);
  }

  // Advance to the next event set within the current block. If the
  // block has no more event sets, returns false (caller advances to
  // the next block).
  advanceEventSet(currentTic) {
    if (!this.currentBlock) return false;
    const nextIdx = this.currentEventSetIdx + 1;
    if (nextIdx >= this.currentBlock.eventSets.length) return false;
    this._enterEventSet(nextIdx, currentTic);
    return true;
  }

  // End the current event set, returning its quota delta (enemies
  // killed/escaped during it). The engine emits any wave bonus, then
  // advances to the next event set.
  endEventSet() {
    // Quota on the current event set is whatever remains; caller
    // compares against quota to know if it was cleared.
    if (this.currentEventSet) {
      return this.currentEventSet.quota;
    }
    return 0;
  }

  _enterEventSet(idx, currentTic) {
    this.currentEventSetIdx = idx;
    this.currentEventSet = this.currentBlock?.eventSets?.[idx] || null;
    this.currentEventSetStartTic = currentTic;
    this.firedEvents = new Set();
  }

  // Returns true if the current event set's quota has been met (all
  // enemies killed or escaped).
  isEventSetClear() {
    if (!this.currentEventSet) return true;
    return this.currentEventSet.quota <= 0;
  }

  // Fire events whose tic has been reached in the current event set.
  fire(tic, callbacks) {
    if (!this.currentEventSet) return;
    const elapsedTic = tic - this.currentEventSetStartTic;

    this.currentEventSet.events.forEach(ev => {
      if (this.firedEvents.has(ev._id)) return;
      if (ev.tic === undefined) return;
      if (ev._disabled) return;
      if (elapsedTic < ev.tic) return;
      this.firedEvents.add(ev._id);
      if (ev.spawn && callbacks.spawn) callbacks.spawn([ev.spawn], ev);
      if (ev.speed && callbacks.speed) callbacks.speed(ev.speed);
      if (ev.broadcast && this.events) this.events.emit('broadcast', ev.broadcast);
    });
  }

  // Decrement the current event set's quota by `amount` (e.g. 1 per
  // enemy killed or escaped).
  decrementQuota(amount) {
    if (this.currentEventSet) this.currentEventSet.quota -= amount;
  }

  // Wave state management. The engine calls these to track the active
  // wave within the current block.
  startWave(block, currentTic) {
    if (block.kind !== 'wave') {
      this.wave = null;
      return;
    }
    this.wave = {
      startTic: currentTic,
      startBonus: block.startBonus || 0,
      decay: block.decay || 0,
      killScore: 0,
    };
  }

  addWaveKillScore(amount) {
    if (this.wave) this.wave.killScore += amount;
  }

  // Compute the current wave's bonus value at the current tic.
  // Returns the value (0 or positive). If the wave has cleared, the
  // caller can use the resulting value directly.
  computeWaveBonus(currentTic) {
    if (!this.wave) return 0;
    const elapsed = currentTic - this.wave.startTic;
    const raw = this.wave.startBonus + this.wave.killScore - this.wave.decay * elapsed;
    return Math.max(0, Math.round(raw));
  }

  endWave() {
    this.wave = null;
  }
}

export default BlockRunner;
