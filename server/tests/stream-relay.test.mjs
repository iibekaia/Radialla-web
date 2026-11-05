import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApp } from '../app.mjs';

const id = '01234567-89ab-cdef-0123-456789abcdef';
async function withServer(streamRelay, run) {
  const server = createApp([], { streamRelay });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('HTTP station relay resolves UUID only and delivers unchanged audio without ICY metadata', async () => {
  const bytes = Buffer.from([0xff, 0xfb, 0x90, 0, 1, 2]);
  await withServer(
    {
      resolveStream: async (value) => {
        assert.equal(value, id);
        return 'http://radio.example/live';
      },
      openStream: async (url, signal, redirects, metadata) => {
        assert.equal(url, 'http://radio.example/live');
        assert.equal(metadata, false);
        const stream = Readable.from([bytes]);
        stream.headers = { 'content-type': 'audio/mpeg' };
        return stream;
      },
    },
    async (base) => {
      assert.equal((await fetch(base + '/api/stream?station=http://127.0.0.1')).status, 400);
      assert.equal((await fetch(base + '/api/stream?url=http://radio.example')).status, 400);
      const response = await fetch(base + '/api/stream?station=' + id);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'audio/mpeg');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    },
  );
});

test('relay rejects missing stations, upstream failures and playlists', async () => {
  for (const [url, type, status] of [
    [null, '', 404],
    ['http://radio.example', 'text/html', 502],
    ['http://radio.example', 'audio/x-mpegurl', 502],
    ['http://radio.example', null, 502],
  ]) {
    await withServer(
      {
        resolveStream: async () => url,
        openStream: async () => {
          if (type === null) throw Error('upstream down');
          const stream = Readable.from(['not audio']);
          stream.headers = { 'content-type': type };
          return stream;
        },
      },
      async (base) => {
        assert.equal((await fetch(base + '/api/stream?station=' + id)).status, status);
      },
    );
  }
});

test('disconnecting the listener releases the upstream audio connection', async () => {
  let signal;
  const upstream = new Readable({ read() {} });
  upstream.headers = { 'content-type': 'audio/mpeg' };
  const closed = new Promise((resolve) => upstream.once('close', resolve));
  await withServer(
    {
      resolveStream: async () => 'http://radio.example/live',
      openStream: async (_url, value) => {
        signal = value;
        upstream.push(Buffer.from('audio'));
        return upstream;
      },
    },
    async (base) => {
      const response = await fetch(base + '/api/stream?station=' + id);
      await response.body.cancel();
      await closed;
      assert.equal(signal.aborted, true);
      assert.equal(upstream.destroyed, true);
    },
  );
});
