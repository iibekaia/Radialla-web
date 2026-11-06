import { Component, inject } from '@angular/core';
import { IconComponent } from '../../shared/ui/icon.component';
import { LocalizationService } from './localization.service';
@Component({
  selector: 'app-language-picker',
  standalone: true,
  imports: [IconComponent],
  template: `<label class="language-picker" [title]="i18n.t('Language')"
      ><app-icon name="globe" /><select
        #languageSelect
        [attr.aria-label]="i18n.t('Language')"
        (change)="i18n.choose(languageSelect.value)"
      >
        <option value="auto" [selected]="i18n.preference.value() === 'auto'">
          {{ i18n.t('auto') }}
        </option>
        @for (language of i18n.languages; track language.id) {
          <option
            [value]="language.id"
            [selected]="i18n.preference.value() === language.id"
            [lang]="language.id"
          >
            {{ language.name }}
          </option>
        }
      </select></label
    >
    @if (i18n.preference.sessionOnly()) {
      <span role="status" class="language-notice">{{ i18n.t('languageSession') }}</span>
    }`,
  styles: [
    `
      :host {
        display: inline-flex;
        position: relative;
      }
      .language-picker {
        position: relative;
        display: grid;
        place-items: center;
        width: 34px;
        height: 38px;
      }
      .language-picker app-icon {
        width: 20px;
        height: 20px;
      }
      .language-picker select {
        position: absolute;
        inset: 0;
        opacity: 0;
        width: 100%;
        cursor: pointer;
        font: inherit;
      }
      .language-notice {
        position: absolute;
        top: 42px;
        right: 0;
        width: 200px;
        background: var(--surface);
        padding: 12px;
        border-radius: 12px;
        font-size: 11px;
        box-shadow: 0 4px 20px #0002;
      }
    `,
  ],
})
export class LanguagePickerComponent {
  readonly i18n = inject(LocalizationService);
}
