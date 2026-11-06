import { Injectable } from '@angular/core';
import { CatalogSnapshot, compactCatalogSnapshot } from './catalog-snapshot.mjs';
@Injectable({ providedIn: 'root' })
export class CatalogCacheService {
  private json(key: string): unknown {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }
  read(): unknown {
    return this.json('radialla.catalog');
  }
  write(snapshot: CatalogSnapshot) {
    try {
      const savedFavorites = this.json('radialla.favorites');
      const favorites = Array.isArray(savedFavorites)
        ? savedFavorites.filter((id) => typeof id === 'string')
        : [];
      const last = this.json('radialla.lastStation');
      if (last && typeof last === 'object' && 'id' in last && typeof last.id === 'string')
        favorites.push(last.id);
      localStorage.setItem(
        'radialla.catalog',
        JSON.stringify(compactCatalogSnapshot(snapshot, favorites)),
      );
    } catch {}
  }
}
