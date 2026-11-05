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
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
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
    latitude,
    longitude,
  };
}
export async function fetchRadioPage(offset, limit = 500, country, fetcher = fetch) {
  let lastError;
  for (const host of RADIO_HOSTS) {
    const url = new URL(`https://${host}/json/stations/search`);
    url.search = new URLSearchParams({
      hidebroken: 'true',
      has_geo_info: 'true',
      order: 'name',
      limit: String(limit),
      offset: String(offset),
      ...(country ? { countrycode: country } : {}),
    }).toString();
    try {
      const response = await fetcher(url.href, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Error('HTTP ' + response.status);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw Error('Invalid radio catalog');
      return { stations: rows.map(normalizeStation).filter(Boolean), count: rows.length };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
