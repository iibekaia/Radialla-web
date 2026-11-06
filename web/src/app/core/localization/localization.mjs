export const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'ka', name: 'ქართული' },
  { id: 'ru', name: 'Русский' },
  { id: 'uk', name: 'Українська' },
  { id: 'zh-Hans', name: '简体中文' },
  { id: 'ko', name: '한국어' },
  { id: 'hy', name: 'Հայերեն' },
  { id: 'tr', name: 'Türkçe' },
];
const countryLanguages = {
  GE: 'ka',
  RU: 'ru',
  UA: 'uk',
  CN: 'zh-Hans',
  KR: 'ko',
  AM: 'hy',
  TR: 'tr',
};
export function resolveLanguage(preference, countryCode) {
  if (LANGUAGES.some((l) => l.id === preference)) return preference;
  const code = typeof countryCode === 'string' ? countryCode.trim().toUpperCase() : '';
  return /^[A-Z]{2}$/.test(code) ? countryLanguages[code] || 'en' : 'en';
}
export function translate(dictionaries, language, key, args = []) {
  const format = dictionaries[language]?.[key] ?? dictionaries.en[key] ?? key;
  let index = 0;
  return format.replace(/%@/g, () => String(args[index++] ?? ''));
}

export function translateCountry(names, language, code, fallback) {
  const key = typeof code === 'string' ? code.toUpperCase() : '';
  return names[language]?.[key] || names.en?.[key] || fallback;
}
