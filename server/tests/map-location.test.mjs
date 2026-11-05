import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Compile the standalone controller without Angular or a live browser location request.
const source = readFileSync(
  new URL('../../web/src/app/features/map/map-location-controller.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { MapLocationController } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64')
);
function fixture(focused = false) {
  const events = [];
  const permission = { state: 'granted', onchange: null };
  let success,
    error,
    requests = 0;
  const browser = {
    permissions: { query: async () => permission },
    geolocation: {
      getCurrentPosition: (resolve, reject) => {
        requests++;
        success = resolve;
        error = reject;
      },
    },
  };
  const controller = new MapLocationController(
    {
      hasStationFocus: () => focused,
      notice: (key) => events.push(['notice', key]),
      ready: (point) => events.push(['ready', point]),
      located: (point, automatic) => events.push(['located', point, automatic]),
    },
    browser,
  );
  return {
    controller,
    events,
    permission,
    requests: () => requests,
    succeed: () => success({ coords: { latitude: 41.7, longitude: 44.8 } }),
    fail: () => error(Error('Location denied')),
  };
}
test('restored station focus takes priority over automatic location; explicit location still works', async () => {
  const f = fixture(true);
  await f.controller.restore();
  assert.equal(f.requests(), 0);
  assert.deepEqual(f.events, [['ready', null]]);
  f.controller.locate();
  f.controller.locate();
  assert.equal(f.requests(), 1);
  f.succeed();
  assert.deepEqual(f.events.at(-1), ['located', { latitude: 41.7, longitude: 44.8 }, false]);
});
test('startup location is automatic and teardown ignores late results and releases permission listener', async () => {
  const f = fixture();
  await f.controller.restore();
  f.succeed();
  assert.equal(f.events.at(-1)[2], true);
  f.controller.locate();
  f.controller.destroy();
  const count = f.events.length;
  f.succeed();
  f.fail();
  assert.equal(f.events.length, count);
  assert.equal(f.permission.onchange, null);
});
test('location denial reports a notice and allows later retry', () => {
  const f = fixture();
  f.controller.locate();
  f.fail();
  assert.deepEqual(f.events.slice(-2), [
    ['notice', 'locationError'],
    ['ready', null],
  ]);
  f.controller.locate();
  assert.equal(f.requests(), 2);
});
