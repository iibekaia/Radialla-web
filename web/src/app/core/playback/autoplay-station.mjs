/** Select only browser-playable streams; nearest first when a location is available. */
export function autoplayStation(stations, location) {
  let best,
    distance = Infinity;
  for (const station of stations) {
    try {
      if (new URL(station.streamUrl).protocol !== 'https:') continue;
    } catch {
      continue;
    }
    if (!location) {
      return station;
    }
    if (!Number.isFinite(station.latitude) || !Number.isFinite(station.longitude)) continue;
    const radians = Math.PI / 180;
    const lat = (station.latitude - location.latitude) * radians;
    const lon = (station.longitude - location.longitude) * radians;
    const d =
      Math.sin(lat / 2) ** 2 +
      Math.cos(station.latitude * radians) *
        Math.cos(location.latitude * radians) *
        Math.sin(lon / 2) ** 2;
    if (d < distance) {
      distance = d;
      best = station;
    }
  }
  return best;
}
