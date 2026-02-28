'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fr, type Translations } from './fr';
import { en } from './en';
import { Locale } from 'date-fns';
import { fr as dateFnsFr } from 'date-fns/locale/fr';
import { enUS as dateFnsEn } from 'date-fns/locale/en-US';
import React from 'react';

export type Language = 'fr' | 'en';

const dictionaries: Record<Language, Translations> = { fr, en };
const dateFnsLocales: Record<Language, Locale> = { fr: dateFnsFr, en: dateFnsEn };

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  dateFnsLocale: Locale;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'fr',
  setLanguage: () => {},
  t: fr,
  dateFnsLocale: dateFnsFr,
});

export function LanguageProvider({
  children,
  initialLanguage = 'fr',
}: {
  children: React.ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, []);

  // Set lang attribute on mount
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value: I18nContextValue = {
    language,
    setLanguage,
    t: dictionaries[language],
    dateFnsLocale: dateFnsLocales[language],
  };

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useTranslation() {
  return useContext(I18nContext);
}

export type { Translations };
