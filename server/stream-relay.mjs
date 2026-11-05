import { pipeline } from 'node:stream/promises';
import { openPublicStream, resolveStationStream } from './stream-metadata.mjs';

// Resolve trusted catalog UUIDs; never accept an arbitrary client-supplied URL.
export function createStreamRelay({
  resolveStream = resolveStationStream,
  openStream = openPublicStream,
} = {}) {
  let active = 0;
  return async (id, res) => {
    const fail = (status) => {
      if (res.destroyed) return;
      if (res.headersSent) return res.destroy();
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Stream unavailable' }));
    };
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return fail(400);
    if (active >= 64) return fail(503);
    active++;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    res.once('close', cancel);
    const timeout = setTimeout(cancel, 15000);
    let stream;
    try {
      const url = await resolveStream(id, controller.signal);
      if (!url) return fail(404);
      stream = await openStream(url, controller.signal, 0, false);
      const type = String(stream.headers['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      // Playlists need URL rewriting; only relay continuous audio here.
      if (
        (!type.startsWith('audio/') && type !== 'application/ogg') ||
        /mpegurl|scpls/.test(type) ||
        stream.headers['icy-metaint']
      ) {
        return fail(502);
      }
      clearTimeout(timeout);
      stream.setTimeout?.(30000, cancel);
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      });
      await pipeline(stream, res, { signal: controller.signal });
    } catch {
      fail(502);
    } finally {
      clearTimeout(timeout);
      res.off('close', cancel);
      controller.abort();
      stream?.destroy();
      active--;
    }
  };
}
