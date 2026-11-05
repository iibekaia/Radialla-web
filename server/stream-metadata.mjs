import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address) {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

// Pin the validated DNS result to the actual connection, including on redirects.
export async function openPublicStream(value, signal, redirects = 0, metadata = true) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || redirects > 4)
    throw Error('Invalid stream');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw Error('Private stream address');
  signal.throwIfAborted();
  const address = addresses[0];
  const response = await new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(
      url,
      {
        signal,
        headers: {
          'Icy-MetaData': metadata ? '1' : '0',
          'User-Agent': 'Radialla-Web/0.1',
          'Accept-Encoding': 'identity',
        },
        lookup: (_host, options, callback) =>
          callback(null, options.all ? [address] : address.address, address.family),
      },
      resolve,
    );
    request.on('error', reject);
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
    const location = response.headers.location;
    response.destroy();
    if (!location) throw Error('Missing redirect');
    return openPublicStream(new URL(location, url).href, signal, redirects + 1, metadata);
  }
  if (response.statusCode !== 200) {
    response.destroy();
    throw Error('Stream unavailable');
  }
  return response;
}

export function parseTrack(value) {
  const text = value
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, 300);
  if (!text || /^(unknown|unknown artist\s*-\s*unknown title|offline|n\/a)$/i.test(text))
    return null;
  const separator = text.search(/\s[-–—]\s/);
  if (separator < 0) return { artist: null, title: text };
  const artist = text.slice(0, separator).trim(),
    title = text.slice(separator + 3).trim();
  return title ? { artist: artist || null, title } : { artist: null, title: text };
}

/** Consume bounded ICY audio/metadata blocks, even when split across network chunks. */
export async function readIcyTrack(stream, interval, maxBytes = 1024 * 1024) {
  if (!Number.isInteger(interval) || interval < 1 || interval > 256 * 1024) return null;
  let audioRemaining = interval,
    metadataRemaining = null,
    blocks = [],
    total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > maxBytes) return null;
    let offset = 0;
    while (offset < chunk.length) {
      if (audioRemaining > 0) {
        const n = Math.min(audioRemaining, chunk.length - offset);
        audioRemaining -= n;
        offset += n;
        continue;
      }
      if (metadataRemaining === null) {
        metadataRemaining = chunk[offset++] * 16;
        blocks = [];
        if (!metadataRemaining) {
          metadataRemaining = null;
          audioRemaining = interval;
        }
        continue;
      }
      const n = Math.min(metadataRemaining, chunk.length - offset);
      blocks.push(chunk.subarray(offset, offset + n));
      offset += n;
      metadataRemaining -= n;
      if (metadataRemaining === 0) {
        const bytes = Buffer.concat(blocks);
        let text;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          text = new TextDecoder('windows-1252').decode(bytes);
        }
        const match = text.replace(/\0+$/, '').match(/StreamTitle='(.*?)';(?:\w+='|$)/s);
        if (match) return parseTrack(match[1]);
        metadataRemaining = null;
        audioRemaining = interval;
      }
    }
  }
  return null;
}

export async function resolveStationStream(id, signal) {
  let station;
  for (const host of ['de1.api.radio-browser.info', 'nl1.api.radio-browser.info']) {
    try {
      const response = await fetch(
        `https://${host}/json/stations/byuuid/${encodeURIComponent(id)}`,
        { signal, headers: { 'User-Agent': 'Radialla-Web/0.1' } },
      );
      if (!response.ok) continue;
      const rows = await response.json();
      station = Array.isArray(rows) ? rows.find((s) => s.stationuuid === id) : null;
      if (station) break;
    } catch {
      signal.throwIfAborted();
    }
  }
  return station?.url_resolved || station?.url || null;
}

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
