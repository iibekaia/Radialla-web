import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioSession } from '../../web/src/app/core/playback/audio-session.mjs';

class FakeAudio extends EventTarget {
  src = '';
  paused = false;
  released = false;
  play() {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  removeAttribute() {
    this.src = '';
  }
  load() {
    this.released = true;
  }
}

test('switching stations releases the old stream and ignores its late errors', async () => {
  const states = [],
    elements = [];
  const session = new AudioSession(
    (s) => states.push(s),
    () => {
      const audio = new FakeAudio();
      elements.push(audio);
      return audio;
    },
  );
  const first = session.play('https://example.com/first');
  const second = session.play('https://example.com/second');
  assert.equal(elements[0].paused, true);
  assert.equal(elements[0].released, true);
  assert.equal(elements[0].src, '');
  elements[1].dispatchEvent(new Event('playing'));
  elements[1].resolve();
  await second;
  elements[0].dispatchEvent(new Event('error'));
  elements[0].reject(Error('retired stream'));
  await first;
  assert.deepEqual(states, ['loading', 'loading', 'playing']);
  session.stop();
  elements[1].dispatchEvent(new Event('playing'));
  assert.equal(states.at(-1), 'playing');
  assert.equal(elements[1].released, true);
});

test('current stream errors are reported and a stopped pending stream cannot resume', async () => {
  const states = [];
  const audio = new FakeAudio();
  const session = new AudioSession(
    (s) => states.push(s),
    () => audio,
  );
  const pending = session.play('https://example.com/live');
  audio.dispatchEvent(new Event('error'));
  assert.equal(states.at(-1), 'error');
  session.stop();
  audio.dispatchEvent(new Event('playing'));
  audio.resolve();
  await pending;
  assert.deepEqual(states, ['loading', 'error']);
});

test('autoplay denial is reported as blocked rather than an unavailable stream', async () => {
  const states = [];
  const audio = new FakeAudio();
  const session = new AudioSession(
    (s) => states.push(s),
    () => audio,
  );
  const pending = session.play('https://example.com/live');
  audio.reject(Object.assign(Error('User activation required'), { name: 'NotAllowedError' }));
  await pending;
  assert.deepEqual(states, ['loading', 'blocked']);
  session.stop();
});

test('an interrupted established stream reconnects, ignores old events and stops after three retries', async () => {
  const states = [],
    elements = [],
    pending = new Map();
  let next = 0;
  const timers = {
    setTimeout(fn, delay) {
      pending.set(++next, { fn, delay });
      return next;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
  };
  const session = new AudioSession(
    (s) => states.push(s),
    () => {
      const audio = new FakeAudio();
      elements.push(audio);
      return audio;
    },
    timers,
  );
  const initial = session.play('https://example.com/live');
  elements[0].dispatchEvent(new Event('playing'));
  elements[0].resolve();
  await initial;
  for (let i = 0; i < 3; i++) {
    elements[i].dispatchEvent(new Event(i === 0 ? 'ended' : 'error'));
    assert.equal(states.at(-1), 'loading');
    assert.equal(elements[i].released, true);
    elements[i].dispatchEvent(new Event('error'));
    assert.equal(pending.size, 1);
    const [id, task] = pending.entries().next().value;
    assert.equal(task.delay, 1000 * 2 ** i);
    pending.delete(id);
    task.fn();
    elements[i + 1].dispatchEvent(new Event('playing'));
    elements[i + 1].resolve();
  }
  elements[3].dispatchEvent(new Event('error'));
  assert.equal(states.at(-1), 'error');
  assert.equal(pending.size, 0);
  session.stop();
});

test('manual pause or station switch cancels a scheduled reconnect', async () => {
  let task,
    cancelled = false;
  const elements = [];
  const session = new AudioSession(
    () => {},
    () => {
      const audio = new FakeAudio();
      elements.push(audio);
      return audio;
    },
    {
      setTimeout(fn) {
        task = fn;
        return 1;
      },
      clearTimeout() {
        cancelled = true;
      },
    },
  );
  const initial = session.play('https://example.com/live');
  elements[0].dispatchEvent(new Event('playing'));
  elements[0].resolve();
  await initial;
  elements[0].dispatchEvent(new Event('error'));
  session.stop();
  assert.equal(cancelled, true);
  task();
  assert.equal(elements.length, 1);
});

test('buffering shows loading until audio actually resumes, ignoring retired stream events', async () => {
  const states = [],
    elements = [];
  const session = new AudioSession(
    (s) => states.push(s),
    () => {
      const audio = new FakeAudio();
      elements.push(audio);
      return audio;
    },
  );
  const first = session.play('https://example.com/live');
  assert.equal(states.at(-1), 'loading');
  elements[0].resolve();
  await first;
  // A resolved play promise alone does not mean audio is flowing.
  assert.equal(states.at(-1), 'loading');
  elements[0].dispatchEvent(new Event('playing'));
  elements[0].dispatchEvent(new Event('waiting'));
  assert.equal(states.at(-1), 'loading');
  elements[0].dispatchEvent(new Event('playing'));
  assert.equal(states.at(-1), 'playing');
  session.stop();
  const count = states.length;
  elements[0].dispatchEvent(new Event('waiting'));
  assert.equal(states.length, count);
});
