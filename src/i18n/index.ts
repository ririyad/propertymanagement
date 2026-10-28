import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'

// English only for now; Bangla (bn.json) arrives in Phase 6 (AGENT.md D10).
void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  initAsync: false,
  interpolation: { escapeValue: false },
})

export default i18n
