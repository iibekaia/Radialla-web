const KEY = 'radialla.volume';

export function readVolume(storage = () => localStorage) {
  try {
    const value = JSON.parse(storage().getItem(KEY) || 'null');
    if (
      value &&
      Number.isFinite(value.volume) &&
      value.volume >= 0 &&
      value.volume <= 1 &&
      typeof value.muted === 'boolean'
    )
      return { volume: value.volume, muted: value.muted };
  } catch {}
  return { volume: 1, muted: false };
}

export function writeVolume(volume, muted, storage = () => localStorage) {
  try {
    storage().setItem(KEY, JSON.stringify({ volume, muted }));
  } catch {}
}
