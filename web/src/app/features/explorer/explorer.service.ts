import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  deduplicateStations,
  stationIsFavorite,
} from '../../core/catalog/station-deduplication.mjs';
import { CatalogService } from '../../core/catalog/catalog.service';
import { LocationPoint } from '../../core/playback/autoplay-station.mjs';
import { Station } from '../../shared/models/station';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { PlaybackService } from '../../core/playback/playback.service';
import { MapArea } from '../../shared/stations/station-geometry';
import { mapLocation } from '../../shared/stations/map-location.mjs';
import { stationInArea } from '../../shared/stations/station-area.mjs';
import { LocalizationService } from '../../core/localization/localization.service';
import { COUNTRIES } from '../../shared/data/countries';
import { overviewArea } from '../../core/catalog/viewport-catalog.mjs';
import {
  filterStations,
  startupStation,
  adjacentStation,
  emptyStationMessage,
} from './station-selection.mjs';

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
  readonly overviewCountries = computed(() =>
    !this.selectedCountry() && !this.onlyFavorites() && overviewArea(this.area())
      ? this.catalog.index().countries.filter((c) => c.count >= 0)
      : [],
  );
  private manualPlayback = false;
  private autoplayStarted = false;
  private readonly pendingAutoplay = signal(!!this.player.active());
  private readonly location = signal<LocationPoint | null>(null);
  readonly uniqueStations = computed(() =>
    deduplicateStations(
      this.catalog.stations(),
      this.favorites.ids(),
      this.player.active()?.id,
      COUNTRIES,
    ),
  );
  readonly favoriteCount = computed(
    () => this.uniqueStations().filter((s) => this.isFavorite(s)).length,
  );
  isFavorite(station: Station) {
    return stationIsFavorite(station, this.favorites.ids());
  }
  readonly mapStations = computed(() => {
    const code = this.selectedCountry();
    const country = COUNTRIES.find((c) => c.code === code);
    return filterStations(
      this.uniqueStations(),
      country,
      this.onlyFavorites() ? this.favorites.ids() : undefined,
    );
  });
  readonly visible = computed(() => {
    const favoritesOnly = this.onlyFavorites();
    const area = this.area();
    if (this.selectedCountry()) return this.mapStations();
    return this.mapStations().filter((s) => {
      const location = mapLocation(s, COUNTRIES);
      return favoritesOnly || stationInArea(location || s, area);
    });
  });
  readonly emptyMessage = computed(() => {
    const country = COUNTRIES.find((c) => c.code === this.selectedCountry());
    const message = emptyStationMessage(
      country ? this.i18n.country(country.name, country.code) : undefined,
      this.onlyFavorites(),
      this.catalog.loading(),
      this.mapStations().length,
    );
    return this.i18n.t(message.key, ...message.args);
  });
  readonly selected = computed<Station | undefined>(
    () => this.player.active() || this.visible()[0] || this.catalog.stations()[0],
  );
  constructor() {
    void this.catalog.load();
    effect(() => {
      const area = this.area();
      const country = this.selectedCountry();
      const favorites = this.onlyFavorites();
      untracked(() => this.catalog.setViewport(area, country, favorites));
    });
    effect(() => {
      if (!this.pendingAutoplay() || !this.catalog.playbackReady()) return;
      const station = startupStation(
        this.catalog.stations(),
        this.player.active(),
        this.visible(),
        this.location(),
      );
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
    this.browseArea();
  }
  chooseCountry(code: string) {
    this.beginAreaPlayback();
    this.selectedCountry.set(code);
  }
  browseArea() {
    // Null removes the country restriction without moving the map to the world view.
    this.selectedCountry.set(null);
    this.beginAreaPlayback();
  }
  private beginAreaPlayback() {
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
    const station = adjacentStation(this.visible(), this.selected()?.id, delta);
    if (station) this.choose(station);
  }
}
