import { stationIsFavorite } from '../../core/catalog/station-deduplication.mjs';
import { autoplayStation } from '../../core/playback/autoplay-station.mjs';

/** Filter the catalog without changing its order (the first result drives area playback). */
export function filterStations(stations, country, favoriteIds) {
  const favorites = favoriteIds;
  return stations.filter(
    (station) =>
      (!favorites || stationIsFavorite(station, favorites)) &&
      (!country ||
        station.countryCode?.toUpperCase() === country.code ||
        (!station.countryCode && station.country === country.name)),
  );
}

export function startupStation(catalog, restored, visible, location) {
  return restored
    ? catalog.find((station) => station.id === restored.id && station.streamUrl) || restored
    : autoplayStation(visible, location);
}

export function adjacentStation(stations, activeId, delta) {
  if (!stations.length) return undefined;
  const index = stations.findIndex((station) => station.id === activeId);
  if (index < 0) return delta > 0 ? stations[0] : stations[stations.length - 1];
  return stations[(((index + delta) % stations.length) + stations.length) % stations.length];
}

export function emptyStationMessage(countryName, favoritesOnly, loading, countryStationCount) {
  if (favoritesOnly) return { key: 'emptyFavorites', args: [] };
  if (countryName && countryStationCount === 0)
    return {
      key: loading ? 'countryStationsLoading' : 'emptyCountryStations',
      args: [countryName],
    };
  return { key: 'emptySearch', args: [] };
}
