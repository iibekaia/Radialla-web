import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StationFailoverController,
  canPlayStation,
} from '../../web/src/app/core/playback/station-failover.mjs';
const station = (id) => ({ id, streamUrl: `https://example.com/${id}` });
function fixture() {
  let state = { id: 'a', failed: false, playing: false },
    stations = ['a', 'b', 'c'].map(station),
    sequence = 0;
  const jobs = new Map(),
    played = [];
  const controller = new StationFailoverController(
    {
      state: () => state,
      stations: () => stations,
      relayAvailable: () => false,
      play: (s) => {
        played.push(s.id);
        state = { id: s.id, failed: false, playing: false };
      },
    },
    {
      setTimeout: (fn, delay) => {
        jobs.set(++sequence, { fn, delay });
        return sequence;
      },
      clearTimeout: (id) => jobs.delete(id),
    },
  );
  return {
    controller,
    jobs,
    played,
    state: () => state,
    change: (value) => {
      state = { ...state, ...value };
    },
    update: (value) => {
      state = { ...state, ...value };
      controller.update(state);
    },
    queue: (value) => {
      stations = value;
    },
    run: () => {
      const [id, task] = jobs.entries().next().value;
      assert.equal(task.delay, 3000);
      jobs.delete(id);
      task.fn();
    },
  };
}

test('terminal stream errors wait three seconds, schedule once and choose the next playable station', () => {
  const f = fixture();
  f.queue([
    station('a'),
    { id: 'missing', streamUrl: null },
    { id: 'http', streamUrl: 'http://example.com/live' },
    station('b'),
  ]);
  f.update({ failed: true });
  f.update({ failed: true });
  assert.equal(f.jobs.size, 1);
  assert.deepEqual(f.played, []);
  f.run();
  assert.deepEqual(f.played, ['b']);
  f.controller.destroy();
});

test('pause, recovery, manual selection and destruction cancel pending and already queued callbacks', () => {
  for (const action of ['pause', 'recovery', 'manual', 'destroy']) {
    const f = fixture();
    f.update({ failed: true });
    const stale = [...f.jobs.values()][0].fn;
    if (action === 'pause') f.update({ failed: false });
    if (action === 'recovery') f.update({ failed: false, playing: true });
    if (action === 'manual') f.controller.reset();
    if (action === 'destroy') f.controller.destroy();
    assert.equal(f.jobs.size, 0);
    stale();
    assert.deepEqual(f.played, []);
    f.controller.destroy();
  }
});

test('a failure chain tries each station once and stops when every candidate has failed', () => {
  const f = fixture();
  for (const id of ['a', 'b', 'c']) {
    f.update({ id, failed: true });
    f.run();
  }
  assert.deepEqual(f.played, ['b', 'c']);
  assert.equal(f.jobs.size, 0);
  f.controller.destroy();
});

test('successful playback clears old failures and explicit retry starts a fresh chain', () => {
  const f = fixture();
  f.queue([station('a'), station('b')]);
  f.update({ failed: true });
  f.run();
  f.update({ failed: false, playing: true });
  f.update({ failed: true, playing: false });
  f.run();
  assert.deepEqual(f.played, ['b', 'a']);
  f.controller.reset();
  f.update({ failed: true });
  f.run();
  assert.deepEqual(f.played, ['b', 'a', 'b']);
  f.controller.destroy();
});

test('failover uses the current filtered queue and rechecks playback before switching', () => {
  const f = fixture();
  f.update({ failed: true });
  f.queue([station('new')]);
  f.run();
  assert.deepEqual(f.played, ['new']);
  f.update({ failed: true });
  // A manual station change can precede the Angular status effect.
  f.change({ id: 'manual', failed: false });
  f.run();
  assert.deepEqual(f.played, ['new']);
  f.controller.destroy();
});

test('loading, paused and autoplay-blocked states never schedule a station switch', () => {
  const f = fixture();
  f.update({ failed: false, playing: false });
  assert.equal(f.jobs.size, 0);
  f.controller.destroy();
});

test('eligibility excludes unsafe URLs and unsupported HTTP relays', () => {
  assert.equal(canPlayStation(station('a'), false), true);
  for (const streamUrl of [
    null,
    'bad',
    'javascript:alert(1)',
    'https://user:pass@example.com/live',
    'ftp://example.com/live',
  ])
    assert.equal(canPlayStation({ id: 'a', streamUrl }, true), false);
  const http = { id: '12345678-1234-1234-1234-123456789abc', streamUrl: 'http://example.com/live' };
  assert.equal(canPlayStation(http, false), false);
  assert.equal(canPlayStation(http, true), true);
  assert.equal(canPlayStation({ ...http, id: 'demo' }, true), false);
});
