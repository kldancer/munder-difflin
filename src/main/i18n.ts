import {
  createTranslator,
  normalizeLocale,
  type AppLocale,
  type Translate,
  type TranslateOptions
} from '../shared/i18n';
import { readConfig } from './config';

const translators = new Map<AppLocale, Translate>();

export function t(key: string, options?: TranslateOptions): string {
  const locale = normalizeLocale(readConfig().locale);
  let translate = translators.get(locale);
  if (!translate) {
    translate = createTranslator(locale);
    translators.set(locale, translate);
  }
  return translate(key, options);
}
