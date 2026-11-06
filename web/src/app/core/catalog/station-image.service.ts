import { Injectable } from '@angular/core';

export const STATION_IMAGE_FALLBACK = 'radio-logo.png';

/** Share failed artwork URLs between station rows and the player for this page session. */
@Injectable({ providedIn: 'root' })
export class StationImageService {
  private readonly failed = new Set<string>();

  source(value: string | null | undefined): string {
    try {
      const url = new URL(value || '');
      if (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        !url.username &&
        !url.password &&
        !this.failed.has(url.href)
      )
        return url.href;
    } catch {}
    return STATION_IMAGE_FALLBACK;
  }

  markFailed(url: string) {
    if (url !== STATION_IMAGE_FALLBACK) this.failed.add(url);
  }
}
