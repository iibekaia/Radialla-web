const validRevision = (value, latest) =>
  Number.isSafeInteger(value) && value > 0 && value <= latest;

// Validate transport data before it reaches playback or map presentation.
export function isPairingState(state) {
  if (
    !state ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0 ||
    state.owner !== null ||
    !Number.isInteger(state.members) ||
    state.members < 0 ||
    state.members > 4
  )
    return false;
  const playback = state.playback;
  if (playback != null) {
    if (!validRevision(playback.revision, state.revision)) return false;
    if (playback.type !== 'pause') {
      if (
        !['play', 'select'].includes(playback.type) ||
        typeof playback.stationId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(playback.stationId)
      )
        return false;
    }
  }
  const viewport = state.viewport;
  if (
    viewport != null &&
    (!validRevision(viewport.revision, state.revision) ||
      ![viewport.latitude, viewport.longitude, viewport.zoom].every(Number.isFinite) ||
      Math.abs(viewport.latitude) > 85 ||
      Math.abs(viewport.longitude) > 180 ||
      viewport.zoom < 2 ||
      viewport.zoom > 18)
  )
    return false;
  return true;
}
