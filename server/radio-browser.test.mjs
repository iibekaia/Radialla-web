import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStation, fetchRadioPage } from '../web/src/app/radio-browser.mjs';
const raw = {
  stationuuid: 'real-uuid',
  name: 'Radio 104.3 FM',
  country: 'Georgia',
  tags: 'jazz,pop,news',
  url_resolved: 'https://example.com/live',
  geo_lat: 41.7,
  geo_long: 44.8,
};
test('real catalog normalization preserves IDs, stream and coordinates without inventing frequencies', () => {
  const station = normalizeStation(raw);
  assert.equal(station.id, 'real-uuid');
  assert.equal(station.streamUrl, raw.url_resolved);
  assert.equal(station.latitude, 41.7);
  assert.equal(station.frequency, '104.3');
  assert.equal(normalizeStation({ ...raw, name: 'Jazz Radio' }).frequency, '');
  assert.equal(normalizeStation({ ...raw, geo_lat: null }), null);
  assert.equal(normalizeStation({ ...raw, geo_long: 181 }), null);
  assert.equal(normalizeStation({ ...raw, url_resolved: 'javascript:alert(1)' }).streamUrl, null);
});
test('pagination uses raw row count and fails over between mirrors', async () => {
  const requests = [];
  const result = await fetchRadioPage(500, 500, 'GE', async (url) => {
    requests.push(new URL(url));
    if (requests.length === 1) throw Error('offline');
    return { ok: true, json: async () => [raw, { ...raw, geo_lat: null }] };
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].hostname, 'nl1.api.radio-browser.info');
  assert.equal(requests[1].searchParams.get('offset'), '500');
  assert.equal(requests[1].searchParams.get('countrycode'), 'GE');
  assert.equal(requests[1].searchParams.get('has_geo_info'), 'true');
  assert.equal(result.count, 2);
  assert.equal(result.stations.length, 1);
});
test('invalid responses on both mirrors propagate a failure for local fallback', async () => {
  await assert.rejects(
    fetchRadioPage(0, 500, undefined, async () => ({
      ok: true,
      json: async () => ({ error: 'unavailable' }),
    })),
    /Invalid radio catalog/,
  );
});

test('station artwork preserves catalog photos and ignores missing or invalid URLs', () => {
  assert.equal(
    normalizeStation({ ...raw, favicon: 'https://example.com/logo.png' }).imageUrl,
    'https://example.com/logo.png',
  );
  assert.equal(
    normalizeStation({ ...raw, favicon: 'http://example.com/logo.png' }).imageUrl,
    'http://example.com/logo.png',
  );
  for (const favicon of [
    undefined,
    null,
    '',
    '/logo.png',
    'javascript:alert(1)',
    'data:image/png;base64,test',
  ]) {
    assert.equal(normalizeStation({ ...raw, favicon }).imageUrl, null);
  }
});
