import { Component, effect, inject, signal } from '@angular/core';
import { ExplorerService } from './explorer.service';
import { StationImageComponent } from './station-image.component';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-station-panel',
  standalone: true,
  imports: [StationImageComponent, IconComponent],
  templateUrl: './station-panel.component.html',
  styleUrl: './station-panel.component.css',
})
export class StationPanelComponent {
  readonly vm = inject(ExplorerService);
  readonly displayLimit = signal(100);
  constructor() {
    effect(() => {
      this.vm.area();
      this.vm.onlyFavorites();
      this.vm.selectedCountry();
      this.displayLimit.set(100);
    });
  }
}
