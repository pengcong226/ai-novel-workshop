/**
 * 统一 ID 生成工具
 *
 * 优先使用 crypto.randomUUID()（需要安全上下文），
 * 在不支持的环境（如 HTTP 页面、旧浏览器）降级为自定义实现。
 */

/**
 * 生成 UUID v4 格式的唯一 ID
 *
 * 策略：
 * 1. 优先使用原生 crypto.randomUUID()
 * 2. 降级使用 crypto.getRandomValues() 生成
 * 3. 最终降级使用 Math.random()（理论上不会走到这步）
 */
export function generateId(): string {
  // 优先使用原生 API
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // 降级使用 crypto.getRandomValues
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    // 设置版本号 (4) 和变体位 (10xx)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32)
    ].join('-')
  }

  // 最终降级（在现代浏览器中几乎不会执行到这里）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
