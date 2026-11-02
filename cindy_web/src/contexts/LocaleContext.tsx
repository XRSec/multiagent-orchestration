import React, { createContext, useContext, useEffect, useState } from 'react';

export type Locale = 'zh-CN' | 'en-US';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (zh: string, en: string) => string;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'zh-CN',
  setLocale: () => {},
  toggleLocale: () => {},
  t: (zh, en) => zh,
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('cindy_locale');
    return (saved === 'en-US' || saved === 'zh-CN') ? saved : 'zh-CN';
  });

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('cindy_locale', newLocale);
  };

  const toggleLocale = () => {
    setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN');
  };

  const t = (zh: string, en: string) => (locale === 'zh-CN' ? zh : en);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, toggleLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
