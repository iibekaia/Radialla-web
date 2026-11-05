import { Component, inject } from '@angular/core';
import { ExplorerService } from './explorer.service';
import { StationMapComponent } from './station-map.component';
import { StationPanelComponent } from './station-panel.component';
import { MiniPlayerComponent } from './mini-player.component';
import { LanguagePickerComponent } from './language-picker.component';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [StationMapComponent, StationPanelComponent, MiniPlayerComponent, LanguagePickerComponent, IconComponent],
  templateUrl: './app.component.html',
  styleUrl: './explorer-layout.css',
})
export class AppComponent {
  readonly vm = inject(ExplorerService);
}
