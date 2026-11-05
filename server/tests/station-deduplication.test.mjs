import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deduplicateStations,
  stationIsFavorite,
  toggleStationFavorite,
} from '../../web/src/app/core/catalog/station-deduplication.mjs';
import {
  filterStations,
  adjacentStation,
  startupStation,
} from '../../web/src/app/features/explorer/station-selection.mjs';
const station = (id, extra = {}) => ({
  id,
  name: 'Mutant Radio',
  countryCode: 'GE',
  country: 'Georgia',
  frequency: '',
  genre: '',
  streamUrl: 'https://listen.radioking.com/radio/282820/stream/328621',
  ...extra,
});

test('three Mutant Radio UUIDs sharing one stream produce one list/map/queue entry', () => {
  const input = [
    'e6966fa8-8fa6-49fc-bc37-0de3763ba6ad',
    'f040eba8-1cef-45e7-a20d-8134bb5ea7e8',
    'e81caf1f-5049-48ad-99b7-b5ebdd03d3f3',
  ].map((id) => Object.freeze(station(id)));
  const result = deduplicateStations(input);
  assert.equal(result.length, 1);
  assert.deepEqual(
    result[0].duplicateIds,
    input.map((s) => s.id),
  );
  assert.equal(adjacentStation(result, result[0].id, 1).id, result[0].id);
  assert.equal(input[0].duplicateIds, undefined);
});

test('same-name alternative streams and whitespace variants collapse; prefer HTTPS with coordinates', () => {
  const result = deduplicateStations([
    station('old', {
      name: ' Qalbim   navosi ',
      countryCode: 'UZ',
      streamUrl: 'http://example.com/live',
    }),
    station('new', {
      name: 'qalbim navosi',
      countryCode: 'UZ',
      streamUrl: 'https://example.com/other',
      latitude: 41,
      longitude: 69,
    }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'new');
  assert.equal(result[0].latitude, 41);
});

test('distinct countries, frequencies, regional locations and named channels remain separate', () => {
  for (const extra of [
    { countryCode: 'FR' },
    { frequency: '104.3' },
    { latitude: 48, longitude: 2 },
    { name: 'Mutant Radio Jazz' },
    { streamUrl: 'https://example.com/live?channel=two', name: 'Other' },
  ]) {
    const input = [
      station('a', { frequency: '101.1', latitude: 41, longitude: 44 }),
      station('b', { ...extra, streamUrl: extra.streamUrl || 'https://other.example/live' }),
    ];
    assert.equal(deduplicateStations(input).length, 2, JSON.stringify(extra));
  }
  assert.equal(
    deduplicateStations([
      station('a', { countryCode: undefined, country: '' }),
      station('b', {
        countryCode: undefined,
        country: '',
        streamUrl: 'https://other.example/live',
      }),
    ]).length,
    2,
  );
});

test('later aliases bridge existing name/stream groups, including previously indexed aliases', () => {
  const result = deduplicateStations([
    station('a'),
    station('b', { name: 'Different name', streamUrl: 'https://other.example/live' }),
    station('bridge', { streamUrl: 'https://other.example/live' }),
    station('c'),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].duplicateIds.length, 4);
});

test('cached favorites and restored playback survive deduplication and unfavorite clears every alias', () => {
  const input = [station('first'), station('saved'), station('playing')];
  const result = deduplicateStations(input, ['saved'], 'playing');
  assert.equal(result[0].id, 'playing');
  assert.equal(stationIsFavorite(result[0], ['saved']), true);
  assert.equal(filterStations(result, undefined, ['saved']).length, 1);
  assert.deepEqual(toggleStationFavorite(['saved', 'first', 'unrelated'], result[0]), [
    'unrelated',
  ]);
  assert.deepEqual(toggleStationFavorite([], result[0]), ['playing']);
  assert.equal(startupStation(input, input[2], result, null).id, 'playing');
  assert.equal(deduplicateStations(input, ['saved'])[0].id, 'saved');
});

test('country names in older cache match country codes and stream paths/query remain case-sensitive', () => {
  const countries = [{ code: 'GE', name: 'Georgia' }];
  assert.equal(
    deduplicateStations(
      [station('a'), station('b', { countryCode: undefined })],
      [],
      undefined,
      countries,
    ).length,
    1,
  );
  const result = deduplicateStations([
    station('a', { name: 'Channel A', streamUrl: 'https://EXAMPLE.com:443/Live?channel=A' }),
    station('b', { name: 'Alias A', streamUrl: 'https://example.com/Live?channel=A#fragment' }),
    station('c', { name: 'Channel B', streamUrl: 'https://example.com/live?channel=B' }),
  ]);
  assert.equal(result.length, 2);
});
