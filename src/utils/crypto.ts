import type { ModelProvider, ProjectConfig } from '@/types'
import { isWebRuntime } from '@/utils/anthropic-guard'

const ENCRYPTION_PREFIX = 'enc:v1:'
const ENCRYPTION_PREFIX_V2 = 'enc:v2:'
const APP_SECRET_SEED = 'ai-novel-workshop-config'

function getEnvironmentSeed(): string {
  const runtime = isWebRuntime() ? 'web' : 'tauri'
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

async function deriveAESKey(seed: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(seed.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
  return keyMaterial
}

export function isEncryptedApiKey(value?: string | null): boolean {
  return typeof value === 'string' && (value.startsWith(ENCRYPTION_PREFIX) || value.startsWith(ENCRYPTION_PREFIX_V2))
}

/**
 * @deprecated Use `encryptApiKeyV2` instead for AES-GCM encryption.
 */
export function encryptApiKey(key: string): string {
  if (!key || isEncryptedApiKey(key)) {
    return key
  }

  const keyBytes = new TextEncoder().encode(key)
  const encrypted = xorBytes(keyBytes, getEnvironmentSeed())
  return `${ENCRYPTION_PREFIX}${encodeBase64(encrypted)}`
}

/**
 * @deprecated Use `decryptApiKeyV2` instead for AES-GCM decryption.
 * Kept for backward compatibility with `enc:v1:` prefixed values.
 */
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

export async function encryptApiKeyV2(key: string): Promise<string> {
  if (!key) return key
  if (key.startsWith(ENCRYPTION_PREFIX_V2)) return key

  const aesKey = await deriveAESKey(getEnvironmentSeed())
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(key)
  )
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return `${ENCRYPTION_PREFIX_V2}${encodeBase64(combined)}`
}

export async function decryptApiKeyV2(encrypted: string): Promise<string> {
  if (!encrypted) return encrypted
  if (encrypted.startsWith(ENCRYPTION_PREFIX)) {
    // Fallback to old XOR decryption for backward compat
    return decryptApiKey(encrypted)
  }
  if (!encrypted.startsWith(ENCRYPTION_PREFIX_V2)) return encrypted

  try {
    const payload = encrypted.slice(ENCRYPTION_PREFIX_V2.length)
    const combined = decodeBase64(payload)
    const iv = combined.slice(0, 12)
    const data = combined.slice(12)
    const aesKey = await deriveAESKey(getEnvironmentSeed())
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      data
    )
    return new TextDecoder().decode(decrypted)
  } catch (error) {
    console.warn('[crypto] API Key AES-GCM 解密失败', error)
    return ''
  }
}

export async function writeEncryptedLocalStorage<T>(key: string, data: T): Promise<void> {
  const serialized = JSON.stringify(data)
  const encrypted = await encryptApiKeyV2(serialized)
  localStorage.setItem(key, encrypted)
}

export async function readEncryptedLocalStorage<T>(key: string): Promise<T | null> {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    if (isEncryptedApiKey(raw)) {
      const decrypted = await decryptApiKeyV2(raw)
      return JSON.parse(decrypted) as T
    }
    return JSON.parse(raw) as T
  } catch {
    return null
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

export async function encryptProjectConfig(config: ProjectConfig): Promise<ProjectConfig> {
  const providers = await Promise.all((config.providers || []).map(async provider => {
    const clonedProvider = cloneProvider(provider)
    return {
      ...clonedProvider,
      apiKey: await encryptApiKeyV2(clonedProvider.apiKey)
    }
  }))
  return { ...config, providers }
}

export async function decryptProjectConfig(config: ProjectConfig): Promise<ProjectConfig> {
  const providers = await Promise.all((config.providers || []).map(async provider => {
    const clonedProvider = cloneProvider(provider)
    return {
      ...clonedProvider,
      apiKey: await decryptApiKeyV2(clonedProvider.apiKey)
    }
  }))
  return { ...config, providers }
}
