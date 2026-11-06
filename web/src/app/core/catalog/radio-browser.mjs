export const RADIO_HOSTS = ['de1.api.radio-browser.info', 'nl1.api.radio-browser.info'];
export function normalizeStation(raw) {
  if (
    !raw ||
    typeof raw.stationuuid !== 'string' ||
    !raw.stationuuid ||
    typeof raw.name !== 'string' ||
    !raw.name.trim()
  )
    return null;
  const latitude = raw.geo_lat,
    longitude = raw.geo_long;
  const hasCoordinates =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;
  let streamUrl = null;
  try {
    const url = new URL(raw.url_resolved || raw.url);
    if (['https:', 'http:'].includes(url.protocol)) streamUrl = url.href;
  } catch {}
  let imageUrl = null;
  try {
    const url = new URL(raw.favicon);
    if (['https:', 'http:'].includes(url.protocol)) imageUrl = url.href;
  } catch {}
  const match =
    raw.name.match(/\b(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:FM|MHz)\b/i) ||
    raw.name.match(/\bFM\s*(\d{2,3}(?:[.,]\d{1,2})?)/i);
  const frequency =
    match && Number(match[1].replace(',', '.')) >= 65 && Number(match[1].replace(',', '.')) <= 108
      ? match[1].replace(',', '.')
      : '';
  return {
    id: raw.stationuuid,
    name: raw.name.trim(),
    countryCode:
      typeof raw.countrycode === 'string' && /^[A-Z]{2}$/.test(raw.countrycode)
        ? raw.countrycode
        : undefined,
    country: typeof raw.country === 'string' ? raw.country : '',
    genre: typeof raw.tags === 'string' ? raw.tags.split(',').slice(0, 2).join(', ') : '',
    frequency,
    streamUrl,
    imageUrl,
    ...(hasCoordinates ? { latitude, longitude } : {}),
  };
}
async function radioJson(path, parameters, fetcher, signal, parse = (rows) => rows) {
  let lastError;
  for (const host of RADIO_HOSTS) {
    const url = new URL(`https://${host}/json/${path}`);
    url.search = new URLSearchParams(parameters).toString();
    try {
      if (signal?.aborted) throw signal.reason || Error('Aborted');
      const timeout = AbortSignal.timeout(20000);
      const response = await fetcher(url.href, {
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw Error('HTTP ' + response.status);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw Error('Invalid radio catalog');
      return parse(rows);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export async function fetchRadioPage(offset, limit = 500, country, fetcher = fetch, signal) {
  const rows = await radioJson(
    'stations/search',
    {
      hidebroken: 'true',
      order: 'name',
      limit: String(limit),
      offset: String(offset),
      ...(country ? { countrycode: country } : {}),
    },
    fetcher,
    signal,
  );
  return { stations: rows.map(normalizeStation).filter(Boolean), count: rows.length };
}

export async function fetchCountryCounts(fetcher = fetch, signal) {
  return radioJson('countrycodes', { hidebroken: 'true', limit: '1000' }, fetcher, signal, (rows) =>
    rows.map((row) => {
      const code = typeof row?.name === 'string' ? row.name.trim().toUpperCase() : '';
      const value = row?.stationcount;
      const count =
        typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))
          ? Number(value)
          : NaN;
      if (!/^[A-Z]{2}$/.test(code) || !Number.isSafeInteger(count) || count < 0)
        throw Error('Invalid country counts');
      return { code, count };
    }),
  );
}

export async function fetchRadioStation(id, fetcher = fetch, signal) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return null;
  const rows = await radioJson(`stations/byuuid/${encodeURIComponent(id)}`, {}, fetcher, signal);
  return rows.map(normalizeStation).find((station) => station?.id === id) || null;
}
