import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LANGUAGES,
  resolveLanguage,
  translate,
  translateCountry,
} from '../../web/src/app/core/localization/localization.mjs';
const dictionaries = Object.fromEntries(
  await Promise.all(
    LANGUAGES.map(async ({ id }) => [
      id,
      JSON.parse(
        await readFile(
          new URL(`../../web/src/app/core/localization/locales/${id}.json`, import.meta.url),
          'utf8',
        ),
      ),
    ]),
  ),
);
test('all eight app languages include every key and preserve placeholder counts', () => {
  assert.deepEqual(
    LANGUAGES.map((l) => l.id),
    ['en', 'ka', 'ru', 'uk', 'zh-Hans', 'ko', 'hy', 'tr'],
  );
  for (const [id, strings] of Object.entries(dictionaries)) {
    assert.deepEqual(Object.keys(strings).sort(), Object.keys(dictionaries.en).sort(), id);
    for (const [key, value] of Object.entries(strings)) {
      assert.equal(typeof value, 'string');
      assert.ok(value.trim(), `${id}: ${key}`);
      assert.equal(
        (value.match(/%@/g) || []).length,
        (dictionaries.en[key].match(/%@/g) || []).length,
        `${id}: ${key}`,
      );
    }
  }
});
test('manual choice wins; automatic detection matches supported browser languages and falls back to English', () => {
  assert.equal(resolveLanguage('ka', ['en-US']), 'ka');
  assert.equal(resolveLanguage('auto', ['ko-KR']), 'ko');
  assert.equal(resolveLanguage('auto', ['zh-TW']), 'zh-Hans');
  assert.equal(resolveLanguage('auto', ['fr-FR', 'uk-UA']), 'uk');
  assert.equal(resolveLanguage('auto', ['fr-GE']), 'ka');
  assert.equal(resolveLanguage('corrupt', ['tr-TR']), 'tr');
  assert.equal(resolveLanguage('auto', ['bad_locale', 'fr-FR']), 'en');
  assert.equal(resolveLanguage('auto', []), 'en');
});
test('translation uses app placeholders, English fallback and preserves literal broadcaster text', () => {
  assert.equal(translate(dictionaries, 'ka', '%@ სადგური', ['12']), '12 სადგური');
  assert.equal(translate(dictionaries, 'tr', 'Language'), 'Dil');
  assert.equal(translate(dictionaries, 'unsupported', 'Language'), 'Language');
  assert.equal(translate(dictionaries, 'en', 'Artist - Song'), 'Artist - Song');
  assert.equal(translate(dictionaries, 'en', '%@ — ლოგო', ['Artist %@']), 'Artist %@ — logo');
});

const countryNames = JSON.parse(
  await readFile(
    new URL('../../web/src/app/core/localization/country-names.json', import.meta.url),
    'utf8',
  ),
);
const countries = JSON.parse(
  await readFile(new URL('../../web/src/app/shared/data/countries.json', import.meta.url), 'utf8'),
);
test('all 250 country labels are bundled for all eight languages without browser Intl dependencies', () => {
  const expectedGeorgia = {
    en: 'Georgia',
    ka: 'საქართველო',
    ru: 'Грузия',
    uk: 'Грузія',
    'zh-Hans': '格鲁吉亚',
    ko: '조지아',
    hy: 'Վրաստան',
    tr: 'Gürcistan',
  };
  for (const { id } of LANGUAGES) {
    assert.equal(Object.keys(countryNames[id]).length, countries.length);
    for (const { code, name } of countries) {
      const label = translateCountry(countryNames, id, code, name);
      assert.ok(label.trim(), `${id}: ${code}`);
      assert.notEqual(label, code, `${id}: ${code}`);
    }
    assert.equal(translateCountry(countryNames, id, 'GE', 'Georgia'), expectedGeorgia[id]);
  }
});
test('country translations normalize codes and safely fall back for unknown locales and stations without a code', () => {
  assert.equal(translateCountry(countryNames, 'ka', 'fr', 'France'), 'საფრანგეთი');
  assert.equal(translateCountry(countryNames, 'unsupported', 'GE', 'Fallback'), 'Georgia');
  assert.equal(translateCountry(countryNames, 'ka', undefined, 'Demo country'), 'Demo country');
  assert.equal(translateCountry(countryNames, 'ka', 'INVALID', 'Fallback'), 'Fallback');
});
