import test from 'node:test';
import assert from 'node:assert/strict';
import { autoplayStation } from '../../web/src/app/core/playback/autoplay-station.mjs';
test('location autoplay chooses the nearest HTTPS stream, ignoring demo and HTTP-only entries', () => {
  const stations = [
    { id: 'demo', streamUrl: null, latitude: 41.7, longitude: 44.8 },
    { id: 'http', streamUrl: 'http://example.com', latitude: 41.7, longitude: 44.8 },
    { id: 'far', streamUrl: 'https://example.com/far', latitude: 48.8, longitude: 2.3 },
    { id: 'near', streamUrl: 'https://example.com/near', latitude: 41.72, longitude: 44.81 },
  ];
  assert.equal(autoplayStation(stations, { latitude: 41.7, longitude: 44.8 }).id, 'near');
  assert.equal(autoplayStation(stations, null).id, 'far');
  assert.equal(autoplayStation(stations.slice(0, 2), null), undefined);
  assert.equal(autoplayStation([], { latitude: 41.7, longitude: 44.8 }), undefined);
});
