import type { Country } from '../../shared/data/countries';
import type { Station } from '../../shared/models/station';
import type { MapCatalogIndex } from './viewport-catalog.mjs';
export function validStationCatalog(value: unknown): value is Station[];
export function createLiveIndex(
  countries: Country[],
  regions: Record<string, number[][]>,
  counts?: { code: string; count: number }[] | null,
  now?: number,
): MapCatalogIndex;
export function fetchLiveIndex(
  countries: Country[],
  regions: Record<string, number[][]>,
  fetcher?: typeof fetch,
  signal?: AbortSignal,
): Promise<MapCatalogIndex>;
export function fetchCountryStations(
  code: string,
  fetcher?: typeof fetch,
  signal?: AbortSignal,
): Promise<Station[]>;
