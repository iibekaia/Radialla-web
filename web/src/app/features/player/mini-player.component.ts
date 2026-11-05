import { Component, inject } from '@angular/core';
import { ExplorerService } from '../explorer/explorer.service';
import { StationImageComponent } from '../../shared/ui/station-image.component';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-mini-player',
  standalone: true,
  imports: [StationImageComponent, IconComponent],
  templateUrl: './mini-player.component.html',
  styleUrl: './mini-player.component.css',
})
export class MiniPlayerComponent {
  readonly vm = inject(ExplorerService);
}
