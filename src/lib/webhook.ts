const KEY = 'helpbet_webhook'

export function loadLocalWebhook(): string {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

export function saveLocalWebhook(url: string) {
  try {
    if (url) localStorage.setItem(KEY, url)
    else localStorage.removeItem(KEY)
  } catch {}
}
