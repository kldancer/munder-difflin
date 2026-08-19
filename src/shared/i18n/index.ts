import i18next, { type i18n } from 'i18next';
import { translationResources } from './resources';

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'zh-CN';
export const FALLBACK_LOCALE: AppLocale = 'en-US';

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(value: unknown): AppLocale {
  if (isAppLocale(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN';
    if (normalized === 'en' || normalized.startsWith('en-')) return 'en-US';
  }
  return DEFAULT_LOCALE;
}

export function createAppI18n(locale: unknown = DEFAULT_LOCALE): i18n {
  const instance = i18next.createInstance();
  void instance.init({
    // i18next mutates resource stores (for example removeResourceBundle in
    // tests/dev tooling). Each process/renderer instance must stay isolated.
    resources: structuredClone(translationResources),
    lng: normalizeLocale(locale),
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    nonExplicitSupportedLngs: false,
    load: 'currentOnly',
    initImmediate: false,
    interpolation: { escapeValue: false },
    returnNull: false,
    keySeparator: '.',
    nsSeparator: false,
    showSupportNotice: false
  });
  return instance;
}

export type TranslateOptions = Record<string, unknown>;
export type Translate = (key: string, options?: TranslateOptions) => string;

export function createTranslator(locale: unknown = DEFAULT_LOCALE): Translate {
  const instance = createAppI18n(locale);
  return (key, options) => String(instance.t(key, options as never));
}

export { translationResources };
