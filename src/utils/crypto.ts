import type { ModelProvider, ProjectConfig } from '@/types'

const ENCRYPTION_PREFIX = 'enc:v1:'
const APP_SECRET_SEED = 'ai-novel-workshop-config'

function getEnvironmentSeed(): string {
  const runtime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 'tauri' : 'web'
  const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown-origin'
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown-user-agent'

  return `${APP_SECRET_SEED}:${runtime}:${origin}:${userAgent}`
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''

  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }

  if (typeof btoa === 'function') {
    return btoa(binary)
  }

  return Buffer.from(binary, 'binary').toString('base64')
}

function decodeBase64(base64: string): Uint8Array {
  const binary = typeof atob === 'function'
    ? atob(base64)
    : Buffer.from(base64, 'base64').toString('binary')

  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

function xorBytes(input: Uint8Array, seed: string): Uint8Array {
  const seedBytes = new TextEncoder().encode(seed)
  const output = new Uint8Array(input.length)

  for (let i = 0; i < input.length; i += 1) {
    output[i] = input[i] ^ seedBytes[i % seedBytes.length]
  }

  return output
}

export function isEncryptedApiKey(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX)
}

export function encryptApiKey(key: string): string {
  if (!key || isEncryptedApiKey(key)) {
    return key
  }

  const keyBytes = new TextEncoder().encode(key)
  const encrypted = xorBytes(keyBytes, getEnvironmentSeed())
  return `${ENCRYPTION_PREFIX}${encodeBase64(encrypted)}`
}

export function decryptApiKey(encrypted: string): string {
  if (!encrypted || !isEncryptedApiKey(encrypted)) {
    return encrypted
  }

  try {
    const payload = encrypted.slice(ENCRYPTION_PREFIX.length)
    const encryptedBytes = decodeBase64(payload)
    const decrypted = xorBytes(encryptedBytes, getEnvironmentSeed())
    return new TextDecoder().decode(decrypted)
  } catch (error) {
    console.warn('[crypto] API Key 解密失败，将返回空字符串', error)
    return ''
  }
}

export function maskSecret(secret?: string | null, prefixLength = 4, suffixLength = 2): string {
  if (!secret) {
    return ''
  }

  if (secret.length <= prefixLength + suffixLength) {
    return '*'.repeat(secret.length)
  }

  return `${secret.slice(0, prefixLength)}${'*'.repeat(Math.max(secret.length - prefixLength - suffixLength, 4))}${secret.slice(-suffixLength)}`
}

export function redactSensitiveText(text: string, secrets: Array<string | undefined | null> = []): string {
  let sanitized = text

  for (const secret of secrets) {
    if (!secret) {
      continue
    }

    sanitized = sanitized.split(secret).join(maskSecret(secret))
  }

  sanitized = sanitized
    .replace(/(Bearer\s+)([A-Za-z0-9._\-]+)/gi, (_, prefix: string, token: string) => `${prefix}${maskSecret(token)}`)
    .replace(/(x-api-key['":=\s]+)([A-Za-z0-9._\-]+)/gi, (_, prefix: string, token: string) => `${prefix}${maskSecret(token)}`)

  return sanitized
}

function cloneProvider(provider: ModelProvider): ModelProvider {
  return {
    ...provider,
    models: provider.models ? provider.models.map(model => ({ ...model })) : []
  }
}

export function encryptProjectConfig(config: ProjectConfig): ProjectConfig {
  return {
    ...config,
    providers: (config.providers || []).map(provider => {
      const clonedProvider = cloneProvider(provider)
      return {
        ...clonedProvider,
        apiKey: encryptApiKey(clonedProvider.apiKey)
      }
    })
  }
}

export function decryptProjectConfig(config: ProjectConfig): ProjectConfig {
  return {
    ...config,
    providers: (config.providers || []).map(provider => {
      const clonedProvider = cloneProvider(provider)
      return {
        ...clonedProvider,
        apiKey: decryptApiKey(clonedProvider.apiKey)
      }
    })
  }
}
