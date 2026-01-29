'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';

// Static imports for SSG compatibility
import enMessages from '../../messages/en.json';
import zhTWMessages from '../../messages/zh-TW.json';
import zhCNMessages from '../../messages/zh-CN.json';

type Locale = 'en' | 'zh-TW' | 'zh-CN';

const COOKIE_NAME = 'NEXT_LOCALE';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function setLocaleCookie(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

// Pre-loaded messages map
const messagesMap = {
  'en': enMessages,
  'zh-TW': zhTWMessages,
  'zh-CN': zhCNMessages,
};

// Valid locales for type checking
const validLocales: Locale[] = ['en', 'zh-TW', 'zh-CN'];

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return context;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Initialize with 'en' for SSR, will hydrate from localStorage/cookie on client
  const [locale, setLocaleState] = useState<Locale>('en');

  // Load locale from localStorage and sync cookie on mount (client-side only)
  useEffect(() => {
    try {
      const savedLocale = localStorage.getItem('locale') as Locale;
      if (savedLocale && validLocales.includes(savedLocale)) {
        setLocaleState(savedLocale);
        setLocaleCookie(savedLocale);
      }
    } catch (error) {
      console.warn('localStorage not available:', error);
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem('locale', newLocale);
      setLocaleCookie(newLocale);
      router.refresh(); // Re-run server components (e.g. blog) with new locale
    } catch (error) {
      console.warn('Failed to save locale:', error);
    }
  }, [router]);

  // Get messages for current locale (statically loaded, always available)
  const messages = messagesMap[locale];

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

