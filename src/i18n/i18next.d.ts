import 'i18next'
import type en from './en.json'

// Type-checks translation keys: t('nav.dashboard') compiles, t('nav.dashbord') does not.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
  }
}
