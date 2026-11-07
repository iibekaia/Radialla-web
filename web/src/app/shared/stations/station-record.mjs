export function isStationRecord(station) {
  return (
    !!station &&
    typeof station.id === 'string' &&
    station.id.length > 0 &&
    typeof station.name === 'string' &&
    station.name.trim().length > 0 &&
    typeof station.country === 'string' &&
    typeof station.genre === 'string' &&
    typeof station.frequency === 'string' &&
    (station.streamUrl === null || typeof station.streamUrl === 'string') &&
    (station.countryCode == null || typeof station.countryCode === 'string') &&
    (station.imageUrl == null || typeof station.imageUrl === 'string') &&
    (station.duplicateIds == null ||
      (Array.isArray(station.duplicateIds) &&
        station.duplicateIds.every((id) => typeof id === 'string')))
  );
}
