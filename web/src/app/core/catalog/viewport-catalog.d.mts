import type { Station } from '../../shared/models/station';
import type { MapArea } from '../../shared/stations/station-geometry';
export interface CatalogEntry {
  code: string;
  name: string;
  count: number;
  latitude: number;
  longitude: number;
  cacheKey: string;
  regions: number[][];
}
export interface MapCatalogIndex {
  version: 2;
  generatedAt: string;
  countries: CatalogEntry[];
}
export const CATALOG_TTL: number;
export const INDEX_TTL: number;
export function freshTimestamp(timestamp: number, ttl: number, now?: number): boolean;
export function validCatalogIndex(value: unknown): value is MapCatalogIndex;
export function overviewArea(area: MapArea | null): boolean;
export function countriesInArea(entries: CatalogEntry[], area: MapArea | null): CatalogEntry[];
export class ViewportCatalogLoader {
  constructor(
    callbacks: {
      fetch(entry: CatalogEntry, signal: AbortSignal): Promise<Station[]>;
      isCached(entry: CatalogEntry): boolean;
      received(entry: CatalogEntry, stations: Station[]): void;
      loading(value: boolean): void;
      failed(): void;
    },
    timers?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>,
    delay?: number,
  );
  update(entries: CatalogEntry[]): void;
  destroy(): void;
}
