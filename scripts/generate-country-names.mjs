import { readFile, writeFile } from 'node:fs/promises';
import { LANGUAGES } from '../web/src/app/core/localization/localization.mjs';

// Bundle ICU/CLDR country names so translation does not depend on browser Intl data.
const countries = JSON.parse(
  await readFile(new URL('../web/src/app/shared/data/countries.json', import.meta.url), 'utf8'),
);
const names = Object.fromEntries(
  LANGUAGES.map(({ id }) => {
    if (!Intl.DisplayNames.supportedLocalesOf([id]).length) throw Error(`Missing locale: ${id}`);
    const display = new Intl.DisplayNames([id], { type: 'region', fallback: 'none' });
    return [
      id,
      Object.fromEntries(countries.map(({ code, name }) => [code, display.of(code) || name])),
    ];
  }),
);
await writeFile(
  new URL('../web/src/app/core/localization/country-names.json', import.meta.url),
  JSON.stringify(names, null, 2) + '\n',
);
