export const LANGUAGES: { id: string; name: string }[];
export function resolveLanguage(preference: string, languages: readonly string[]): string;
export function translate(
  dictionaries: Record<string, Record<string, string>>,
  language: string,
  key: string,
  args?: Array<string | number>,
): string;
