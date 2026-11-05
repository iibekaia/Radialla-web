import test from 'node:test';
import assert from 'node:assert/strict';
import { stationInArea } from '../../web/src/app/shared/stations/station-area.mjs';

const tbilisi = { south: 41, north: 42, west: 44, east: 45 };
test('area lists exclude stations with missing or unsupported coordinates', () => {
  for (const station of [
    {},
    { latitude: null, longitude: null },
    { latitude: 41.7, longitude: NaN },
    { latitude: 86, longitude: 44.8 },
    { latitude: 41.7, longitude: 181 },
  ])
    assert.equal(stationInArea(station, tbilisi), false);
  assert.equal(stationInArea({}, null), true);
});
test('zooming into an area excludes stations outside its bounds', () => {
  assert.equal(stationInArea({ latitude: 41.7, longitude: 44.8 }, tbilisi), true);
  assert.equal(stationInArea({ latitude: 48.8, longitude: 2.3 }, tbilisi), false);
});
test('area matching supports antimeridian and wrapped map views', () => {
  const station = { latitude: 10, longitude: -175 };
  assert.equal(stationInArea(station, { south: 0, north: 20, west: 170, east: 190 }), true);
  assert.equal(stationInArea(station, { south: 0, north: 20, west: -190, east: -170 }), true);
});
