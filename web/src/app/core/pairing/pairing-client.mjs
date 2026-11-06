// WebSocket receives paired-device changes; explicit actions use authenticated HTTP.
export class PairingClient {
  constructor({
    base,
    token = null,
    fetcher = (...args) => fetch(...args),
    changed = () => {},
    pause = () => {},
    save = () => {},
    socketFactory = (url) => new WebSocket(url),
  }) {
    this.base = base.replace(/\/$/, '');
    this.token = token;
    this.fetcher = fetcher;
    this.changed = changed;
    this.pause = pause;
    this.save = save;
    this.socketFactory = socketFactory;
    this.retryDelay = 500;
    this.clientId = crypto.randomUUID(); // Separate playback owner for every browser tab.
    this.state = { revision: -1, owner: null, members: 0 };
    this.connected = false;
    this.playing = false;
    this.pending = 0;
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
      signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(35_000)]),
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
  apply(state) {
    if (state.revision < this.state.revision) return;
    this.state = state;
    this.connected = true;
    this.changed();
    this.enforce();
  }
  enforce() {
    // Pairing carries remote controls; it never transfers audio ownership.
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
        this.retryDelay = Math.min(this.retryDelay * 2, 8000);
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
      armWatchdog(10_000);
      socket.addEventListener('open', () => {
        if (this.controller.signal.aborted) return socket.close();
        socket.send(JSON.stringify({ token: this.token }));
      });
      socket.addEventListener('message', (event) => {
        if (this.socket !== socket || this.controller.signal.aborted) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'state' && Number.isSafeInteger(message.state?.revision)) {
            this.apply(message.state);
            this.retryDelay = 500;
            resolve();
          } else if (message.type !== 'heartbeat') {
            socket.close();
            return;
          }
          armWatchdog(45_000);
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
        this.connected = false;
        if (event.code === 4401) {
          this.token = null;
          this.save(null);
          this.state = { revision: -1, owner: null, members: 0 };
        }
        this.changed();
        retry();
      });
      this.controller.signal.addEventListener('abort', abort, { once: true });
    });
  }
  async pair(code) {
    const result = await this.request(code ? 'join' : 'create', code ? { code } : {}, null);
    this.token = result.token;
    this.save(this.token);
    this.state = { revision: -1, owner: null, members: 0 };
    this.apply(result.state);
    void this.connect();
    return result;
  }
  async claim() {
    if (!this.token) return;
    this.pending++;
    try {
      this.apply(await this.request('claim', { clientId: this.clientId }));
    } catch (error) {
      this.connected = false;
      this.changed();
      throw error;
    } finally {
      this.pending--;
      if (this.connected) this.enforce();
    }
  }
  playbackStarted() {
    this.playing = true;
  }
  playbackStopped() {
    this.playing = false;
  }
  async newCode() {
    return this.request('code');
  }
  async leave() {
    // Revoke on the server before forgetting credentials; failed requests can be retried.
    await this.request('leave');
    this.token = null;
    this.save(null);
    this.connected = false;
    this.state = { revision: -1, owner: null, members: 0 };
    this.changed();
    this.destroy();
  }
  destroy() {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.controller.abort();
  }
}
