import { Component, Input } from '@angular/core';

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
  @Input() loading: 'lazy' | 'eager' = 'lazy';
  src = 'radio-logo.png';

  @Input() set imageUrl(value: string | null | undefined) {
    this.src = 'radio-logo.png';
    try {
      const url = new URL(value || '');
      if (url.protocol === 'https:' || url.protocol === 'http:') this.src = url.href;
    } catch {}
  }

  useFallback() {
    if (this.src !== 'radio-logo.png') this.src = 'radio-logo.png';
  }
}
