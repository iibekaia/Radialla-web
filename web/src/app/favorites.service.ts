import { Injectable, signal } from '@angular/core';
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
  toggle(id: string) {
    const next = this.ids().includes(id) ? this.ids().filter((x) => x !== id) : [...this.ids(), id];
    this.ids.set(next);
    try {
      localStorage.setItem('radialla.favorites', JSON.stringify(next));
    } catch {
      this.notice.set('sessionFavorites');
    }
  }
}
