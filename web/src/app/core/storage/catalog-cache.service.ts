import { Injectable } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class CatalogCacheService {
  read(): unknown {
    try {
      return JSON.parse(localStorage.getItem('radialla.catalog') || 'null');
    } catch {
      return null;
    }
  }
  write(stations: unknown) {
    try {
      localStorage.setItem('radialla.catalog', JSON.stringify(stations));
    } catch {}
  }
}
