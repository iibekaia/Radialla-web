// WebSocket receives paired-device changes; explicit actions use authenticated HTTP.
import { isPairingState } from './pairing-state.mjs';

const REQUEST_TIMEOUT_MS = 35_000;
const CONNECT_TIMEOUT_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;
const INITIAL_RETRY_MS = 500;
const MAX_RETRY_MS = 8_000;

const emptyState = () => ({ revision: -1, owner: null, members: 0 });
const validCode = (result) =>
  typeof result?.code === 'string' &&
  /^\d{8}$/.test(result.code) &&
  Number.isFinite(result.expiresAt);

export class PairingClient {
  constructor({
    base,
    token = null,
    fetcher = (...args) => fetch(...args),
    changed = () => {},
    save = () => {},
    socketFactory = (url) => new WebSocket(url),
  }) {
    this.base = base.replace(/\/$/, '');
    this.token = token;
    this.fetcher = fetcher;
    this.changed = changed;
    this.save = save;
    this.socketFactory = socketFactory;
    this.retryDelay = INITIAL_RETRY_MS;
    this.state = emptyState();
    this.connected = false;
    this.controller = new AbortController();
  }
  async request(action, data = {}, token = this.token) {
    const response = await this.fetcher(`${this.base}/api/pairing/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
      signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) {
      const error = new Error('Pairing request failed');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  apply(state, connected = this.connected) {
    if (!isPairingState(state)) throw new Error('Invalid pairing state');
    if (state.revision < this.state.revision) return;
    this.connected = connected;
    // Full snapshots retain both commands. Preserve unchanged command references so
    // a map gesture cannot invalidate playback and vice versa.
    const playback =
      state.playback && state.playback.revision === this.state.playback?.revision
        ? this.state.playback
        : state.playback;
    const viewport =
      state.viewport && state.viewport.revision === this.state.viewport?.revision
        ? this.state.viewport
        : state.viewport;
    this.state =
      playback === state.playback && viewport === state.viewport
        ? state
        : { ...state, playback, viewport };
    this.changed();
  }
  connect() {
    if (!this.token || this.socket || this.retryTimer || this.controller.signal.aborted)
      return Promise.resolve();
    return new Promise((resolve) => {
      const retry = () => {
        resolve();
        if (!this.token || this.controller.signal.aborted) return;
        this.retryTimer = setTimeout(() => {
          this.retryTimer = undefined;
          void this.connect();
        }, this.retryDelay);
        this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
      };
      let socket;
      try {
        const url = new URL(`${this.base}/api/pairing/socket`, globalThis.location?.href);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = this.socketFactory(url.href);
      } catch {
        this.connected = false;
        this.changed();
        retry();
        return;
      }
      this.socket = socket;
      let watchdog;
      const abort = () => {
        clearTimeout(watchdog);
        socket.close();
        resolve();
      };
      const armWatchdog = (ms) => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => socket.close(), ms);
      };
      armWatchdog(CONNECT_TIMEOUT_MS);
      socket.addEventListener('open', () => {
        if (this.controller.signal.aborted) return socket.close();
        socket.send(JSON.stringify({ token: this.token }));
      });
      socket.addEventListener('message', (event) => {
        if (this.socket !== socket || this.controller.signal.aborted) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'state') {
            this.apply(message.state, true);
            this.retryDelay = INITIAL_RETRY_MS;
            resolve();
          } else if (message.type !== 'heartbeat') {
            socket.close();
            return;
          }
          armWatchdog(HEARTBEAT_TIMEOUT_MS);
        } catch {
          socket.close();
        }
      });
      socket.addEventListener('error', () => socket.close());
      socket.addEventListener('close', (event) => {
        clearTimeout(watchdog);
        this.controller.signal.removeEventListener('abort', abort);
        if (this.socket !== socket) return resolve();
        this.socket = undefined;
        if (this.controller.signal.aborted) return resolve();
        this.connected = false;
        if (event.code === 4401) {
          this.clearPairing();
        } else this.changed();
        retry();
      });
      this.controller.signal.addEventListener('abort', abort, { once: true });
    });
  }
  async pair(code) {
    const result = await this.request(code ? 'join' : 'create', code ? { code } : {}, null);
    this.controller.signal.throwIfAborted();
    if (
      typeof result?.token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(result.token) ||
      !isPairingState(result.state) ||
      (!code && !validCode(result))
    )
      throw new Error('Invalid pairing response');
    this.token = result.token;
    this.save(this.token);
    this.state = emptyState();
    this.apply(result.state);
    void this.connect();
    return result;
  }
  async newCode() {
    const result = await this.request('code');
    if (!validCode(result)) throw new Error('Invalid pairing code');
    return result;
  }
  async leave() {
    // Revoke on the server before forgetting credentials; failed requests can be retried.
    await this.request('leave');
    this.controller.signal.throwIfAborted();
    this.clearPairing();
    this.destroy();
  }
  clearPairing() {
    this.token = null;
    this.save(null);
    this.connected = false;
    this.state = emptyState();
    this.changed();
  }
  destroy() {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.controller.abort();
    if (this.connected) {
      this.connected = false;
      this.changed();
    }
  }
}
