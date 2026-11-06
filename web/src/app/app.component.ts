import { Component, inject } from '@angular/core';
import { ExplorerService } from './features/explorer/explorer.service';
import { StationMapComponent } from './features/map/station-map.component';
import { StationPanelComponent } from './features/stations/station-panel.component';
import { MiniPlayerComponent } from './features/player/mini-player.component';
import { LanguagePickerComponent } from './core/localization/language-picker.component';
import { IconComponent } from './shared/ui/icon.component';
import { PairingComponent } from './features/pairing/pairing.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    StationMapComponent,
    StationPanelComponent,
    MiniPlayerComponent,
    LanguagePickerComponent,
    IconComponent,
    PairingComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly vm = inject(ExplorerService);
}
