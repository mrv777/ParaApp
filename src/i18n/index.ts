/**
 * i18n exports
 */

// Initialize i18n on import
import './config';

// Re-export i18n instance and hooks
export { default as i18n } from './config';
export { useTranslation, Trans } from 'react-i18next';

// Re-export translation type for type-safe translations
export type { TranslationKeys } from './locales/en';
