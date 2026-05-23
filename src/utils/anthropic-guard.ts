/**
 * Anthropic 官方接口浏览器直连防护
 *
 * Web 端禁止直连 api.anthropic.com，防止 API Key 在浏览器中泄露。
 * Tauri 桌面端不受限制。
 */

const ALLOWED_OFFICIAL_HOSTS = new Set(['api.anthropic.com'])

export function isWebRuntime(): boolean {
  if (!__APP_IS_TAURI__) return true
  if (typeof window === 'undefined') return false

  const tauriInternals = (window as Window & {
    __TAURI_INTERNALS__?: { invoke?: unknown }
  }).__TAURI_INTERNALS__

  return typeof tauriInternals?.invoke !== 'function'
}

export function isOfficialAnthropicEndpoint(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase().replace(/\.+$/, '')
    if (!host) return false
    return ALLOWED_OFFICIAL_HOSTS.has(host)
  } catch {
    return false
  }
}

export function enforceSecureAnthropicAccess(baseUrl: string): void {
  if (isWebRuntime() && isOfficialAnthropicEndpoint(baseUrl)) {
    throw new Error(
      '安全策略限制：Web 端禁止直连 Anthropic 官方接口。请改用后端代理或自定义 Provider。'
    )
  }
}
