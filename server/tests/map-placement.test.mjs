import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mapLocation } from '../../web/src/app/shared/stations/map-location.mjs';
import { stationInArea } from '../../web/src/app/shared/stations/station-area.mjs';
const countries = JSON.parse(
  await readFile(new URL('../../web/src/app/shared/data/countries.json', import.meta.url), 'utf8'),
);

test('stations without coordinates appear within their country map bounds without changing catalog data', () => {
  for (const countryCode of ['UZ', 'TM']) {
    const station = Object.freeze({
      id: countryCode,
      countryCode,
      latitude: undefined,
      longitude: undefined,
    });
    const country = countries.find((c) => c.code === countryCode);
    const location = mapLocation(station, countries);
    assert.equal(location.approximate, true);
    const [west, south, east, north] = country.bounds;
    assert.equal(stationInArea(location, { west, south, east, north }), true);
    assert.equal(stationInArea(location, { west: -10, south: -10, east: 10, north: 10 }), false);
    assert.equal(station.latitude, undefined);
    assert.equal(station.longitude, undefined);
  }
});

test('precise positions are preserved and unknown countries do not invent a map position', () => {
  assert.deepEqual(mapLocation({ latitude: 41, longitude: 69, countryCode: 'UZ' }, countries), {
    latitude: 41,
    longitude: 69,
    approximate: false,
  });
  assert.equal(mapLocation({ countryCode: 'XX' }, countries), null);
  assert.equal(mapLocation({}, countries), null);
  assert.equal(mapLocation({ countryCode: 'XX', country: 'Uzbekistan' }, countries), null);
  assert.equal(mapLocation({ country: 'Uzbekistan' }, countries).approximate, true);
  assert.equal(
    mapLocation({ countryCode: 'uz', latitude: NaN, longitude: 200 }, countries).approximate,
    true,
  );
});
