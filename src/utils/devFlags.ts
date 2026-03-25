export const AI_MOCK_ENABLED_STORAGE_KEY = '__ai_mock_enabled__'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

export function getAIMockEnabled(): boolean {
  if (!canUseStorage()) return false
  return localStorage.getItem(AI_MOCK_ENABLED_STORAGE_KEY) === 'true'
}

export function setAIMockEnabled(enabled: boolean): void {
  if (!canUseStorage()) return
  localStorage.setItem(AI_MOCK_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false')
}
