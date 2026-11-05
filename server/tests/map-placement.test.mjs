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

test('every supported country has a fallback marker visible in its focused map bounds', () => {
  for (const country of countries) {
    const station = Object.freeze({ countryCode: country.code });
    const location = mapLocation(station, countries);
    const [west, south, east, north] = country.bounds;
    assert.equal(location.approximate, true, country.code);
    assert.ok(Math.abs(location.latitude) <= 85, country.code);
    assert.ok(Math.abs(location.longitude) <= 180, country.code);
    assert.equal(stationInArea(location, { west, south, east, north }), true, country.code);
    assert.equal(
      stationInArea(location, { west: west + 360, south, east: east + 360, north }),
      true,
      country.code,
    );
  }
});

test('missing coordinates default to bundled capitals rather than country centers', () => {
  for (const country of countries.filter((c) => c.capital)) {
    const station = Object.freeze({ countryCode: country.code, latitude: null, longitude: null });
    const location = mapLocation(station, countries);
    assert.deepEqual(
      location,
      {
        latitude: country.capital.latitude,
        longitude: country.capital.longitude,
        approximate: true,
        capital: country.capital.name,
      },
      country.code,
    );
    assert.equal(station.latitude, null);
    assert.equal(station.longitude, null);
  }
  const tashkent = mapLocation({ countryCode: 'UZ' }, countries);
  assert.equal(tashkent.capital, 'Tashkent');
  assert.ok(tashkent.latitude > 41 && tashkent.latitude < 42);
  assert.ok(tashkent.longitude > 69 && tashkent.longitude < 70);
  assert.equal(mapLocation({ countryCode: 'TM' }, countries).capital, 'Ashgabat');
  assert.equal(mapLocation({ countryCode: 'LK' }, countries).capital, 'Sri Jayewardenepura Kotte');
  assert.equal(mapLocation({ country: 'Uzbekistan' }, countries).capital, 'Tashkent');
});

test('areas without a capital retain explicitly approximate area markers', () => {
  assert.deepEqual(
    countries.filter((c) => !c.capital).map((c) => c.code),
    ['AQ', 'BV', 'HM', 'UM'],
  );
  for (const code of ['AQ', 'BV', 'HM', 'UM']) {
    const location = mapLocation({ countryCode: code }, countries);
    assert.equal(location.approximate, true);
    assert.equal(location.capital, undefined);
  }
});
