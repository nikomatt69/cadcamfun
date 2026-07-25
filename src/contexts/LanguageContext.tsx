import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";

// Define supported languages
export const SUPPORTED_LANGUAGES = {
  en: "English",
  fr: "Français",
  es: "Español",
  it: "Italiano"
} as const;

type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  translations: Record<string, any>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);
const translationsCache = new Map<LanguageCode, Record<string, any>>();

interface LanguageProviderProps {
  children: ReactNode;
  defaultLanguage?: LanguageCode;
}

export function LanguageProvider({ children, defaultLanguage = "en" }: LanguageProviderProps) {
  const [language, setLanguage] = useState<LanguageCode>(() => {
    if (typeof window === "undefined") return defaultLanguage;

    const storedLanguage = window.localStorage.getItem("preferredLanguage") as LanguageCode | null;
    return storedLanguage && storedLanguage in SUPPORTED_LANGUAGES ? storedLanguage : defaultLanguage;
  });
  const [translations, setTranslations] = useState<Record<string, any>>({});

  useEffect(() => {
    const cachedTranslations = translationsCache.get(language);
    if (cachedTranslations) {
      setTranslations(cachedTranslations);
      return;
    }

    const controller = new AbortController();

    // Load translations for the current language
    const loadTranslations = async () => {
      try {
        const response = await fetch(`/locales/${language}/common.json`, {
          signal: controller.signal
        });
        const data = await response.json();
        translationsCache.set(language, data);
        setTranslations(data);
      } catch (error) {
        if (controller.signal.aborted) return;

        console.error(`Failed to load translations for ${language}:`, error);
        // Fallback to English if translation loading fails
        if (language !== "en") {
          setLanguage("en");
        }
      }
    };

    loadTranslations();

    return () => {
      controller.abort();
    };
  }, [language]);

  const handleSetLanguage = useCallback((newLanguage: LanguageCode) => {
    setLanguage(newLanguage);
    // Store language preference in localStorage
    if (typeof window !== "undefined") {
      window.localStorage.setItem("preferredLanguage", newLanguage);
    }
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage: handleSetLanguage,
      translations
    }),
    [handleSetLanguage, language, translations]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
