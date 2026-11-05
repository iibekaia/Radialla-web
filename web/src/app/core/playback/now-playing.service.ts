import { Injectable, OnDestroy, signal } from '@angular/core';
export interface NowPlayingTrack {
  title: string;
  artist: string | null;
}
@Injectable({ providedIn: 'root' })
export class NowPlayingService implements OnDestroy {
  readonly track = signal<NowPlayingTrack | null>(null);
  private timer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private generation = 0;
  start(id: string, baseUrl: string) {
    this.stop();
    if (!baseUrl) return;
    const generation = this.generation;
    const poll = async () => {
      const controller = new AbortController();
      this.controller = controller;
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(
          `${baseUrl.replace(/\/$/, '')}/api/now-playing?station=${encodeURIComponent(id)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw Error('Metadata unavailable');
        const { track } = await response.json();
        if (generation !== this.generation) return;
        this.track.set(
          track &&
            typeof track.title === 'string' &&
            track.title.trim() &&
            (track.artist === null || typeof track.artist === 'string')
            ? { title: track.title.slice(0, 300), artist: track.artist?.slice(0, 200) || null }
            : null,
        );
      } catch {
        if (generation === this.generation) this.track.set(null);
      } finally {
        clearTimeout(timeout);
        if (generation === this.generation) this.timer = setTimeout(() => void poll(), 20000);
      }
    };
    void poll();
  }
  stop() {
    ++this.generation;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.track.set(null);
  }
  ngOnDestroy() {
    this.stop();
  }
}
