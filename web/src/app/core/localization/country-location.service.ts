import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { detectCountry } from './country-detection.mjs';

@Injectable({ providedIn: 'root' })
export class CountryLocationService {
  private readonly detectedCountry = signal<string | null>(null);
  readonly country = this.detectedCountry.asReadonly();
  private readonly controller = new AbortController();
  private request?: Promise<void>;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller.abort());
  }

  detect(): Promise<void> {
    return (this.request ||= detectCountry(fetch, this.controller.signal).then((country) => {
      if (!this.controller.signal.aborted) this.detectedCountry.set(country);
    }));
  }
}
