import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCountry } from '../../web/src/app/core/localization/country-detection.mjs';
import { resolveLanguage } from '../../web/src/app/core/localization/localization.mjs';

test('fresh automatic sessions use the detected country even when the browser language is English', async () => {
  let request;
  const country = await detectCountry(async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ country: 'ge' }) };
  });
  assert.equal(country, 'GE');
  assert.equal(resolveLanguage('auto', country), 'ka');
  assert.equal(resolveLanguage('en', country), 'en');
  assert.equal(request.url, 'https://api.country.is/');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
  assert.equal(request.options.body, undefined);
});

test('unavailable or malformed country lookup falls back to English', async () => {
  const responses = [
    { ok: false, json: async () => ({ country: 'GE' }) },
    ...[null, {}, { country: 42 }, { country: 'Georgia' }, { country: '' }].map((data) => ({
      ok: true,
      json: async () => data,
    })),
    {
      ok: true,
      json: async () => {
        throw Error('Invalid JSON');
      },
    },
  ];
  for (const response of responses) {
    const country = await detectCountry(async () => response);
    assert.equal(country, null);
    assert.equal(resolveLanguage('auto', country), 'en');
  }
  assert.equal(
    await detectCountry(async () => {
      throw Error('Offline');
    }),
    null,
  );
  const unsupported = await detectCountry(async () => ({
    ok: true,
    json: async () => ({ country: 'FR' }),
  }));
  assert.equal(resolveLanguage('auto', unsupported), 'en');
});

test('country lookup cancels on timeout or destruction without returning stale results', async () => {
  const waiting = (_, { signal }) =>
    new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(Error('Aborted')), { once: true });
    });
  assert.equal(await detectCountry(waiting, undefined, 5), null);
  const controller = new AbortController();
  const pending = detectCountry(waiting, controller.signal);
  controller.abort();
  assert.equal(await pending, null);
  let fetched = false;
  assert.equal(
    await detectCountry(async () => {
      fetched = true;
    }, controller.signal),
    null,
  );
  assert.equal(fetched, false);
});
