const text = (value) => (value || '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
const coordinates = (s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude);
function streamKey(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}
function compatible(a, b) {
  if (a.frequency && b.frequency && a.frequency !== b.frequency) return false;
  // Same-name regional stations remain separate when both locations are known.
  return (
    !coordinates(a) ||
    !coordinates(b) ||
    (Math.abs(a.latitude - b.latitude) < 0.2 && Math.abs(a.longitude - b.longitude) < 0.2)
  );
}

/** Collapse catalog aliases for display while retaining every original playback/favorite ID. */
export function deduplicateStations(stations, favoriteIds = [], activeId, countries = []) {
  const countryCodes = new Map(countries.map((c) => [text(c.name), c.code]));
  const favorites = new Set(favoriteIds);
  const groups = new Set();
  const parents = new Map();
  const root = (group) => {
    while (parents.has(group)) group = parents.get(group);
    return group;
  };
  const ids = new Map(),
    streams = new Map(),
    names = new Map();
  for (const station of stations) {
    const country =
      station.countryCode?.toUpperCase() ||
      countryCodes.get(text(station.country)) ||
      text(station.country);
    const stream = streamKey(station.streamUrl);
    const streamId = stream ? JSON.stringify([country, stream]) : '';
    const nameId =
      country && text(station.name) ? JSON.stringify([country, text(station.name)]) : '';
    let group = root(ids.get(station.id) || (streamId && streams.get(streamId)));
    const candidates = [...new Set((names.get(nameId) || []).map(root))];
    for (const candidate of candidates) {
      if (candidate === group || !candidate.every((s) => compatible(s, station))) continue;
      if (!group) group = candidate;
      else if (candidate.every((a) => group.every((b) => compatible(a, b)))) {
        group.push(...candidate);
        parents.set(candidate, group);
        groups.delete(candidate);
      }
    }
    if (!group) {
      group = [];
      groups.add(group);
    }
    group.push(station);
    ids.set(station.id, group);
    if (streamId) streams.set(streamId, group);
    if (nameId) {
      const candidates = names.get(nameId) || [];
      if (!candidates.includes(group)) candidates.push(group);
      names.set(nameId, candidates);
    }
  }
  const rank = (s) =>
    (s.id === activeId ? 100 : 0) +
    (favorites.has(s.id) ? 50 : 0) +
    (s.streamUrl?.startsWith('https:') ? 8 : s.streamUrl ? 4 : 0) +
    (coordinates(s) ? 2 : 0) +
    (s.imageUrl ? 1 : 0);
  return [...groups].map((group) => {
    const selected = group.reduce((best, s) => (rank(s) > rank(best) ? s : best));
    const duplicateIds = [...new Set(group.flatMap((s) => [s.id, ...(s.duplicateIds || [])]))];
    return duplicateIds.length === 1 ? selected : { ...selected, duplicateIds };
  });
}

export function stationIsFavorite(station, ids) {
  return [station.id, ...(station.duplicateIds || [])].some((id) => ids.includes(id));
}

export function toggleStationFavorite(ids, station) {
  const aliases = new Set([station.id, ...(station.duplicateIds || [])]);
  return stationIsFavorite(station, ids)
    ? ids.filter((id) => !aliases.has(id))
    : [...ids, station.id];
}
