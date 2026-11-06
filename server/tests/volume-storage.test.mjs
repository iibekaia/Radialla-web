import test from 'node:test';
import assert from 'node:assert/strict';
import { readVolume, writeVolume } from '../../web/src/app/core/storage/volume.mjs';

test('volume and mute preferences round-trip; invalid or unavailable storage uses defaults', () => {
  let saved = null;
  const storage = () => ({
    getItem: () => saved,
    setItem: (_, value) => {
      saved = value;
    },
  });
  assert.deepEqual(readVolume(storage), { volume: 1, muted: false });
  writeVolume(0.35, true, storage);
  assert.deepEqual(readVolume(storage), { volume: 0.35, muted: true });
  writeVolume(0, false, storage);
  assert.deepEqual(readVolume(storage), { volume: 0, muted: false });
  for (const value of [
    '{',
    'null',
    '{"volume":2,"muted":false}',
    '{"volume":"0.5","muted":true}',
    '{"volume":0.5}',
  ]) {
    saved = value;
    assert.deepEqual(readVolume(storage), { volume: 1, muted: false });
  }
  const blocked = () => {
    throw Error('Storage blocked');
  };
  assert.deepEqual(readVolume(blocked), { volume: 1, muted: false });
  assert.doesNotThrow(() => writeVolume(0.4, false, blocked));
});
