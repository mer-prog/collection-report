import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import en from "./en.json";
import ja from "./ja.json";

export type Locale = "en" | "ja";

type TranslationMap = typeof en;

const translations: Record<Locale, TranslationMap> = { en, ja };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function I18nProvider({
  children,
  defaultLocale = "ja",
}: {
  children: ReactNode;
  defaultLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("app-locale") as Locale | null;
      if (saved === "en" || saved === "ja") return saved;
    }
    return defaultLocale;
  });

  const handleSetLocale = useCallback((newLocale: Locale) => {
    setLocale(newLocale);
    if (typeof window !== "undefined") {
      localStorage.setItem("app-locale", newLocale);
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const value = getNestedValue(translations[locale], key);
      if (typeof value !== "string") {
        // Fallback to the key itself if not found
        return key;
      }
      if (!params) return value;
      return Object.entries(params).reduce<string>(
        (result, [paramKey, paramValue]) =>
          result.replace(
            new RegExp(`\\{\\{${paramKey}\\}\\}`, "g"),
            String(paramValue),
          ),
        value,
      );
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale: handleSetLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
}

/**
 * Helper to get an array value from translations (e.g. day abbreviations).
 */
export function useTranslationArray(key: string): string[] {
  const { locale } = useTranslation();
  const value = getNestedValue(translations[locale], key);
  if (Array.isArray(value)) return value as string[];
  return [];
}
