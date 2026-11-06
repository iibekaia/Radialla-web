import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stationIdFromLink,
  stationLink,
  shareStationLink,
  facebookShareLink,
} from '../../web/src/app/core/sharing/station-link.mjs';
import { fetchRadioStation } from '../../web/src/app/core/catalog/radio-browser.mjs';

const id = '12345678-1234-1234-1234-123456789abc';

test('Facebook sharing preserves the complete station link, including encoded station IDs', () => {
  const station = stationLink('https://example.com/radio/?language=ka#map', 'რადიო & სხვა');
  const facebook = new URL(facebookShareLink(station));
  assert.equal(facebook.origin, 'https://www.facebook.com');
  assert.equal(facebook.pathname, '/sharer/sharer.php');
  assert.equal(facebook.searchParams.get('u'), station);
  assert.equal(stationIdFromLink(facebook.searchParams.get('u')), 'რადიო & სხვა');
});

test('station links round-trip IDs and preserve static hosting paths and other URL state', () => {
  for (const id of ['demo-1', 'ქართული / რადიო? &=#', '12345678-1234-1234-1234-123456789abc']) {
    const url = stationLink('https://example.com/radio/?language=ka&station=old#map', id);
    assert.equal(stationIdFromLink(url), id);
    assert.equal(new URL(url).pathname, '/radio/');
    assert.equal(new URL(url).searchParams.get('language'), 'ka');
    assert.equal(new URL(url).hash, '#map');
    assert.equal(new URL(url).searchParams.getAll('station').length, 1);
  }
  for (const url of [
    'broken',
    'https://example.com',
    'https://example.com/?station=',
    'https://example.com/?station=%20',
    `https://example.com/?station=${'x'.repeat(201)}`,
  ]) {
    assert.equal(stationIdFromLink(url), null);
  }
});

test('sharing uses the native share sheet, handles cancellation, and falls back to copy', async () => {
  const url = stationLink('https://example.com/', id);
  let copied;
  const clipboard = {
    writeText: async (text) => {
      copied = text;
    },
  };
  assert.equal(
    await shareStationLink(url, 'Radio', {
      share: async (data) => assert.deepEqual(data, { title: 'Radio', url }),
      clipboard,
    }),
    'shared',
  );
  assert.equal(copied, undefined);
  assert.equal(
    await shareStationLink(url, 'Radio', {
      share: async () => {
        throw new DOMException('Cancelled', 'AbortError');
      },
      clipboard,
    }),
    'cancelled',
  );
  assert.equal(copied, undefined);
  assert.equal(
    await shareStationLink(url, 'Radio', {
      share: async () => {
        throw Error('Unavailable');
      },
      clipboard,
    }),
    'copied',
  );
  assert.equal(copied, url);
  assert.equal(await shareStationLink(url, 'Radio', { clipboard }), 'copied');
  assert.equal(await shareStationLink(url, 'Radio', {}), 'manual');
  assert.equal(
    await shareStationLink(url, 'Radio', {
      clipboard: {
        writeText: async () => {
          throw Error('Permission denied');
        },
      },
    }),
    'manual',
  );
});

test('a shared live station can be resolved directly without loading its country or backend', async () => {
  const urls = [];
  const station = await fetchRadioStation(id, async (url) => {
    urls.push(new URL(url));
    return {
      ok: true,
      json: async () => [
        {
          stationuuid: id,
          name: 'Shared Radio',
          countrycode: 'GE',
          url_resolved: 'https://example.com/live',
        },
      ],
    };
  });
  assert.equal(urls.length, 1);
  assert.equal(urls[0].pathname, `/json/stations/byuuid/${id}`);
  assert.equal(station.id, id);
  assert.equal(station.streamUrl, 'https://example.com/live');
  assert.equal(station.countryCode, 'GE');
});

test('UUID lookup rejects arbitrary IDs, ignores unrelated rows, and retries another mirror', async () => {
  await fetchRadioStation('../invalid', () => assert.fail('Invalid ID fetched'));
  assert.equal(await fetchRadioStation(id, async () => ({ ok: true, json: async () => [] })), null);
  assert.equal(
    await fetchRadioStation(id, async () => ({
      ok: true,
      json: async () => [{ stationuuid: 'another', name: 'Wrong radio' }],
    })),
    null,
  );
  let requests = 0;
  const station = await fetchRadioStation(id, async () => {
    if (++requests === 1) throw Error('First mirror offline');
    return { ok: true, json: async () => [{ stationuuid: id, name: 'Radio' }] };
  });
  assert.equal(requests, 2);
  assert.equal(station.id, id);
  await assert.rejects(
    fetchRadioStation(id, async () => {
      throw Error('Offline');
    }),
    /Offline/,
  );
});
