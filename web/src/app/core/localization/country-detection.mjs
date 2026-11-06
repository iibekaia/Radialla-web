/** Country-only IP lookup works on static hosting without sending GPS coordinates. */
export async function detectCountry(fetcher = fetch, signal, timeoutMs = 4000) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) return null;
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetcher('https://api.country.is/', {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok || controller.signal.aborted) return null;
    const data = await response.json();
    if (controller.signal.aborted || typeof data?.country !== 'string') return null;
    const code = data.country.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
