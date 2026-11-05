import { Injectable, inject, signal, computed } from '@angular/core';
import { CatalogCacheService } from '../storage/catalog-cache.service';
import { fetchRadioPage } from './radio-browser.mjs';
import { LocalizationService } from '../localization/localization.service';
import { Station } from '../../shared/models/station';
export interface Config {
  apiBaseUrl: string;
  iosUrl: string;
  androidUrl: string;
}
@Injectable({ providedIn: 'root' })
export class CatalogService {
  readonly stations = signal<Station[]>([]);
  private readonly i18n = inject(LocalizationService);
  private readonly status = signal<{ key: string; count?: number }>({ key: 'demo' });
  readonly mode = computed(() => {
    const status = this.status();
    return status.count === undefined
      ? this.i18n.t(status.key)
      : this.i18n.t(status.key, status.count);
  });
  private setMode(key: string, count?: number) {
    this.status.set({ key, count });
  }
  private readonly globalLoading = signal(false);
  private readonly pendingCountries = signal(0);
  readonly loading = computed(() => this.globalLoading() || this.pendingCountries() > 0);
  private readonly loadedCountries = new Set<string>();
  private readonly countryRequests = new Map<string, Promise<void>>();
  readonly playbackReady = signal(false);
  readonly isDemo = signal(true);
  private readonly cache = inject(CatalogCacheService);
  private started = false;
  readonly config = signal<Config>({ apiBaseUrl: '', iosUrl: '', androidUrl: '' });
  private valid(value: unknown): value is Station[] {
    return (
      Array.isArray(value) &&
      value.every(
        (s) =>
          s &&
          typeof s.id === 'string' &&
          typeof s.name === 'string' &&
          typeof s.country === 'string' &&
          typeof s.genre === 'string' &&
          typeof s.frequency === 'string' &&
          (s.streamUrl === null || typeof s.streamUrl === 'string'),
      )
    );
  }
  private async json(url: string) {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw Error('HTTP ' + r.status);
    return r.json();
  }
  async load() {
    if (this.started) return;
    this.started = true;
    this.globalLoading.set(true);
    try {
      const saved = this.cache.read();
      if (this.valid(saved) && saved.length) {
        this.stations.set(saved);
        this.isDemo.set(!saved.some((s) => s.streamUrl));
        this.setMode('cached');
      }
      if (!this.stations().length)
        try {
          const demo = await this.json('stations.json');
          if (this.valid(demo)) this.stations.set(demo);
        } catch {}
      try {
        const c = await this.json('config.json');
        this.config.set({
          apiBaseUrl: typeof c.apiBaseUrl === 'string' ? c.apiBaseUrl : '',
          iosUrl: this.storeUrl(c.iosUrl, 'apps.apple.com'),
          androidUrl: this.storeUrl(c.androidUrl, 'play.google.com'),
        });
      } catch {}
      this.playbackReady.set(true);
      if (this.config().apiBaseUrl)
        try {
          const data = await this.json(
            this.config().apiBaseUrl.replace(/\/$/, '') + '/api/stations',
          );
          if (this.valid(data) && data.length && (this.isDemo() || data.some((s) => s.streamUrl))) {
            this.stations.set(data);
            this.isDemo.set(!data.some((s) => s.streamUrl));
          }
        } catch {}
      this.setMode('რადიოები იტვირთება…');
      // Country requests also serve the picker, independently of worldwide pagination.
      await this.loadCountry('GE');
      let offset = 0;
      while (true) {
        const page = await fetchRadioPage(offset);
        this.merge(page.stations);
        offset += page.count;
        this.setMode('იტვირთება კატალოგი: %@ სადგური…', this.stations().length);
        if (offset % 2000 === 0) this.cache.write(this.stations());
        if (page.count < 500) break;
      }
      this.setMode('კატალოგი ჩაიტვირთა: %@ სადგური', this.stations().length);
    } catch {
      this.setMode(this.isDemo() ? 'catalogUnavailable' : 'catalogStopped', this.stations().length);
    } finally {
      this.playbackReady.set(true);
      this.globalLoading.set(false);
      this.cache.write(this.stations());
    }
  }
  loadCountry(code: string): Promise<void> {
    if (!/^[A-Z]{2}$/.test(code) || this.loadedCountries.has(code)) return Promise.resolve();
    const existing = this.countryRequests.get(code);
    if (existing) return existing;
    this.pendingCountries.update((count) => count + 1);
    const request = this.fetchCountry(code).finally(() => {
      this.countryRequests.delete(code);
      this.pendingCountries.update((count) => count - 1);
      this.cache.write(this.stations());
    });
    this.countryRequests.set(code, request);
    return request;
  }
  private async fetchCountry(code: string) {
    try {
      let offset = 0;
      while (true) {
        const page = await fetchRadioPage(offset, 200, code);
        this.merge(page.stations);
        offset += page.count;
        if (page.count < 200) break;
      }
      this.loadedCountries.add(code);
    } catch {
      // Retain local data and allow the next country selection to retry.
    }
  }
  private merge(page: Station[]) {
    if (!page.length) return;
    const merged = new Map((this.isDemo() ? [] : this.stations()).map((s) => [s.id, s]));
    for (const s of page) merged.set(s.id, s);
    this.stations.set([...merged.values()]);
    this.isDemo.set(false);
  }
  private storeUrl(value: unknown, host: string) {
    try {
      const u = new URL(String(value));
      return u.protocol === 'https:' && u.hostname === host ? u.href : '';
    } catch {
      return '';
    }
  }
}
