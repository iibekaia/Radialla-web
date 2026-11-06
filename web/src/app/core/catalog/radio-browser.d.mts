import type { Station } from '../../shared/models/station';
export const RADIO_HOSTS: string[];
export function fetchCountryCounts(
  fetcher?: typeof fetch,
  signal?: AbortSignal,
): Promise<{ code: string; count: number }[]>;
export function normalizeStation(raw: unknown): Station | null;
export function fetchRadioPage(
  offset: number,
  limit?: number,
  country?: string,
  fetcher?: typeof fetch,
  signal?: AbortSignal,
): Promise<{ stations: Station[]; count: number }>;
