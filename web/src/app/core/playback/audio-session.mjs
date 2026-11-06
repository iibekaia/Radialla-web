const BUFFER_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_MS = 1_000;

/** Owns one audio element at a time; retired streams cannot update current playback. */
export class AudioSession {
  constructor(onStatus, createAudio = () => new Audio(), timers = globalThis) {
    this.onStatus = onStatus;
    this.createAudio = createAudio;
    this.timers = timers;
    this.generation = 0;
    this.audio = null;
    this.retryTimer = null;
    this.stallTimer = null;
    this.volume = 1;
    this.muted = false;
  }

  setVolume(volume, muted = false) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
    if (this.audio) {
      this.audio.volume = this.volume;
      this.audio.muted = this.muted;
    }
  }

  async play(url) {
    this.stop();
    const generation = this.generation;
    let retries = 0;
    let connected = false;
    const start = async () => {
      if (generation !== this.generation) return;
      const audio = this.createAudio();
      audio.volume = this.volume;
      audio.muted = this.muted;
      this.audio = audio;
      const current = () => generation === this.generation && this.audio === audio;
      const update = (status) => {
        if (current()) this.onStatus(status);
      };
      const failed = () => {
        if (!current()) return;
        this.clearStallTimer();
        // Only reconnect established streams. Initial failures and autoplay denial
        // remain visible, and a manual stop always cancels a pending reconnect.
        if (!connected || retries >= MAX_RETRIES) {
          update('error');
          return;
        }
        const delay = INITIAL_RETRY_MS * 2 ** retries++;
        this.audio = null;
        this.release(audio);
        this.onStatus('loading');
        this.retryTimer = this.timers.setTimeout(() => {
          this.retryTimer = null;
          void start();
        }, delay);
      };
      audio.addEventListener('playing', () => {
        if (!current()) return;
        connected = true;
        this.clearStallTimer();
        update('playing');
      });
      const buffering = () => {
        if (!current()) return;
        update('loading');
        // Some streams stall without ever emitting error or ended.
        if (this.stallTimer !== null) return;
        this.stallTimer = this.timers.setTimeout(() => {
          this.stallTimer = null;
          failed();
        }, BUFFER_TIMEOUT_MS);
      };
      audio.addEventListener('waiting', buffering);
      audio.addEventListener('stalled', buffering);
      audio.addEventListener('error', failed);
      audio.addEventListener('ended', failed);
      audio.addEventListener('pause', () => update('paused'));
      audio.src = url;
      buffering();
      try {
        await audio.play();
      } catch (error) {
        if (error?.name === 'NotAllowedError') {
          if (current()) this.clearStallTimer();
          update('blocked');
        } else failed();
      }
    };
    await start();
  }

  clearStallTimer() {
    if (this.stallTimer !== null) this.timers.clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }

  release(audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  stop() {
    ++this.generation;
    this.clearStallTimer();
    if (this.retryTimer !== null) this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const audio = this.audio;
    this.audio = null;
    if (audio) this.release(audio);
  }
}
