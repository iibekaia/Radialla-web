import { Injectable, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { AudioSession, PlaybackStatus } from './audio-session.mjs';
import { NowPlayingService } from './now-playing.service';
import { CatalogService } from '../catalog/catalog.service';
import { Station } from '../../shared/models/station';
import { readLastStation, writeLastStation } from '../storage/last-station.mjs';
import { readVolume, writeVolume } from '../storage/volume.mjs';
import { PairingService } from '../pairing/pairing.service';

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
  private readonly pairing = inject(PairingService);
  private metadataStation: string | null = null;
  readonly active = signal<Station | null>(readLastStation());
  readonly playing = signal(false);
  readonly loading = signal(false);
  readonly message = signal(this.active() ? STATUS_MESSAGES.paused : '');
  private readonly savedVolume = readVolume();
  private readonly volumeLevel = signal(this.savedVolume.volume);
  private readonly mutedState = signal(this.savedVolume.muted);
  readonly volume = this.volumeLevel.asReadonly();
  readonly muted = computed(() => this.mutedState() || this.volumeLevel() === 0);
  private readonly session = new AudioSession((status) => {
    const started = status === 'playing' && !this.playing();
    this.playing.set(status === 'playing');
    if (started) this.pairing.playbackStarted();
    if (status === 'paused' || status === 'error' || status === 'blocked')
      this.pairing.playbackStopped();
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

  constructor() {
    let revision = -1;
    let request = 0;
    effect(() => {
      const command = this.pairing.remotePlayback();
      if (!command) {
        revision = -1;
        request++;
        return;
      }
      if (command.revision <= revision) return;
      revision = command.revision;
      const current = ++request;
      if (command.type === 'pause') {
        this.pause();
        return;
      }
      void this.catalog.findStation(command.stationId!).then((station) => {
        if (!station || current !== request) return;
        if (command.type === 'play') void this.play(station);
        else this.select(station);
      });
    });
    this.applyVolume();
  }

  setVolume(value: number) {
    if (!Number.isFinite(value)) return;
    this.volumeLevel.set(Math.max(0, Math.min(1, value)));
    this.mutedState.set(false);
    this.applyVolume();
  }

  toggleMute() {
    if (this.volumeLevel() === 0) {
      this.setVolume(1);
      return;
    }
    this.mutedState.update((value) => !value);
    this.applyVolume();
  }

  private applyVolume() {
    this.session.setVolume(this.volumeLevel(), this.mutedState());
    writeVolume(this.volumeLevel(), this.mutedState());
  }

  select(station: Station) {
    this.pairing.playbackStopped();
    this.clearMetadata();
    this.session.stop();
    this.playing.set(false);
    this.loading.set(false);
    this.active.set(station);
    this.message.set(STATUS_MESSAGES.paused);
  }

  async play(station: Station) {
    this.select(station);
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
    this.pairing.playbackStopped();
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
    this.pairing.playbackStopped();
    this.clearMetadata();
    this.session.stop();
  }
}
