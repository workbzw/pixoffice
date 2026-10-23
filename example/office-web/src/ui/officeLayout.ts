import type { OfficeLayoutId } from '@pixoffice/protocol/office-integration'

export type OfficeLayoutControl = { value: OfficeLayoutId; busy: boolean; onChange: (layoutId: OfficeLayoutId) => void }
export const officeShellStorageKey = 'pixoffice.page-shell.v1'

export function resolveOfficeShell(search: string, saved = ''): OfficeLayoutId {
  const requested = new URLSearchParams(search).get('shell')
  const value = requested || saved
  return value === 'members' ? 'members' : 'classic'
}

export function readOfficeShell(): OfficeLayoutId {
  let saved = ''
  try { saved = localStorage.getItem(officeShellStorageKey) ?? '' } catch { /* Layout selection also works without storage. */ }
  return resolveOfficeShell(location.search, saved)
}

export function saveOfficeShell(value: OfficeLayoutId) {
  try { localStorage.setItem(officeShellStorageKey, value) } catch { /* Keep the current page usable if storage is unavailable. */ }
  const url = new URL(location.href)
  url.searchParams.set('shell', value)
  history.replaceState(history.state, '', url)
}
