import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Define supported languages
export const SUPPORTED_LANGUAGES = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
} as const;

type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  translations: Record<string, any>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
  defaultLanguage?: LanguageCode;
}

export function LanguageProvider({ children, defaultLanguage = 'en' }: LanguageProviderProps) {
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [translations, setTranslations] = useState<Record<string, any>>({});

  useEffect(() => {
    // Load translations for the current language
    const loadTranslations = async () => {
      try {
        const response = await fetch(`/locales/${language}/common.json`);
        const data = await response.json();
        setTranslations(data);
      } catch (error) {
        console.error(`Failed to load translations for ${language}:`, error);
        // Fallback to English if translation loading fails
        if (language !== 'en') {
          setLanguage('en');
        }
      }
    };

    loadTranslations();
  }, [language]);

  const handleSetLanguage = (newLanguage: LanguageCode) => {
    setLanguage(newLanguage);
    // Store language preference in localStorage
    localStorage.setItem('preferredLanguage', newLanguage);
  };

  return (
    <LanguageContext.Provider 
      value={{ 
        language, 
        setLanguage: handleSetLanguage, 
        translations 
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}