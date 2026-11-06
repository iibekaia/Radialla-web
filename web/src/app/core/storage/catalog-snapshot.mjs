/** Bound localStorage usage; retain favorite metadata and the most recently loaded countries. */
export function compactCatalogSnapshot(snapshot, pinnedIds = [], maxBytes = 3_000_000) {
  const pinned = new Set(pinnedIds);
  const stations = new Map();
  const countries = {};
  const size = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
  let bytes = size(snapshot.index) + 1024;
  const add = (station, force = false) => {
    if (stations.has(station.id)) return;
    const cost = size(station) + 1;
    if (force || bytes + cost <= maxBytes) {
      stations.set(station.id, station);
      bytes += cost;
    }
  };
  for (const station of snapshot.stations)
    if (pinned.has(station.id) || station.duplicateIds?.some((id) => pinned.has(id)))
      add(station, true);
  const groups = new Map();
  for (const station of snapshot.stations) {
    const code =
      station.countryCode ||
      snapshot.index?.countries.find((c) => c.name === station.country)?.code;
    const group = groups.get(code) || [];
    group.push(station);
    groups.set(code, group);
  }
  const retained = new Set();
  for (const [file, timestamp] of Object.entries(snapshot.countries).sort((a, b) => b[1] - a[1])) {
    const code = file.slice(0, 2);
    if (retained.has(code)) continue;
    const group = groups.get(code) || [];
    const cost =
      group.reduce((n, s) => n + (stations.has(s.id) ? 0 : size(s) + 1), 0) + file.length + 32;
    if (bytes + cost > maxBytes) continue;
    for (const station of group) add(station);
    countries[file] = timestamp;
    retained.add(code);
    bytes += file.length + 32;
  }
  // Legacy cached stations can still provide an offline catalog after migration.
  for (const station of snapshot.stations) add(station);
  return { version: 3, stations: [...stations.values()], countries, index: snapshot.index };
}
