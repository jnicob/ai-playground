import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { MESSAGES, type Locale, type MessageKey } from './messages';

const STORAGE_KEY = 'ai-playground:locale';

type I18nValue = { locale: Locale; setLocale: (l: Locale) => void; t: (key: MessageKey) => string };

const I18nContext = createContext<I18nValue | null>(null);

function initialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'es' || stored === 'en') return stored;
  return navigator.language.startsWith('es') ? 'es' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
  }, []);
  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key) => MESSAGES[locale][key] }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n requires <I18nProvider>');
  return ctx;
}
