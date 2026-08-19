import { useEffect, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createAppI18n, normalizeLocale, type AppLocale } from '@shared/i18n';

export const rendererI18n = createAppI18n();

export async function setRendererLocale(locale: unknown): Promise<AppLocale> {
  const next = normalizeLocale(locale);
  await rendererI18n.changeLanguage(next);
  document.documentElement.lang = next;
  return next;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = normalizeLocale(rendererI18n.resolvedLanguage);
    const onLanguageChanged = (locale: string) => {
      document.documentElement.lang = normalizeLocale(locale);
    };
    rendererI18n.on('languageChanged', onLanguageChanged);
    return () => { rendererI18n.off('languageChanged', onLanguageChanged); };
  }, []);

  return <I18nextProvider i18n={rendererI18n}>{children}</I18nextProvider>;
}
