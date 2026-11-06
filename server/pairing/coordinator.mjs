import { randomBytes, randomInt } from 'node:crypto';

export class PairingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Single-instance, bounded, ephemeral state. No IP-based automatic pairing.
export function createPairingCoordinator({ now = Date.now, maxGroups = 500 } = {}) {
  const groups = new Set();
  const credentials = new Map();
  const codes = new Map();
  const codeTTL = 5 * 60_000;
  const idleTTL = 24 * 60 * 60_000;
  const fail = (status, message) => {
    throw new PairingError(status, message);
  };
  const state = (g) => ({
    revision: g.revision,
    owner: g.owner,
    members: g.members.size,
    playback: g.playback,
    viewport: g.viewport,
  });
  function notify(g) {
    g.revision++;
    for (const listener of [...g.listeners]) listener(state(g));
  }
  function sweep() {
    for (const [code, entry] of codes) if (entry.expiresAt <= now()) codes.delete(code);
    for (const g of groups) {
      if (now() - g.touched < idleTTL) continue;
      for (const token of g.members) credentials.delete(token);
      for (const [code, entry] of codes) if (entry.group === g) codes.delete(code);
      groups.delete(g);
    }
  }
  function member(token) {
    sweep();
    const g = credentials.get(token);
    if (!g) fail(401, 'Pairing expired');
    g.touched = now();
    return g;
  }
  function add(g) {
    const token = randomBytes(32).toString('hex');
    credentials.set(token, g);
    g.members.add(token);
    notify(g);
    return token;
  }
  function codeFor(g) {
    for (const [code, entry] of codes) if (entry.group === g) codes.delete(code);
    let code;
    do {
      code = String(randomInt(0, 100_000_000)).padStart(8, '0');
    } while (codes.has(code));
    const expiresAt = now() + codeTTL;
    codes.set(code, { group: g, expiresAt });
    return { code, expiresAt };
  }
  return {
    create() {
      sweep();
      if (groups.size >= maxGroups) fail(503, 'Pairing capacity reached');
      const g = {
        members: new Set(),
        listeners: new Set(),
        revision: 0,
        owner: null,
        ownerToken: null,
        playback: null,
        viewport: null,
        touched: now(),
      };
      groups.add(g);
      const token = add(g);
      return { token, ...codeFor(g), state: state(g) };
    },
    join(code) {
      sweep();
      const entry = codes.get(code);
      if (!entry) fail(404, 'Invalid or expired code');
      const g = entry.group;
      if (g.members.size >= 4) fail(409, 'Device limit reached');
      codes.delete(code); // One use only.
      g.touched = now();
      const token = add(g);
      return { token, state: state(g) };
    },
    code(token) {
      return codeFor(member(token));
    },
    claim(token, clientId) {
      const g = member(token);
      if (typeof clientId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(clientId))
        fail(400, 'Invalid client ID');
      // Legacy playback claims must never interrupt the web receiver.
      return state(g);
    },
    command(token, command) {
      const g = member(token);
      if (!command || typeof command !== 'object') fail(400, 'Invalid command');
      if (command.type === 'play' || command.type === 'select') {
        if (
          typeof command.stationId !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,100}$/.test(command.stationId)
        )
          fail(400, 'Invalid station');
        g.playback = { type: command.type, stationId: command.stationId, revision: g.revision + 1 };
      } else if (command.type === 'pause') {
        g.playback = { type: 'pause', revision: g.revision + 1 };
      } else if (command.type === 'viewport') {
        const { latitude, longitude, zoom } = command;
        if (
          ![latitude, longitude, zoom].every(Number.isFinite) ||
          Math.abs(latitude) > 85 ||
          Math.abs(longitude) > 180 ||
          zoom < 2 ||
          zoom > 18
        )
          fail(400, 'Invalid viewport');
        g.viewport = { latitude, longitude, zoom, revision: g.revision + 1 };
      } else fail(400, 'Invalid command');
      notify(g);
      return state(g);
    },
    watch(token, after, listener) {
      const g = member(token);
      if (g.listeners.size >= 16) fail(429, 'Too many connections');
      if (g.revision !== after) {
        listener(state(g));
        return () => {};
      }
      g.listeners.add(listener);
      return () => g.listeners.delete(listener);
    },
    subscribe(token, listener) {
      const g = member(token);
      if (g.listeners.size >= 16) fail(429, 'Too many connections');
      g.listeners.add(listener);
      return () => g.listeners.delete(listener);
    },
    snapshot(token) {
      return state(member(token));
    },
    leave(token) {
      const g = member(token);
      credentials.delete(token);
      g.members.delete(token);
      if (g.ownerToken === token) {
        g.owner = null;
        g.ownerToken = null;
      }
      for (const [code, entry] of codes) if (entry.group === g) codes.delete(code);
      notify(g);
      if (!g.members.size) groups.delete(g);
      return { ok: true };
    },
  };
}
