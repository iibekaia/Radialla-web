import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { CatalogService } from './catalog.service';
import { autoplayStation, LocationPoint } from './autoplay-station.mjs';
import { Station } from './station';
import { FavoritesService } from './favorites.service';
import { PlaybackService } from './playback.service';
import { MapArea } from './station-geometry';
import { stationInArea } from './station-area.mjs';
import { LocalizationService } from './localization.service';
import { COUNTRIES } from './countries';

@Injectable({ providedIn: 'root' })
export class ExplorerService {
  readonly i18n = inject(LocalizationService);
  readonly catalog = inject(CatalogService);
  readonly favorites = inject(FavoritesService);
  readonly player = inject(PlaybackService);
  readonly listCollapsed = signal(false);
  readonly selectedCountry = signal<string | null>(null);
  readonly countries = computed(() =>
    COUNTRIES.map((c) => ({ ...c, label: this.i18n.country(c.name, c.code) })).sort((a, b) =>
      a.label.localeCompare(b.label, this.i18n.language()),
    ),
  );
  readonly onlyFavorites = signal(false);
  readonly area = signal<MapArea | null>(null);
  readonly followArea = signal(false);
  private manualPlayback = false;
  private autoplayStarted = false;
  private readonly pendingAutoplay = signal(!!this.player.active());
  private readonly location = signal<LocationPoint | null>(null);
  readonly mapStations = computed(() => {
    const code = this.selectedCountry();
    const country = COUNTRIES.find((c) => c.code === code);
    const favorites = new Set(this.favorites.ids());
    const favoritesOnly = this.onlyFavorites();
    return this.catalog.stations().filter((s) =>
      (!favoritesOnly || favorites.has(s.id)) &&
      (!code || s.countryCode?.toUpperCase() === code || (!s.countryCode && s.country === country?.name)),
    );
  });
  readonly visible = computed(() => {
    const favoritesOnly = this.onlyFavorites();
    const area = this.area();
    return this.mapStations().filter((s) => favoritesOnly || stationInArea(s, area));
  });
  readonly selected = computed<Station | undefined>(
    () => this.player.active() || this.visible()[0] || this.catalog.stations()[0],
  );
  constructor() {
    void this.catalog.load();
    effect(() => {
      if (!this.pendingAutoplay() || !this.catalog.playbackReady()) return;
      const last = this.player.active();
      const station = last
        ? this.catalog.stations().find((s) => s.id === last.id && s.streamUrl) || last
        : autoplayStation(this.visible(), this.location());
      if (!station) return;
      this.autoplayStarted = true;
      this.pendingAutoplay.set(false);
      untracked(() => {
        if (this.player.active()?.id !== station.id || !this.player.playing())
          void this.player.play(station);
      });
    });
    effect(() => {
      if (!this.followArea() || !this.catalog.playbackReady()) return;
      const first = this.visible()[0];
      if (!first) return;
      untracked(() => {
        if (
          this.player.active()?.id !== first.id ||
          (!this.player.playing() && !this.player.loading())
        )
          void this.player.play(first);
      });
    });
  }
  requestAutoplay(location: LocationPoint | null) {
    if (this.manualPlayback || this.autoplayStarted) return;
    this.location.set(location);
    this.pendingAutoplay.set(true);
  }
  onLocationSelected() {
    this.selectedCountry.set(null);
    this.browseArea();
  }
  chooseCountry(code: string) {
    this.browseArea();
    this.selectedCountry.set(code);
  }
  browseArea() {
    this.manualPlayback = true;
    this.pendingAutoplay.set(false);
    this.followArea.set(true);
  }
  choose(s: Station) {
    this.followArea.set(false);
    this.manualPlayback = true;
    this.pendingAutoplay.set(false);
    void this.player.play(s);
  }
  togglePlayback() {
    this.followArea.set(false);
    this.manualPlayback = true;
    this.pendingAutoplay.set(false);
    const s = this.selected();
    if (!s) return;
    this.player.playing() || this.player.loading() ? this.player.pause() : void this.player.play(s);
  }
  skip(delta: number) {
    const queue = this.visible();
    if (!queue.length) return;
    const index = queue.findIndex((s) => s.id === this.selected()?.id);
    this.choose(
      queue[
        index < 0
          ? delta > 0
            ? 0
            : queue.length - 1
          : (index + delta + queue.length) % queue.length
      ],
    );
  }
}
