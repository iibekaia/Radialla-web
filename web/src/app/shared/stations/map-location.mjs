import { stationInArea } from './station-area.mjs';

/** Display-only placement: never store capital placements as broadcaster coordinates. */
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
  const capital = country.capital;
  if (
    capital &&
    Number.isFinite(capital.latitude) &&
    Number.isFinite(capital.longitude) &&
    Math.abs(capital.latitude) <= 85 &&
    Math.abs(capital.longitude) <= 180
  )
    return {
      latitude: capital.latitude,
      longitude: capital.longitude,
      approximate: true,
      capital: capital.name,
    };
  // Uninhabited territories without a capital retain an approximate area marker.
  const [west, south, east, north] = country.bounds;
  const center = { latitude: country.latitude, longitude: country.longitude };
  // Some reference centers fall outside the country's focus bounds (or the map's poles).
  if (stationInArea(center, { west, south, east, north })) return { ...center, approximate: true };
  const span = (((east - west) % 360) + 360) % 360 || 360;
  const longitude = ((((west + span / 2 + 180) % 360) + 360) % 360) - 180;
  const latitude = (Math.max(-85, south) + Math.min(85, north)) / 2;
  return { latitude, longitude, approximate: true };
}
