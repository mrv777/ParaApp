/**
 * i18n configuration
 * Using i18next with react-i18next for React Native
 * Supports English, Spanish, German, French, and Portuguese with device language detection
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import en from './locales/en';
import es from './locales/es';
import de from './locales/de';
import fr from './locales/fr';
import pt from './locales/pt';
import type { Language } from '@/store/settingsStore';

// Supported languages
export const SUPPORTED_LANGUAGES = ['en', 'es', 'de', 'fr', 'pt'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Get the device's preferred language, falling back to English
 */
function getDeviceLanguage(): SupportedLanguage {
  const locales = Localization.getLocales();
  const deviceLang = locales[0]?.languageCode ?? 'en';
  return SUPPORTED_LANGUAGES.includes(deviceLang as SupportedLanguage)
    ? (deviceLang as SupportedLanguage)
    : 'en';
}

// Initialize i18next with device language
const initialLanguage = getDeviceLanguage();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    de: { translation: de },
    fr: { translation: fr },
    pt: { translation: pt },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: {
    // React Native handles escaping
    escapeValue: false,
  },
  // Disable suspense for React Native
  react: {
    useSuspense: false,
  },
});

/**
 * Change the app language
 * @param lang - 'auto' for device language, or specific language code
 */
export function changeLanguage(lang: Language): void {
  if (lang === 'auto') {
    i18n.changeLanguage(getDeviceLanguage());
  } else {
    i18n.changeLanguage(lang);
  }
}

/**
 * Get the currently active language code
 */
export function getCurrentLanguage(): SupportedLanguage {
  return (i18n.language as SupportedLanguage) ?? 'en';
}

export default i18n;
