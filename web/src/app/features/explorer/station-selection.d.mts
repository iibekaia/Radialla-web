import { Station } from '../../shared/models/station';
import { Country } from '../../shared/data/countries';
import { LocationPoint } from '../../core/playback/autoplay-station.mjs';
export function filterStations(
  stations: Station[],
  country: Country | undefined,
  favoriteIds?: string[],
): Station[];
export function startupStation(
  catalog: Station[],
  restored: Station | null,
  visible: Station[],
  location: LocationPoint | null,
): Station | undefined;
export function adjacentStation(
  stations: Station[],
  activeId: string | undefined,
  delta: number,
): Station | undefined;
export function emptyStationMessage(
  countryName: string | undefined,
  favoritesOnly: boolean,
  loading: boolean,
  countryStationCount: number,
): { key: string; args: string[] };
