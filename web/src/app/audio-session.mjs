/** Owns one audio element at a time; retired streams cannot update current playback. */
export class AudioSession {
  constructor(onStatus, createAudio = () => new Audio(), timers = globalThis) {
    this.onStatus = onStatus;
    this.createAudio = createAudio;
    this.timers = timers;
    this.generation = 0;
    this.audio = null;
    this.retryTimer = null;
  }

  async play(url) {
    this.stop();
    const generation = this.generation;
    let retries = 0;
    let connected = false;
    const start = async () => {
      if (generation !== this.generation) return;
      const audio = this.createAudio();
      this.audio = audio;
      const current = () => generation === this.generation && this.audio === audio;
      const update = (status) => {
        if (current()) this.onStatus(status);
      };
      const failed = () => {
        if (!current()) return;
        // Only reconnect established streams. Initial failures and autoplay denial
        // remain visible, and a manual stop always cancels a pending reconnect.
        if (!connected || retries >= 3) {
          update('error');
          return;
        }
        const delay = 1000 * 2 ** retries++;
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
        update('playing');
      });
      audio.addEventListener('waiting', () => update('loading'));
      audio.addEventListener('error', failed);
      audio.addEventListener('ended', failed);
      audio.addEventListener('pause', () => update('paused'));
      audio.src = url;
      update('loading');
      try {
        await audio.play();
      } catch (error) {
        if (error?.name === 'NotAllowedError') update('blocked');
        else failed();
      }
    };
    await start();
  }

  release(audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  stop() {
    ++this.generation;
    if (this.retryTimer !== null) this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const audio = this.audio;
    this.audio = null;
    if (audio) this.release(audio);
  }
}
