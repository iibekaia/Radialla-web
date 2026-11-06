import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ExplorerService } from '../explorer/explorer.service';
import { StationImageComponent } from '../../shared/ui/station-image.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { PictureInPictureController } from './picture-in-picture-controller';
import {
  copyStationLink,
  facebookShareLink,
  shareStationLink,
  stationLink,
} from '../../core/sharing/station-link.mjs';

@Component({
  selector: 'app-mini-player',
  standalone: true,
  imports: [StationImageComponent, IconComponent],
  templateUrl: './mini-player.component.html',
  styleUrl: './mini-player.component.css',
})
export class MiniPlayerComponent implements AfterViewInit, OnDestroy {
  readonly vm = inject(ExplorerService);
  readonly youtubeSearch = computed(() => {
    const track = this.vm.player.metadata.track();
    if (!this.vm.player.playing() || !track) return null;
    const query = [track.artist?.trim(), track.title.trim()].filter(Boolean).join(' ');
    const url = new URL('https://www.youtube.com/results');
    url.searchParams.set('search_query', query);
    return { url: url.href, query };
  });
  readonly playerElement = viewChild.required<ElementRef<HTMLElement>>('player');
  readonly pipOpen = signal(false);
  readonly shareStatus = signal('');
  readonly sharing = signal(false);
  readonly manualShareLink = signal('');
  readonly facebookLink = computed(() => {
    const station = this.vm.selected();
    return station ? facebookShareLink(stationLink(window.location.href, station.id)) : null;
  });
  private pip?: PictureInPictureController;
  constructor() {
    effect(() => {
      this.vm.selected()?.id;
      this.shareStatus.set('');
      this.manualShareLink.set('');
    });
    effect(() => {
      const language = this.vm.i18n.language();
      const title = this.vm.selected()?.name || 'Radialla';
      this.pip?.update(language, title);
    });
  }
  ngAfterViewInit() {
    this.pip = new PictureInPictureController(this.playerElement().nativeElement, {
      playing: () => this.vm.player.playing(),
      changed: (open) => this.pipOpen.set(open),
    });
    this.pip.update(this.vm.i18n.language(), this.vm.selected()?.name || 'Radialla');
  }
  returnToTab() {
    this.pip?.returnToTab();
  }
  ngOnDestroy() {
    this.pip?.destroy();
  }
  changeVolume(event: Event) {
    this.vm.player.setVolume(Number((event.target as HTMLInputElement).value) / 100);
  }
  async shareStation(copyOnly = false) {
    const station = this.vm.selected();
    if (!station || this.sharing()) return;
    this.sharing.set(true);
    this.shareStatus.set('');
    this.manualShareLink.set('');
    const url = stationLink(window.location.href, station.id);
    try {
      const result = copyOnly
        ? await copyStationLink(url)
        : await shareStationLink(url, station.name);
      if (this.vm.selected()?.id !== station.id) return;
      if (result === 'copied') this.shareStatus.set('stationLinkCopied');
      if (result === 'manual') this.manualShareLink.set(url);
    } finally {
      this.sharing.set(false);
    }
  }
  selectShareLink(event: Event) {
    (event.target as HTMLInputElement).select();
  }
}
