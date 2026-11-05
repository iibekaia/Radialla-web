const KEY = 'radialla.lastStation';
function valid(station) {
  if (
    !station ||
    typeof station.id !== 'string' ||
    !station.id ||
    typeof station.name !== 'string' ||
    !station.name.trim() ||
    typeof station.country !== 'string' ||
    typeof station.genre !== 'string' ||
    typeof station.frequency !== 'string' ||
    typeof station.streamUrl !== 'string'
  )
    return false;
  try {
    const url = new URL(station.streamUrl);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function readLastStation(storage = () => localStorage) {
  try {
    const station = JSON.parse(storage().getItem(KEY) || 'null');
    return valid(station) ? station : null;
  } catch {
    return null;
  }
}
export function writeLastStation(station, storage = () => localStorage) {
  if (!valid(station)) return;
  try {
    storage().setItem(KEY, JSON.stringify(station));
  } catch {}
}
