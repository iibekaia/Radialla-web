import { fetchRadioPage, fetchCountryCounts } from './radio-browser.mjs';

export function validStationCatalog(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (station) =>
        station &&
        typeof station.id === 'string' &&
        station.id.length > 0 &&
        typeof station.name === 'string' &&
        station.name.trim().length > 0 &&
        typeof station.country === 'string' &&
        typeof station.genre === 'string' &&
        typeof station.frequency === 'string' &&
        (station.streamUrl === null || typeof station.streamUrl === 'string'),
    )
  );
}

export function createLiveIndex(countries, regions, counts = null, now = Date.now()) {
  const byCode = new Map(counts?.map((c) => [c.code, c.count]));
  return {
    version: 2,
    generatedAt: counts ? new Date(now).toISOString() : '',
    countries: countries.map((country) => {
      const point = country.capital || country;
      const count = counts ? byCode.get(country.code) || 0 : -1;
      const boxes = regions[country.code] || [];
      const bounds = country.bounds;
      // Retain local country coverage and add offshore parts; avoid world-spanning
      // bounding boxes (for example Russia across the date line).
      const coverage = bounds[2] - bounds[0] <= 180 ? [...boxes, bounds] : boxes;
      return {
        code: country.code,
        name: country.name,
        count,
        latitude: point.latitude,
        longitude: point.longitude,
        cacheKey: `${country.code}:${count < 0 ? 'unknown' : count}`,
        regions: coverage.length ? coverage : [bounds],
      };
    }),
  };
}

export async function fetchLiveIndex(countries, regions, fetcher = fetch, signal) {
  return createLiveIndex(countries, regions, await fetchCountryCounts(fetcher, signal));
}

export async function fetchCountryStations(code, fetcher = fetch, signal) {
  if (!/^[A-Z]{2}$/.test(code)) throw Error('Invalid country code');
  const stations = new Map();
  for (let offset = 0; ; ) {
    const page = await fetchRadioPage(offset, 1000, code, fetcher, signal);
    for (const station of page.stations) {
      station.countryCode = code;
      stations.set(station.id, station);
    }
    offset += page.count;
    if (page.count < 1000) return [...stations.values()];
  }
}
