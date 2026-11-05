import { openPublicStream } from '../streaming/public-stream.mjs';
import { readIcyTrack } from './icy-metadata.mjs';
import { resolveStationStream } from '../streaming/station-stream.mjs';

export async function readStationTrack(id) {
  const signal = AbortSignal.timeout(12000);
  const url = await resolveStationStream(id, signal);
  if (!url) return null;
  const stream = await openPublicStream(url, signal);
  try {
    return await readIcyTrack(stream, Number(stream.headers['icy-metaint']));
  } finally {
    stream.destroy();
  }
}

export function createMetadataProvider(reader = readStationTrack) {
  const cache = new Map();
  let active = 0;
  return async (id) => {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return null;
    const cached = cache.get(id);
    if (cached && cached.expires > Date.now()) return cached.result;
    if (active >= 8) return null;
    if (cache.size >= 250) {
      const first = cache.keys().next().value;
      cache.delete(first);
    }
    active++;
    const result = Promise.resolve()
      .then(() => reader(id))
      .catch(() => null)
      .finally(() => active--);
    cache.set(id, { result, expires: Date.now() + 20000 });
    return result;
  };
}
