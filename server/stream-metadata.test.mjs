import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  readIcyTrack,
  parseTrack,
  isPublicAddress,
  openPublicStream,
  createMetadataProvider,
} from './stream-metadata.mjs';
const id = '01234567-89ab-cdef-0123-456789abcdef';
function block(text) {
  const bytes = Buffer.from(text);
  const n = Math.ceil(bytes.length / 16);
  return Buffer.concat([Buffer.from([n]), bytes, Buffer.alloc(n * 16 - bytes.length)]);
}
test('ICY parsing survives every network chunk boundary, UTF-8 and apostrophes', async () => {
  const bytes = Buffer.concat([
    Buffer.from('abcd'),
    Buffer.from([0]),
    Buffer.from('abcd'),
    block("StreamTitle='Destiny's Child - სიმღერა';StreamUrl='';"),
  ]);
  for (let split = 1; split < bytes.length; split++) {
    const result = await readIcyTrack(
      Readable.from([bytes.subarray(0, split), bytes.subarray(split)]),
      4,
    );
    assert.deepEqual(result, { artist: "Destiny's Child", title: 'სიმღერა' });
  }
});
test('absent, empty, invalid, truncated or oversized metadata stays empty', async () => {
  assert.equal(await readIcyTrack(Readable.from([]), NaN), null);
  assert.equal(
    await readIcyTrack(Readable.from([Buffer.from('abcd'), block("StreamTitle='';")]), 4),
    null,
  );
  assert.equal(
    await readIcyTrack(Readable.from([Buffer.from('abcd'), Buffer.from([3, 1])]), 4),
    null,
  );
  assert.equal(await readIcyTrack(Readable.from([Buffer.alloc(100)]), 4, 50), null);
  assert.deepEqual(parseTrack('Single title'), { artist: null, title: 'Single title' });
  assert.equal(parseTrack('Unknown'), null);
});
test('metadata requests block private, mapped and reserved destinations', async () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '192.168.1.1',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  for (const url of [
    'http://127.0.0.1/live',
    'http://[::1]/live',
    'file:///etc/passwd',
    'https://user:secret@example.com/',
  ])
    await assert.rejects(openPublicStream(url, AbortSignal.timeout(1000)));
});
test('provider deduplicates concurrent requests, caches absence, rejects non-station IDs', async () => {
  let calls = 0;
  let resolve;
  const pending = new Promise((r) => (resolve = r));
  const provider = createMetadataProvider(async () => {
    calls++;
    return pending;
  });
  const first = provider(id),
    second = provider(id);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve(null);
  assert.equal(await first, null);
  assert.equal(await second, null);
  assert.equal(await provider(id), null);
  assert.equal(await provider('https://localhost'), null);
  assert.equal(calls, 1);
});
