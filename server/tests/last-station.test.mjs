import test from 'node:test';
import assert from 'node:assert/strict';
import { readLastStation, writeLastStation } from '../../web/src/app/core/storage/last-station.mjs';
const station = {
  id: 'station-id',
  name: 'Ucnobi FM',
  country: 'Georgia',
  genre: '',
  frequency: '',
  streamUrl: 'http://example.com/live',
};
function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}
test('last station survives a new visit independently of the catalog and favorites', () => {
  const storage = memory();
  storage.setItem('radialla.favorites', '["favorite"]');
  assert.equal(
    readLastStation(() => storage),
    null,
  );
  writeLastStation(station, () => storage);
  assert.deepEqual(
    readLastStation(() => storage),
    station,
  );
  writeLastStation({ ...station, id: 'next' }, () => storage);
  assert.equal(readLastStation(() => storage).id, 'next');
  assert.equal(storage.getItem('radialla.favorites'), '["favorite"]');
});
test('unplayable stations do not overwrite the last playable station', () => {
  const storage = memory();
  writeLastStation(station, () => storage);
  for (const streamUrl of [null, 'javascript:alert(1)', 'https://user:secret@example.com'])
    writeLastStation({ ...station, streamUrl }, () => storage);
  assert.deepEqual(
    readLastStation(() => storage),
    station,
  );
});
test('corrupt or blocked storage does not break playback', () => {
  const storage = memory();
  for (const value of ['broken', '{}', 'null', '[]']) {
    storage.setItem('radialla.lastStation', value);
    assert.equal(
      readLastStation(() => storage),
      null,
    );
  }
  const blocked = () => {
    throw Error('Storage blocked');
  };
  assert.equal(readLastStation(blocked), null);
  assert.doesNotThrow(() => writeLastStation(station, blocked));
});
