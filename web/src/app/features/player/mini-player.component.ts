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
  private pip?: PictureInPictureController;
  constructor() {
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
}
