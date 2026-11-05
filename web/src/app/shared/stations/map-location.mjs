/** Display-only placement: never store country centers as broadcaster coordinates. */
export function mapLocation(station, countries) {
  if (
    Number.isFinite(station.latitude) &&
    Number.isFinite(station.longitude) &&
    Math.abs(station.latitude) <= 85 &&
    Math.abs(station.longitude) <= 180
  )
    return { latitude: station.latitude, longitude: station.longitude, approximate: false };
  const country = countries.find((c) =>
    station.countryCode ? c.code === station.countryCode.toUpperCase() : c.name === station.country,
  );
  if (!country) return null;
  return { latitude: country.latitude, longitude: country.longitude, approximate: true };
}
