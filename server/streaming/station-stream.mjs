export async function resolveStationStream(id, signal) {
  let station;
  for (const host of ['de1.api.radio-browser.info', 'nl1.api.radio-browser.info']) {
    try {
      const response = await fetch(
        `https://${host}/json/stations/byuuid/${encodeURIComponent(id)}`,
        { signal, headers: { 'User-Agent': 'Radialla-Web/0.1' } },
      );
      if (!response.ok) continue;
      const rows = await response.json();
      station = Array.isArray(rows) ? rows.find((s) => s.stationuuid === id) : null;
      if (station) break;
    } catch {
      signal.throwIfAborted();
    }
  }
  return station?.url_resolved || station?.url || null;
}
