import test from 'node:test';
import assert from 'node:assert/strict';
import { isPairingState } from '../../web/src/app/core/pairing/pairing-state.mjs';
import { PairingClient } from '../../web/src/app/core/pairing/pairing-client.mjs';

const state = {
  revision: 3,
  owner: null,
  members: 2,
  playback: { type: 'play', stationId: 'station-123', revision: 2 },
  viewport: { latitude: 41.7, longitude: 44.8, zoom: 12, revision: 3 },
};

test('pairing state rejects malformed commands and coordinates before reaching consumers', () => {
  assert.equal(isPairingState(state), true);
  assert.equal(isPairingState({ ...state, playback: { type: 'pause', revision: 3 } }), true);
  assert.equal(isPairingState({ ...state, playback: null, viewport: null }), true);
  for (const invalid of [
    null,
    {},
    [],
    { ...state, revision: -1 },
    { ...state, members: '2' },
    { ...state, members: 5 },
    { ...state, playback: { type: 'play', stationId: '../bad', revision: 2 } },
    { ...state, playback: { type: 'unknown', revision: 2 } },
    { ...state, playback: { type: 'pause', revision: 4 } },
    { ...state, viewport: { ...state.viewport, latitude: 91 } },
    { ...state, viewport: { ...state.viewport, longitude: -181 } },
    { ...state, viewport: { ...state.viewport, zoom: '12' } },
    { ...state, viewport: { ...state.viewport, zoom: 19 } },
  ])
    assert.equal(isPairingState(invalid), false, JSON.stringify(invalid));
});

class Socket extends EventTarget {
  closed = false;
  close() {
    this.closed = true;
    this.dispatchEvent(new Event('close'));
  }
}

test('HTTP state does not mark the WebSocket connected; destroy clears a confirmed connection', async () => {
  const socket = new Socket();
  const client = new PairingClient({
    base: 'https://api.example',
    token: 'a'.repeat(64),
    socketFactory: () => socket,
  });
  try {
    client.apply(state);
    assert.equal(client.connected, false);
    const connecting = client.connect();
    socket.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify({ type: 'state', state }) }),
    );
    await connecting;
    assert.equal(client.connected, true);
    client.destroy();
    assert.equal(client.connected, false);
    assert.equal(socket.closed, true);
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'state', state: { ...state, revision: 4 } }),
      }),
    );
    assert.equal(client.state.revision, 3);
  } finally {
    client.destroy();
  }
});

test('invalid WebSocket state closes the connection without replacing the last valid state', async () => {
  const socket = new Socket();
  const client = new PairingClient({
    base: 'https://api.example',
    token: 'a'.repeat(64),
    socketFactory: () => socket,
  });
  try {
    client.apply(state);
    const connecting = client.connect();
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'state', state: { ...state, members: 'bad' } }),
      }),
    );
    await connecting;
    assert.equal(socket.closed, true);
    assert.equal(client.connected, false);
    assert.equal(client.state, state);
  } finally {
    client.destroy();
  }
});

test('map command bursts preserve playback identity and playback updates preserve the map', () => {
  const client = new PairingClient({ base: 'https://api.example' });
  client.apply(structuredClone(state));
  const playback = client.state.playback;
  for (let revision = 4; revision < 104; revision++) {
    client.apply({
      ...structuredClone(state),
      revision,
      viewport: { ...state.viewport, revision, longitude: 44 + revision / 1000 },
    });
    assert.equal(client.state.playback, playback);
    assert.equal(client.state.viewport.revision, revision);
  }
  const viewport = client.state.viewport;
  client.apply({
    ...structuredClone(client.state),
    revision: 104,
    playback: { type: 'pause', revision: 104 },
  });
  assert.equal(client.state.viewport, viewport);
  assert.equal(client.state.playback.type, 'pause');
  client.apply({ revision: 105, owner: null, members: 1, playback: null, viewport: null });
  assert.equal(client.state.playback, null);
  assert.equal(client.state.viewport, null);
  client.destroy();
});
