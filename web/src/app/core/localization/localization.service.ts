import { Injectable, computed, effect, inject, signal, DestroyRef } from '@angular/core';
import { LanguagePreferenceService } from '../storage/language-preference.service';
import { LANGUAGES, resolveLanguage, translate } from './localization.mjs';
import en from './locales/en.json';
import ka from './locales/ka.json';
import ru from './locales/ru.json';
import uk from './locales/uk.json';
import zh from './locales/zh-Hans.json';
import ko from './locales/ko.json';
import hy from './locales/hy.json';
import tr from './locales/tr.json';
const dictionaries: Record<string, Record<string, string>> = {
  en,
  ka,
  ru,
  uk,
  'zh-Hans': zh,
  ko,
  hy,
  tr,
};
@Injectable({ providedIn: 'root' })
export class LocalizationService {
  readonly preference = inject(LanguagePreferenceService);
  readonly languages = LANGUAGES;
  private readonly browserLanguages = signal([...navigator.languages]);
  readonly language = computed(() =>
    resolveLanguage(this.preference.value(), this.browserLanguages()),
  );
  constructor() {
    const change = () => this.browserLanguages.set([...navigator.languages]);
    const storage = (e: StorageEvent) => {
      if (e.key === 'radialla.language' || e.key === null) this.preference.refresh();
    };
    window.addEventListener('languagechange', change);
    window.addEventListener('storage', storage);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('languagechange', change);
      window.removeEventListener('storage', storage);
    });
    effect(() => {
      document.documentElement.lang = this.language();
      document.title = `Radialla · ${this.t('live')}`;
    });
  }
  t(key: string, ...args: Array<string | number>) {
    return translate(
      dictionaries,
      this.language(),
      key,
      args.map((a) => (typeof a === 'number' ? this.number(a) : a)),
    );
  }
  number(value: number) {
    return new Intl.NumberFormat(this.language()).format(value);
  }
  country(fallback: string, code?: string) {
    try {
      return code
        ? new Intl.DisplayNames([this.language()], { type: 'region' }).of(code) || fallback
        : fallback;
    } catch {
      return fallback;
    }
  }
  choose(value: string) {
    if (value === 'auto' || LANGUAGES.some((l) => l.id === value)) this.preference.save(value);
  }
}
