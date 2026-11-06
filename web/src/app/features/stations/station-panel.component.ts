import { FormsModule } from '@angular/forms';
import { NgSelectComponent, NgOptionComponent } from '@ng-select/ng-select';
import { Component, effect, inject, signal } from '@angular/core';
import { ExplorerService } from '../explorer/explorer.service';
import { StationImageComponent } from '../../shared/ui/station-image.component';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-station-panel',
  standalone: true,
  imports: [
    StationImageComponent,
    IconComponent,
    FormsModule,
    NgSelectComponent,
    NgOptionComponent,
  ],
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
