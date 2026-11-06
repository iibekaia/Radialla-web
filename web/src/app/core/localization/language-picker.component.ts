import { FormsModule } from '@angular/forms';
import {
  NgSelectComponent,
  NgOptionComponent,
  NgLabelTemplateDirective,
} from '@ng-select/ng-select';
import { Component, inject } from '@angular/core';
import { IconComponent } from '../../shared/ui/icon.component';
import { LocalizationService } from './localization.service';
@Component({
  selector: 'app-language-picker',
  standalone: true,
  imports: [
    IconComponent,
    FormsModule,
    NgSelectComponent,
    NgOptionComponent,
    NgLabelTemplateDirective,
  ],
  template: `<div class="language-picker" [title]="i18n.t('Language')">
      <ng-select
        class="language-select"
        [ariaLabel]="i18n.t('Language')"
        [ngModel]="i18n.language()"
        (ngModelChange)="i18n.choose($event)"
        [clearable]="false"
        [searchable]="false"
      >
        <ng-template ng-label-tmp><app-icon name="globe" /></ng-template>
        @for (language of i18n.languages; track language.id) {
          <ng-option [value]="language.id"
            ><span [lang]="language.id">{{ language.name }}</span></ng-option
          >
        }
      </ng-select>
    </div>
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
      .language-picker ng-select {
        width: 100%;
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
