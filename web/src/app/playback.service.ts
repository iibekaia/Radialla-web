import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { AudioSession, PlaybackStatus } from './audio-session.mjs';
import { NowPlayingService } from './now-playing.service';
import { CatalogService } from './catalog.service';
import { Station } from './station';
import { readLastStation, writeLastStation } from './last-station.mjs';

const STATUS_MESSAGES: Record<PlaybackStatus, string> = {
  loading: 'იტვირთება აუდიო…',
  blocked: 'blocked',
  playing: 'live',
  paused: 'რადიო შეჩერებულია',
  error: 'streamError',
};

@Injectable({ providedIn: 'root' })
export class PlaybackService implements OnDestroy {
  readonly metadata = inject(NowPlayingService);
  private readonly catalog = inject(CatalogService);
  private metadataStation: string | null = null;
  readonly active = signal<Station | null>(readLastStation());
  readonly playing = signal(false);
  readonly loading = signal(false);
  readonly message = signal(this.active() ? STATUS_MESSAGES.paused : '');
  private readonly session = new AudioSession((status) => {
    this.playing.set(status === 'playing');
    this.loading.set(status === 'loading');
    const station = this.active();
    if (status === 'playing' && station) writeLastStation(station);
    if (status === 'playing' && station && this.metadataStation !== station.id) {
      this.metadataStation = station.id;
      this.metadata.start(station.id, this.catalog.config().apiBaseUrl);
    } else if (status === 'error' || status === 'paused') {
      this.clearMetadata();
    }
    this.message.set(STATUS_MESSAGES[status]);
  });

  async play(station: Station) {
    this.clearMetadata();
    this.session.stop();
    this.playing.set(false);
    this.loading.set(false);
    this.active.set(station);
    if (!station.streamUrl) {
      this.message.set('missingStream');
      return;
    }
    try {
      const url = new URL(station.streamUrl);
      if (url.protocol === 'http:') {
        const base = this.catalog.config().apiBaseUrl;
        if (!base || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(station.id)) {
          this.message.set('serverRequired');
          return;
        }
        await this.session.play(
          base.replace(/\/$/, '') + '/api/stream?station=' + encodeURIComponent(station.id),
        );
        return;
      }
      if (url.protocol !== 'https:' || url.username || url.password) {
        this.message.set('ამ სადგურის ბმული არასწორია');
        return;
      }
      await this.session.play(url.href);
    } catch {
      this.message.set('ამ სადგურის ბმული არასწორია');
    }
  }

  pause() {
    this.clearMetadata();
    this.session.stop();
    this.playing.set(false);
    this.loading.set(false);
    this.message.set(STATUS_MESSAGES.paused);
  }

  private clearMetadata() {
    this.metadataStation = null;
    this.metadata.stop();
  }

  ngOnDestroy() {
    this.clearMetadata();
    this.session.stop();
  }
}
