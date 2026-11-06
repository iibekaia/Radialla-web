import { Component } from '@angular/core';
import { LanguagePickerComponent } from '../../core/localization/language-picker.component';
import { PairingComponent } from '../pairing/pairing.component';

@Component({
  selector: 'app-settings-controls',
  standalone: true,
  host: { class: 'map-settings' },
  imports: [LanguagePickerComponent, PairingComponent],
  template: `<app-language-picker /><app-pairing />`,
  styleUrl: './settings-controls.component.css',
})
export class SettingsControlsComponent {}
