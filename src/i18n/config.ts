/**
 * i18n configuration
 * Using i18next with react-i18next for React Native
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';

// Initialize i18next
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en',
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

export default i18n;
