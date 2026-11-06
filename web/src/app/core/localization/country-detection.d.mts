export function detectCountry(
  fetcher?: typeof fetch,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<string | null>;
