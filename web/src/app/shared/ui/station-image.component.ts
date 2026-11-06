import { Component, Input, inject } from '@angular/core';
import {
  STATION_IMAGE_FALLBACK,
  StationImageService,
} from '../../core/catalog/station-image.service';

@Component({
  selector: 'app-station-image',
  standalone: true,
  template: `<img
    [src]="src"
    alt=""
    [loading]="loading"
    referrerpolicy="no-referrer"
    (error)="useFallback()"
  />`,
  styles: `
    :host {
      display: block;
      width: 38px;
      height: 38px;
      flex-shrink: 0;
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 10px;
    }
  `,
})
export class StationImageComponent {
  private readonly images = inject(StationImageService);
  @Input() loading: 'lazy' | 'eager' = 'lazy';
  src = STATION_IMAGE_FALLBACK;

  @Input() set imageUrl(value: string | null | undefined) {
    this.src = this.images.source(value);
  }

  useFallback() {
    this.images.markFailed(this.src);
    this.src = STATION_IMAGE_FALLBACK;
  }
}
