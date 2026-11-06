export const LANGUAGES: { id: string; name: string }[];
export function resolveLanguage(preference: string, countryCode?: string | null): string;
export function translate(
  dictionaries: Record<string, Record<string, string>>,
  language: string,
  key: string,
  args?: Array<string | number>,
): string;
export function translateCountry(
  names: Record<string, Record<string, string>>,
  language: string,
  code: string | undefined,
  fallback: string,
): string;
