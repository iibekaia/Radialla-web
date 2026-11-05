// Match the map's supported coordinate range and wrapped world copies.
export function stationInArea(station, area) {
  if (!area) return true;
  const { latitude, longitude } = station;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 85 ||
    Math.abs(longitude) > 180
  )
    return false;
  const offset = (((longitude - area.west) % 360) + 360) % 360;
  return latitude >= area.south && latitude <= area.north && offset <= area.east - area.west;
}
