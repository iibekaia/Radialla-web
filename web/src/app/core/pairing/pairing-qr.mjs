// In-app scanner payload. No durable device credential is included in the QR.
export function pairingPayload(base, origin, code, expiresAt) {
  const url = new URL(base, origin);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid pairing server');
  if (!/^[0-9]{8}$/.test(code) || !Number.isFinite(expiresAt) || expiresAt <= Date.now())
    throw new Error('Invalid pairing code');
  return JSON.stringify({
    type: 'radialla-pairing',
    version: 1,
    apiBaseUrl: url.href.replace(/\/$/, ''),
    code,
    expiresAt,
  });
}
