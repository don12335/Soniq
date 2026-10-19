import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  type Locale,
  getStoredLocale,
  storeLocale,
} from "./locale";
import { createTranslatorSync, type TFunction } from "./translator";

interface I18nContextValue {
  locale: Locale;
  t: TFunction;
  setLocale: (locale: Locale) => void;
  loading: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale());

  const setLocale = useCallback((newLocale: Locale) => {
    storeLocale(newLocale);
    setLocaleState(newLocale);
  }, []);

  // keep <html lang> in sync so CSS :lang() rules and font fallback match the UI language
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t: TFunction = useMemo(() => createTranslatorSync(locale), [locale]);

  const value = useMemo(
    () => ({ locale, t, setLocale, loading: false }),
    [locale, t, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // fallback gracefully so components never crash during hmr or outside provider
    const locale = getStoredLocale();
    return {
      locale,
      t: createTranslatorSync(locale),
      setLocale: storeLocale,
      loading: false,
    };
  }
  return ctx;
}
