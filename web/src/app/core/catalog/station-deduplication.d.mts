import { Station } from '../../shared/models/station';
import { Country } from '../../shared/data/countries';
export function deduplicateStations(
  stations: Station[],
  favoriteIds?: string[],
  activeId?: string,
  countries?: Country[],
): Station[];
export function stationIsFavorite(station: Station, ids: string[]): boolean;
export function toggleStationFavorite(ids: string[], station: Station): string[];
