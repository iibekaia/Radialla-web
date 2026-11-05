import type { Station } from '../../shared/models/station';
export const RADIO_HOSTS: string[];
export function normalizeStation(raw: unknown): Station | null;
export function fetchRadioPage(
  offset: number,
  limit?: number,
  country?: string,
  fetcher?: typeof fetch,
): Promise<{ stations: Station[]; count: number }>;
