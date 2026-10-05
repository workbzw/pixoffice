export type WebsiteLocale = 'zh' | 'en'
export const websiteLocaleKey = 'pixoffice.website.locale'

function isLocale(value: unknown): value is WebsiteLocale {
  return value === 'zh' || value === 'en'
}

export function resolveWebsiteLocale(requested: string | null, saved: string | null, languages: readonly string[]): WebsiteLocale {
  if (isLocale(requested)) return requested
  if (isLocale(saved)) return saved
  for (const language of languages) {
    const primary = language.toLowerCase().split('-')[0]
    if (isLocale(primary)) return primary
  }
  return 'zh'
}

export function readWebsiteLocale(): WebsiteLocale {
  let saved: string | null = null
  try { saved = localStorage.getItem(websiteLocaleKey) } catch { /* Storage can be unavailable in embedded or private browsers. */ }
  return resolveWebsiteLocale(new URLSearchParams(location.search).get('lang'), saved, navigator.languages)
}

export function rememberWebsiteLocale(locale: WebsiteLocale) {
  try { localStorage.setItem(websiteLocaleKey, locale) } catch { /* The URL still retains the selection if storage is blocked. */ }
  const url = new URL(location.href)
  url.searchParams.set('lang', locale)
  history.replaceState(history.state, '', url)
}
