import { Component, input } from '@angular/core';
@Component({
  selector: 'app-icon',
  standalone: true,
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path [attr.d]="paths[name()] || paths['radio']" />
  </svg>`,
  styles: [
    ':host{display:inline-flex;width:24px;height:24px;flex-shrink:0}svg{width:100%;height:100%}',
  ],
})
export class IconComponent {
  readonly name = input('radio');
  readonly paths: Record<string, string> = {
    globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-4 5-4 13 0 18M12 3c4 5 4 13 0 18',
    search: 'M21 21l-5-5M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15',
    menu: 'M4 6h16M4 12h16M4 18h16',
    close: 'M6 6l12 12M18 6L6 18',
    heart:
      'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
    radio: 'M4 8h16v12H4zM4 8l14-5M7 12h5M7 16h2M17 13a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
    layers: 'M12 3L2 8l10 5 10-5-10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    location: 'M21 3l-7 18-3-8-8-3L21 3Z',
    play: 'M8 5l11 7-11 7Z',
    pause: 'M8 5v14M16 5v14',
    next: 'M5 5l11 7-11 7ZM19 5v14',
    previous: 'M19 5L8 12l11 7ZM5 5v14',
    down: 'M6 9l6 6 6-6',
    volume: 'M11 4L6 8H3v8h3l5 4V4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',
    muted: 'M11 4L6 8H3v8h3l5 4V4ZM16 9l6 6M22 9l-6 6',
  };
}
