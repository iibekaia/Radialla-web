export const CATALOG_TTL = 15 * 60 * 1000;
export const INDEX_TTL = 5 * 60 * 1000;
export function freshTimestamp(timestamp, ttl, now = Date.now()) {
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp < ttl;
}
export function validCatalogIndex(value) {
  return (
    value?.version === 2 &&
    typeof value.generatedAt === 'string' &&
    (value.generatedAt === '' || Number.isFinite(Date.parse(value.generatedAt))) &&
    Array.isArray(value.countries) &&
    value.countries.every(
      (c) =>
        c &&
        /^[A-Z]{2}$/.test(c.code) &&
        typeof c.name === 'string' &&
        Number.isInteger(c.count) &&
        c.count >= -1 &&
        Number.isFinite(c.latitude) &&
        Math.abs(c.latitude) <= 90 &&
        Number.isFinite(c.longitude) &&
        Math.abs(c.longitude) <= 180 &&
        c.cacheKey === `${c.code}:${c.count < 0 ? 'unknown' : c.count}` &&
        Array.isArray(c.regions) &&
        c.regions.length > 0 &&
        c.regions.every(
          (box) =>
            Array.isArray(box) &&
            box.length === 4 &&
            box.every(Number.isFinite) &&
            box[0] >= -180 &&
            box[2] <= 180 &&
            box[0] <= box[2] &&
            box[1] >= -90 &&
            box[3] <= 90 &&
            box[1] <= box[3],
        ),
    )
  );
}
export function overviewArea(area) {
  return !area || area.east - area.west > 55 || area.north - area.south > 35;
}
export function countriesInArea(entries, area) {
  if (!area || overviewArea(area)) return [];
  return entries.filter(
    (entry) =>
      entry.count !== 0 &&
      entry.regions.some(([west, south, east, north]) => {
        if (south > area.north || north < area.south) return false;
        const shift = 360 * Math.round(((area.west + area.east) / 2 - (west + east) / 2) / 360);
        return west + shift <= area.east && east + shift >= area.west;
      }),
  );
}

/** Debounces navigation, bounds concurrency and cancels countries no longer needed. */
export class ViewportCatalogLoader {
  constructor(callbacks, timers = globalThis, delay = 350) {
    this.callbacks = callbacks;
    this.timers = timers;
    this.delay = delay;
    this.active = new Map();
    this.wanted = [];
    this.timer = null;
    this.destroyed = false;
    this.failed = new Set();
  }
  update(entries) {
    if (this.destroyed) return;
    this.wanted = entries;
    this.failed = new Set();
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
    const keys = new Set(entries.map((e) => e.cacheKey));
    for (const [key, controller] of this.active) if (!keys.has(key)) controller.abort();
    this.callbacks.loading(entries.some((e) => !this.callbacks.isCached(e)));
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.drain();
    }, this.delay);
  }
  drain() {
    if (this.destroyed || this.timer !== null) return;
    for (const entry of this.wanted) {
      if (this.active.size >= 2) break;
      if (this.active.has(entry.cacheKey) || this.failed.has(entry.cacheKey)) continue;
      if (this.callbacks.isCached(entry)) continue;
      const controller = new AbortController();
      this.active.set(entry.cacheKey, controller);
      void this.callbacks
        .fetch(entry, controller.signal)
        .then((stations) => {
          if (this.destroyed || controller.signal.aborted) return;
          this.callbacks.received(entry, stations);
        })
        .catch(() => {
          // Fail once per navigation; a new selection can retry without a tight retry loop.
          if (!controller.signal.aborted && !this.destroyed) {
            this.failed.add(entry.cacheKey);
            this.callbacks.failed();
          }
        })
        .finally(() => {
          this.active.delete(entry.cacheKey);
          if (!this.destroyed) {
            this.drain();
            this.callbacks.loading(
              this.active.size > 0 ||
                this.wanted.some(
                  (e) => !this.failed.has(e.cacheKey) && !this.callbacks.isCached(e),
                ),
            );
          }
        });
    }
    this.callbacks.loading(this.active.size > 0);
  }
  destroy() {
    this.destroyed = true;
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    for (const controller of this.active.values()) controller.abort();
    this.callbacks.loading(false);
  }
}
