import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import de from './locales/de.json'

/** Load persisted language from config, default to 'en'. */
async function getPersistedLanguage(): Promise<string> {
  try {
    const api = (window as any).cipherMux
    if (!api?.config?.get) return 'en'
    const ui = await api.config.get('ui')
    return ui?.language ?? 'en'
  } catch {
    return 'en'
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
  },
  lng: 'en', // sync default, overridden after config load
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // preact already escapes
  },
})

// Load persisted language async (after preload is ready)
void getPersistedLanguage().then((lng) => {
  if (lng !== i18n.language) {
    void i18n.changeLanguage(lng)
  }
})

export default i18n
