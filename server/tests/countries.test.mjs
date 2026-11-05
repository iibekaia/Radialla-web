import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const countries = JSON.parse(
  readFileSync(new URL('../../web/src/app/shared/data/countries.json', import.meta.url)),
);
test('country selector includes a unique complete country list with usable offline map bounds', () => {
  assert.equal(countries.length, 250);
  assert.equal(new Set(countries.map((c) => c.code)).size, countries.length);
  for (const country of countries) {
    assert.match(country.code, /^[A-Z]{2}$/);
    assert.ok(country.name);
    const [west, south, east, north] = country.bounds;
    assert.ok(country.bounds.every(Number.isFinite), country.code);
    assert.ok(west < east && south < north, country.code);
    assert.ok(west >= -180 && east <= 180 && south >= -90 && north <= 90, country.code);
  }
  for (const code of ['GE', 'US', 'VA', 'MC', 'XK', 'NZ'])
    assert.ok(
      countries.some((country) => country.code === code),
      code,
    );
});
