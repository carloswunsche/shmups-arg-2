class EventBus {
  constructor() {
    this._listeners = {};
  }

  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  once(event, callback) {
    const off = this.on(event, (data) => {
      off();
      callback(data);
    });
    return off;
  }

  off(event, callback) {
    const list = this._listeners[event];
    if (!list) return;
    const i = list.indexOf(callback);
    if (i !== -1) list.splice(i, 1);
  }

  emit(event, data) {
    const list = this._listeners[event];
    if (!list || list.length === 0) return;
    // Snapshot so listeners can safely call on/off during emit
    const snapshot = list.slice();
    for (const cb of snapshot) {
      try {
        cb(data);
      } catch (err) {
        console.error(`[event-bus] listener for '${event}' threw:`, err);
      }
    }
  }

  clear(event) {
    if (event === undefined) this._listeners = {};
    else delete this._listeners[event];
  }
}

export default EventBus;
