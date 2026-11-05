import { Injectable, signal } from '@angular/core';
import { Station } from '../../shared/models/station';
import { toggleStationFavorite } from '../catalog/station-deduplication.mjs';
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  readonly ids = signal<string[]>(this.restore());
  readonly notice = signal('');
  private restore(): string[] {
    try {
      const v = JSON.parse(localStorage.getItem('radialla.favorites') || '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  toggle(station: Station) {
    const next = toggleStationFavorite(this.ids(), station);
    this.ids.set(next);
    try {
      localStorage.setItem('radialla.favorites', JSON.stringify(next));
    } catch {
      this.notice.set('sessionFavorites');
    }
  }
}
