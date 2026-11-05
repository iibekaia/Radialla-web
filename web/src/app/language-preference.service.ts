import { Injectable, signal } from '@angular/core';
import { LANGUAGES } from './localization.mjs';
const KEY = 'radialla.language';
@Injectable({ providedIn: 'root' })
export class LanguagePreferenceService {
  readonly value = signal(this.read());
  readonly sessionOnly = signal(false);
  read() {
    try {
      const value = localStorage.getItem(KEY) || 'auto';
      return value === 'auto' || LANGUAGES.some((language) => language.id === value)
        ? value
        : 'auto';
    } catch {
      return 'auto';
    }
  }
  save(value: string) {
    this.value.set(value);
    try {
      localStorage.setItem(KEY, value);
      this.sessionOnly.set(false);
    } catch {
      this.sessionOnly.set(true);
    }
  }
  refresh() {
    this.value.set(this.read());
  }
}
