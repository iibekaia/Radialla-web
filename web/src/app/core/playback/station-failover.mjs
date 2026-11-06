export function canPlayStation(station, relayAvailable) {
  try {
    const url = new URL(station.streamUrl);
    if (url.username || url.password) return false;
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        relayAvailable &&
        /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(station.id))
    );
  } catch {
    return false;
  }
}

/** Move through the current queue after terminal stream errors, once per failed station. */
export class StationFailoverController {
  constructor(callbacks, timers = globalThis, delay = 3000) {
    this.callbacks = callbacks;
    this.timers = timers;
    this.delay = delay;
    this.failed = new Set();
    this.timer = null;
    this.pendingId = null;
    this.destroyed = false;
    this.generation = 0;
  }
  update(state) {
    if (this.destroyed) return;
    if (state.playing) this.failed.clear();
    if (!state.failed || !state.id) {
      this.cancel();
      return;
    }
    this.failed.add(state.id);
    if (this.timer !== null && this.pendingId === state.id) return;
    this.cancel();
    const generation = this.generation;
    this.pendingId = state.id;
    this.timer = this.timers.setTimeout(() => {
      if (this.destroyed || generation !== this.generation) return;
      this.timer = null;
      this.pendingId = null;
      const current = this.callbacks.state();
      if (this.destroyed || !current.failed || current.id !== state.id) return;
      const stations = this.callbacks.stations();
      const start = stations.findIndex((s) => s.id === state.id);
      for (let step = 1; step <= stations.length; step++) {
        const station = stations[(start + step) % stations.length];
        if (
          this.failed.has(station.id) ||
          !canPlayStation(station, this.callbacks.relayAvailable())
        )
          continue;
        this.callbacks.play(station);
        return;
      }
    }, this.delay);
  }
  cancel() {
    this.generation++;
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
    this.pendingId = null;
  }
  reset() {
    this.cancel();
    this.failed.clear();
  }
  destroy() {
    this.destroyed = true;
    this.reset();
  }
}
