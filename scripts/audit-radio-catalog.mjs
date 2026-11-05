import { readFile, writeFile } from 'node:fs/promises';
import { normalizeStation, RADIO_HOSTS } from '../web/src/app/core/catalog/radio-browser.mjs';
import { mapLocation } from '../web/src/app/shared/stations/map-location.mjs';
import { stationInArea } from '../web/src/app/shared/stations/station-area.mjs';
const countries = JSON.parse(
  await readFile(new URL('../web/src/app/shared/data/countries.json', import.meta.url), 'utf8'),
);
const rows = [];
const limit = 5000;
for (let offset = 0; ; ) {
  let page;
  for (const host of RADIO_HOSTS) {
    try {
      const url = new URL(`https://${host}/json/stations/search`);
      url.search = new URLSearchParams({
        hidebroken: 'true',
        order: 'name',
        limit: String(limit),
        offset: String(offset),
      });
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      page = await response.json();
      if (!Array.isArray(page)) throw Error('Invalid catalog');
      break;
    } catch (error) {
      console.error(`${host}: ${error.message}`);
    }
  }
  if (!page) throw Error(`Incomplete audit at offset ${offset}`);
  rows.push(...page);
  console.error(`Read ${rows.length} rows`);
  offset += page.length;
  if (page.length < limit) break;
}
const groups = new Map();
const unplaced = [];
const outsideCountryBounds = [];
let invalid = 0;
const unique = new Map(rows.map((raw) => [raw.stationuuid, raw]));
for (const raw of unique.values()) {
  const station = normalizeStation(raw);
  if (!station) {
    invalid++;
    continue;
  }
  const matchedCountry = countries.find((c) =>
    station.countryCode ? c.code === station.countryCode : c.name === station.country,
  );
  const key = matchedCountry?.code || station.countryCode || station.country || '(unknown)';
  const group = groups.get(key) || {
    code: key,
    name: station.country,
    total: 0,
    precise: 0,
    approximate: 0,
    unplaced: 0,
  };
  group.total++;
  const location = mapLocation(station, countries);
  if (!location) {
    group.unplaced++;
    unplaced.push({
      id: station.id,
      name: station.name,
      country: station.country,
      countryCode: station.countryCode,
    });
  } else {
    group[location.approximate ? 'approximate' : 'precise']++;
    const country = countries.find((c) => c.code === station.countryCode);
    if (country && location.approximate) {
      const [west, south, east, north] = country.bounds;
      if (!stationInArea(location, { west, south, east, north }))
        outsideCountryBounds.push({ id: station.id, code: country.code });
    }
  }
  groups.set(key, group);
}
const byCountry = [...groups.values()].sort((a, b) => a.code.localeCompare(b.code));
const report = {
  checkedAt: new Date().toISOString(),
  rawRows: rows.length,
  uniqueRows: unique.size,
  invalid,
  byCountry,
  unplaced,
  outsideCountryBounds,
};
const output = process.argv[2];
if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      ...report,
      byCountry: undefined,
      unplaced: undefined,
      outsideCountryBounds: undefined,
      countries: byCountry.filter((g) => countries.some((c) => c.code === g.code)).length,
      fullyApproximate: byCountry.filter(
        (g) => g.precise === 0 && g.approximate > 0 && countries.some((c) => c.code === g.code),
      ),
      totals: byCountry.reduce(
        (sum, c) => ({
          total: sum.total + c.total,
          precise: sum.precise + c.precise,
          approximate: sum.approximate + c.approximate,
          unplaced: sum.unplaced + c.unplaced,
        }),
        { total: 0, precise: 0, approximate: 0, unplaced: 0 },
      ),
      unplacedExamples: unplaced.slice(0, 12),
      outsideCountryBoundsCount: outsideCountryBounds.length,
    },
    null,
    2,
  ),
);
