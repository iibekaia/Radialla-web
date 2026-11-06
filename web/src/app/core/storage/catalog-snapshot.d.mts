import type { Station } from '../../shared/models/station';
import type { MapCatalogIndex } from '../catalog/viewport-catalog.mjs';
export interface CatalogSnapshot {
  version: 3;
  stations: Station[];
  countries: Record<string, number>;
  index: MapCatalogIndex | null;
}
export function restoreCatalogSnapshot(value: unknown): CatalogSnapshot | null;
export function compactCatalogSnapshot(
  snapshot: CatalogSnapshot,
  pinnedIds?: readonly string[],
  maxBytes?: number,
): CatalogSnapshot;
