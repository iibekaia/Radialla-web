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
