// HTTP long polling delivers ownership changes without idle polling timers.
export class PairingClient {
  constructor({
    base,
    token = null,
    fetcher = (...args) => fetch(...args),
    changed = () => {},
    pause = () => {},
    save = () => {},
  }) {
    this.base = base.replace(/\/$/, '');
    this.token = token;
    this.fetcher = fetcher;
    this.changed = changed;
    this.pause = pause;
    this.save = save;
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
    if (!this.pending && this.playing && this.state.owner && this.state.owner !== this.clientId) {
      this.playing = false;
      this.pause();
    }
  }
  async connect() {
    if (!this.token || this.watching) return;
    this.watching = true;
    try {
      while (!this.controller.signal.aborted && this.token) {
        try {
          this.apply(await this.request('wait', { afterRevision: this.state.revision }));
        } catch (error) {
          if (this.controller.signal.aborted) break;
          this.connected = false;
          if (error.status === 401) {
            this.token = null;
            this.save(null);
            this.state = { revision: -1, owner: null, members: 0 };
            this.changed();
            break;
          }
          this.changed();
          await new Promise((resolve) => {
            const done = () => {
              clearTimeout(timer);
              this.controller.signal.removeEventListener('abort', done);
              resolve();
            };
            const timer = setTimeout(done, 2000);
            this.controller.signal.addEventListener('abort', done, { once: true });
          });
        }
      }
    } finally {
      this.watching = false;
    }
  }
  async pair(code) {
    const result = await this.request(code ? 'join' : 'create', code ? { code } : {}, null);
    this.token = result.token;
    this.save(this.token);
    this.state = { revision: -1, owner: null, members: 0 };
    if (this.playing) this.pending++;
    this.apply(result.state);
    try {
      if (this.playing) {
        this.pending--;
        await this.claim();
      }
    } finally {
      void this.connect();
    }
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
    void this.claim().catch(() => {});
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
    this.controller.abort();
  }
}
