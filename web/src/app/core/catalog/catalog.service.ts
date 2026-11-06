import { DestroyRef, Injectable, inject, signal, computed } from '@angular/core';
import { CatalogCacheService } from '../storage/catalog-cache.service';
import { LocalizationService } from '../localization/localization.service';
import { CountryLocationService } from '../localization/country-location.service';
import { Station } from '../../shared/models/station';
import { MapArea } from '../../shared/stations/station-geometry';
import {
  createLiveIndex,
  fetchLiveIndex,
  fetchCountryStations,
  validStationCatalog,
} from './live-catalog.mjs';
import { COUNTRIES } from '../../shared/data/countries';
import countryRegions from '../../shared/data/country-regions.json';
import {
  CATALOG_TTL,
  INDEX_TTL,
  CatalogEntry,
  MapCatalogIndex,
  ViewportCatalogLoader,
  countriesInArea,
  overviewArea,
  freshTimestamp,
} from './viewport-catalog.mjs';
export interface Config {
  apiBaseUrl: string;
  iosUrl: string;
  androidUrl: string;
}
@Injectable({ providedIn: 'root' })
export class CatalogService {
  readonly stations = signal<Station[]>([]);
  private readonly i18n = inject(LocalizationService);
  private readonly location = inject(CountryLocationService);
  private readonly cache = inject(CatalogCacheService);
  private readonly status = signal<{ key: string; count?: number }>({ key: 'demo' });
  readonly mode = computed(() => {
    const status = this.status();
    return status.count === undefined
      ? this.i18n.t(status.key)
      : this.i18n.t(status.key, status.count);
  });
  private readonly initializing = signal(false);
  private readonly detailsLoading = signal(false);
  readonly loading = computed(() => this.initializing() || this.detailsLoading());
  readonly index = signal<MapCatalogIndex>(createLiveIndex(COUNTRIES, countryRegions));
  readonly playbackReady = signal(false);
  readonly isDemo = signal(true);
  readonly config = signal<Config>({ apiBaseUrl: '', iosUrl: '', androidUrl: '' });
  private started = false;
  private ready = false;
  private destroyed = false;
  private readonly controller = new AbortController();
  private freshness: Record<string, number> = {};
  private viewport: { area: MapArea | null; country: string | null; favorites: boolean } = {
    area: null,
    country: null,
    favorites: false,
  };
  private readonly loader = new ViewportCatalogLoader({
    fetch: (entry, signal) => fetchCountryStations(entry.code, fetch, signal),
    isCached: (entry) => freshTimestamp(this.freshness[entry.cacheKey], CATALOG_TTL),
    received: (entry, stations) => {
      this.replaceCountry(entry, stations);
      // Only retain the current revision of this country's freshness marker.
      for (const key of Object.keys(this.freshness))
        if (key.startsWith(entry.code + ':')) delete this.freshness[key];
      this.freshness[entry.cacheKey] = Date.now();
      this.persist();
      this.status.set({ key: 'კატალოგი ჩაიტვირთა: %@ სადგური', count: this.stations().length });
    },
    loading: (value) => this.detailsLoading.set(value),
    failed: () =>
      this.status.set({
        key: this.isDemo() ? 'catalogUnavailable' : 'catalogStopped',
        count: this.stations().length,
      }),
  });
  private indexRequest?: Promise<void>;
  private readonly refresh = () => {
    if (this.ready && document.visibilityState === 'visible')
      void this.refreshIndex().finally(() => this.scheduleViewport());
  };
  constructor() {
    const refreshTimer = setInterval(this.refresh, 60000);
    document.addEventListener('visibilitychange', this.refresh);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', this.refresh);
      this.destroyed = true;
      this.controller.abort();
      this.loader.destroy();
    });
  }
  private async json(url: string, signal = this.controller.signal) {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });
    if (!response.ok) throw Error('HTTP ' + response.status);
    return response.json();
  }
  async load() {
    if (this.started) return;
    this.started = true;
    this.initializing.set(true);
    try {
      const saved = this.cache.read();
      if (saved) {
        if (saved.stations.length) {
          this.stations.set(saved.stations);
          this.isDemo.set(!saved.stations.some((s) => s.streamUrl));
          this.status.set({ key: 'cached' });
        }
        if (saved.index) this.index.set(saved.index);
        this.freshness = saved.countries;
      }
      if (!this.stations().length) {
        try {
          const demo = await this.json('stations.json');
          if (validStationCatalog(demo)) this.stations.set(demo);
        } catch {}
      }
      try {
        const c = await this.json('config.json');
        this.config.set({
          apiBaseUrl: typeof c.apiBaseUrl === 'string' ? c.apiBaseUrl : '',
          iosUrl: this.storeUrl(c.iosUrl, 'apps.apple.com'),
          androidUrl: this.storeUrl(c.androidUrl, 'play.google.com'),
        });
      } catch {}
      this.playbackReady.set(true);
      // The Node API remains optional: catalog and browsing also work on static hosting.
      if (this.config().apiBaseUrl && this.isDemo()) {
        try {
          const data = await this.json(
            this.config().apiBaseUrl.replace(/\/$/, '') + '/api/stations',
          );
          if (validStationCatalog(data) && data.some((s) => s.streamUrl)) this.merge(data);
        } catch {}
      }
      await this.refreshIndex();
      await this.location.detect();
    } catch {
      this.status.set({
        key: this.isDemo() ? 'catalogUnavailable' : 'catalogStopped',
        count: this.stations().length,
      });
    } finally {
      if (!this.destroyed) {
        this.ready = true;
        this.playbackReady.set(true);
        this.initializing.set(false);
        this.scheduleViewport();
        this.persist();
      }
    }
  }
  setViewport(area: MapArea | null, country: string | null, favorites = false) {
    this.viewport = { area, country, favorites };
    if (this.ready) this.scheduleViewport();
  }
  private scheduleViewport() {
    const { area, country, favorites } = this.viewport;
    const entries = this.index().countries;
    let wanted: CatalogEntry[];
    if (favorites) wanted = [];
    else if (country) wanted = entries.filter((e) => e.code === country);
    else if (!overviewArea(area)) wanted = countriesInArea(entries, area);
    else wanted = entries.filter((e) => e.code === (this.location.country() || 'GE'));
    this.loader.update(wanted);
  }
  private refreshIndex(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    const timestamp = Date.parse(this.index().generatedAt);
    if (freshTimestamp(timestamp, INDEX_TTL)) return Promise.resolve();
    return (this.indexRequest ||= fetchLiveIndex(
      COUNTRIES,
      countryRegions,
      fetch,
      this.controller.signal,
    )
      .then((index) => {
        if (!this.destroyed) {
          this.index.set(index);
          this.persist();
        }
      })
      .catch(() => {
        // Keep the last counts and cached stations; country requests can still retry live.
      })
      .finally(() => {
        this.indexRequest = undefined;
      }));
  }
  private replaceCountry(entry: CatalogEntry, page: Station[]) {
    const existing = this.isDemo()
      ? []
      : this.stations().filter((s) =>
          s.countryCode ? s.countryCode !== entry.code : s.country !== entry.name,
        );
    const merged = new Map(existing.map((s) => [s.id, s]));
    for (const station of page) merged.set(station.id, station);
    this.stations.set([...merged.values()]);
    this.isDemo.set(false);
  }
  private merge(page: Station[]) {
    if (!page.length) return;
    const merged = new Map((this.isDemo() ? [] : this.stations()).map((s) => [s.id, s]));
    for (const station of page) merged.set(station.id, station);
    this.stations.set([...merged.values()]);
    this.isDemo.set(false);
  }
  private persist() {
    this.cache.write({
      version: 3,
      stations: this.stations(),
      countries: this.freshness,
      index: this.index(),
    });
  }
  private storeUrl(value: unknown, host: string) {
    try {
      const url = new URL(String(value));
      return url.protocol === 'https:' && url.hostname === host ? url.href : '';
    } catch {
      return '';
    }
  }
}
