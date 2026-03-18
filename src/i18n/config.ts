import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import he from './locales/he.json';

const resources = {
  en: { translation: en },
  he: { translation: he },
};

// Detect language from localStorage or browser, default to Hebrew
const getInitialLanguage = () => {
  const stored = localStorage.getItem('language');
  if (stored && ['en', 'he'].includes(stored)) {
    return stored;
  }
  
  // Default to Hebrew
  return 'he';
};

// Helper function to set direction based on language
export const setLanguageDirection = (language: string) => {
  const dir = language === 'he' ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', language === 'he' ? 'he-IL' : 'en-US');
  document.documentElement.style.direction = dir;
  localStorage.setItem('language', language);
};

const initialLanguage = getInitialLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    fallbackLng: 'he',
    interpolation: {
      escapeValue: false,
    },
  });

// Set initial direction
setLanguageDirection(initialLanguage);

// Listen for language changes
i18n.on('languageChanged', (lng) => {
  setLanguageDirection(lng);
});

export default i18n;
