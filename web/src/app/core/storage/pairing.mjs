const KEY = 'radialla.pairing';
export function readPairing(base, storage = () => localStorage) {
  try {
    const value = JSON.parse(storage().getItem(KEY) || 'null');
    return value?.base === base && /^[a-f0-9]{64}$/.test(value.token) ? value.token : null;
  } catch {
    return null;
  }
}
export function writePairing(base, token, storage = () => localStorage) {
  try {
    if (token) storage().setItem(KEY, JSON.stringify({ base, token }));
    else storage().removeItem(KEY);
  } catch {
    /* Session-only pairing when browser storage is unavailable. */
  }
}
