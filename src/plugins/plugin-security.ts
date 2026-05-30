/**
 * 插件安全守卫
 *
 * 提供插件系统的安全层，包括：
 * - API 白名单（沙盒配置）
 * - 错误隔离（try/catch 包裹所有生命周期调用）
 * - 版本兼容性检查（semver）
 * - 权限验证
 *
 * 用法：
 *   import { PluginSecurityGuard } from './plugin-security'
 *   const guard = new PluginSecurityGuard({ currentAppVersion: '1.0.0', pluginApiVersion: '1.0.0' })
 *   const result = guard.validateBeforeInstall(manifest)
 */

import type {
  PluginManifest,
  PluginPermission,
  SandboxConfig,
  ErrorIsolationStrategy,
  PluginContext,
  PluginLifecycle,
  LifecycleValidationResult
} from './types'
import { getLogger } from '@/utils/logger'

const logger = getLogger('plugin:security')

// ==================== 常量 ====================

/** 当前插件 API 协议版本 */
const CURRENT_PLUGIN_API_VERSION = '1.0.0'

/** 默认沙盒配置 */
const DEFAULT_SANDBOX: Required<SandboxConfig> = {
  allowedNamespaces: ['ui', 'events', 'utils'],
  allowedGlobals: ['fetch', 'setTimeout'],
  maxConcurrentRequests: 5,
  maxAiTokensPerCall: 4096,
  storageQuotaBytes: 10 * 1024 * 1024 // 10 MB
}

/** 高权限命名空间 — 需要显式声明权限 */
const HIGH_PRIVILEGE_NAMESPACES: Partial<Record<keyof PluginContext, PluginPermission>> = {
  project: 'project-data',
  ai: 'ai-api',
  data: 'storage',
  register: 'storage' // 注册贡献点视为写操作
}

/** 权限 → 所需命名空间映射（用于双向校验） */
const PERMISSION_NAMESPACE_MAP: Record<PluginPermission, Array<keyof PluginContext>> = {
  'project-data': ['project'],
  'ai-api': ['ai'],
  'storage': ['data'],
  'network': [],
  'filesystem': [],
  'user-settings': []
}

/** 合法的全局对象名称 */
const VALID_GLOBALS: readonly string[] = [
  'fetch',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'crypto',
  'TextEncoder',
  'TextDecoder',
  'URL',
  'URLSearchParams',
  'AbortController',
  'AbortSignal'
]

/** 禁止访问的全局对象 */
const BLOCKED_GLOBALS: readonly string[] = [
  'eval',
  'Function',
  'require',
  'import',
  'globalThis',
  'global',
  'process',
  '__dirname',
  '__filename',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'SharedWorker',
  'ServiceWorker'
]

// ==================== 结果类型 ====================

export interface SecurityCheckResult {
  /** 整体是否通过 */
  allowed: boolean
  /** 致命问题，阻止操作 */
  violations: string[]
  /** 非致命警告 */
  warnings: string[]
}

export interface SecurityGuardConfig {
  /** 当前应用版本 */
  currentAppVersion: string
  /** 当前插件 API 协议版本 */
  pluginApiVersion?: string
  /** 默认错误隔离策略 */
  defaultErrorIsolation?: ErrorIsolationStrategy
  /** 是否严格模式（未知权限视为致命错误） */
  strictMode?: boolean
}

// ==================== Semver 工具 ====================

interface SemverVersion {
  major: number
  minor: number
  patch: number
}

function parseSemver(version: string): SemverVersion | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-[\w\d.-]+)?$/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
}

function compareSemver(a: SemverVersion, b: SemverVersion): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

/**
 * 检查 version >= min（含预发布标签）
 */
function semverGte(version: SemverVersion, min: SemverVersion): boolean {
  return compareSemver(version, min) >= 0
}

/**
 * 检查 version <= max
 */
function semverLte(version: SemverVersion, max: SemverVersion): boolean {
  return compareSemver(version, max) <= 0
}

/**
 * 检查同一主版本内兼容（breaking change 守卫）
 */
function sameMajorVersion(a: SemverVersion, b: SemverVersion): boolean {
  return a.major === b.major
}

// ==================== 安全守卫 ====================

/**
 * 插件安全守卫
 *
 * 在插件安装、激活、停用、卸载等生命周期阶段执行安全检查和错误隔离。
 */
export class PluginSecurityGuard {
  private config: Required<SecurityGuardConfig>

  constructor(config: SecurityGuardConfig) {
    this.config = {
      currentAppVersion: config.currentAppVersion,
      pluginApiVersion: config.pluginApiVersion ?? CURRENT_PLUGIN_API_VERSION,
      defaultErrorIsolation: config.defaultErrorIsolation ?? 'log-and-continue',
      strictMode: config.strictMode ?? false
    }
  }

  // ==================== 1. API 白名单 ====================

  /**
   * 获取插件的沙盒配置
   *
   * 合并默认沙盒与插件声明的沙盒偏好，以宿主配置为准。
   * 仅允许在白名单内的命名空间和全局对象。
   */
  resolveSandbox(manifest: PluginManifest): SandboxConfig {
    const permissions = manifest.permissions ?? []

    // 基于权限推导最小命名空间集
    const requiredNamespaces: Array<keyof PluginContext> = ['ui', 'events', 'utils']
    for (const [perm, namespaces] of Object.entries(PERMISSION_NAMESPACE_MAP) as Array<[PluginPermission, Array<keyof PluginContext>]>) {
      if (permissions.includes(perm)) {
        requiredNamespaces.push(...namespaces)
      }
    }

    // 合并插件声明的偏好与默认值
    const pluginSandbox = (manifest.sandbox ?? {}) as Partial<SandboxConfig>
    const allowedNamespaces = this.intersectNamespaces(
      pluginSandbox.allowedNamespaces ?? requiredNamespaces,
      requiredNamespaces
    )

    return {
      allowedNamespaces,
      allowedGlobals: this.filterAllowedGlobals(
        pluginSandbox.allowedGlobals ?? DEFAULT_SANDBOX.allowedGlobals
      ),
      maxConcurrentRequests: Math.min(
        pluginSandbox.maxConcurrentRequests ?? DEFAULT_SANDBOX.maxConcurrentRequests,
        DEFAULT_SANDBOX.maxConcurrentRequests
      ),
      maxAiTokensPerCall: Math.min(
        pluginSandbox.maxAiTokensPerCall ?? DEFAULT_SANDBOX.maxAiTokensPerCall,
        DEFAULT_SANDBOX.maxAiTokensPerCall
      ),
      storageQuotaBytes: Math.min(
        pluginSandbox.storageQuotaBytes ?? DEFAULT_SANDBOX.storageQuotaBytes,
        DEFAULT_SANDBOX.storageQuotaBytes
      )
    }
  }

  /**
   * 验证命名空间访问权限
   *
   * 返回沙盒化上下文，仅暴露白名单内的命名空间。
   */
  enforceNamespaceAccess(
    context: PluginContext,
    sandbox: SandboxConfig
  ): Partial<PluginContext> {
    const allowed = new Set(sandbox.allowedNamespaces)
    const result: Partial<PluginContext> = {}

    for (const ns of Object.keys(context) as Array<keyof PluginContext>) {
      if (allowed.has(ns)) {
        (result as Record<string, unknown>)[ns] = context[ns]
      }
    }

    return result
  }

  /**
   * 验证全局对象访问
   */
  validateGlobalAccess(requestedGlobals: string[]): SecurityCheckResult {
    const violations: string[] = []
    const warnings: string[] = []

    for (const globalName of requestedGlobals) {
      if (BLOCKED_GLOBALS.includes(globalName)) {
        violations.push(`禁止访问全局对象: ${globalName}`)
      } else if (!VALID_GLOBALS.includes(globalName)) {
        warnings.push(`未知全局对象: ${globalName}，已忽略`)
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      warnings
    }
  }

  // ==================== 2. 错误隔离 ====================

  /**
   * 安全调用插件激活钩子
   */
  async safeActivate(
    manifest: PluginManifest,
    lifecycle: PluginLifecycle,
    context: PluginContext
  ): Promise<SecurityCheckResult> {
    const strategy = manifest.errorIsolation ?? this.config.defaultErrorIsolation

    if (!lifecycle.activate) {
      return { allowed: true, violations: [], warnings: [] }
    }

    try {
      await lifecycle.activate(context)
      return { allowed: true, violations: [], warnings: [] }
    } catch (error: unknown) {
      return this.handleLifecycleError(manifest.id, 'activate', error, strategy)
    }
  }

  /**
   * 安全调用插件停用钩子
   */
  async safeDeactivate(
    manifest: PluginManifest,
    lifecycle: PluginLifecycle
  ): Promise<SecurityCheckResult> {
    const strategy = manifest.errorIsolation ?? this.config.defaultErrorIsolation

    if (!lifecycle.deactivate) {
      return { allowed: true, violations: [], warnings: [] }
    }

    try {
      await lifecycle.deactivate()
      return { allowed: true, violations: [], warnings: [] }
    } catch (error: unknown) {
      return this.handleLifecycleError(manifest.id, 'deactivate', error, strategy)
    }
  }

  /**
   * 安全调用插件卸载钩子
   */
  async safeUninstall(
    manifest: PluginManifest,
    lifecycle: PluginLifecycle
  ): Promise<SecurityCheckResult> {
    const strategy = manifest.errorIsolation ?? this.config.defaultErrorIsolation

    if (!lifecycle.uninstall) {
      return { allowed: true, violations: [], warnings: [] }
    }

    try {
      await lifecycle.uninstall()
      return { allowed: true, violations: [], warnings: [] }
    } catch (error: unknown) {
      return this.handleLifecycleError(manifest.id, 'uninstall', error, strategy)
    }
  }

  // ==================== 3. 版本兼容性 ====================

  /**
   * 检查插件与当前应用的版本兼容性
   *
   * 校验内容：
   * - minAppVersion / maxAppVersion 范围
   * - pluginApiVersion 主版本一致性
   */
  checkVersionCompatibility(manifest: PluginManifest): SecurityCheckResult {
    const violations: string[] = []
    const warnings: string[] = []

    const currentApp = parseSemver(this.config.currentAppVersion)
    if (!currentApp) {
      violations.push(`当前应用版本号格式不合法: ${this.config.currentAppVersion}`)
      return { allowed: false, violations, warnings }
    }

    // 1. 最低应用版本
    if (manifest.minAppVersion) {
      const minVer = parseSemver(manifest.minAppVersion)
      if (!minVer) {
        violations.push(`插件 minAppVersion 格式不合法: ${manifest.minAppVersion}`)
      } else if (!semverGte(currentApp, minVer)) {
        violations.push(
          `插件要求最低应用版本 ${manifest.minAppVersion}，当前版本 ${this.config.currentAppVersion}`
        )
      }
    }

    // 2. 最高应用版本
    if (manifest.maxAppVersion) {
      const maxVer = parseSemver(manifest.maxAppVersion)
      if (!maxVer) {
        violations.push(`插件 maxAppVersion 格式不合法: ${manifest.maxAppVersion}`)
      } else if (!semverLte(currentApp, maxVer)) {
        violations.push(
          `插件兼容的最高应用版本为 ${manifest.maxAppVersion}，当前版本 ${this.config.currentAppVersion}`
        )
      }
    }

    // 3. 插件 API 协议版本
    if (manifest.pluginApiVersion) {
      const pluginApi = parseSemver(manifest.pluginApiVersion)
      const hostApi = parseSemver(this.config.pluginApiVersion)

      if (!pluginApi) {
        violations.push(`插件 pluginApiVersion 格式不合法: ${manifest.pluginApiVersion}`)
      } else if (hostApi) {
        if (!sameMajorVersion(pluginApi, hostApi)) {
          violations.push(
            `插件 API 版本 ${manifest.pluginApiVersion} 与宿主 API 版本 ${this.config.pluginApiVersion} 主版本不兼容`
          )
        } else if (!semverGte(hostApi, pluginApi)) {
          warnings.push(
            `插件 API 版本 ${manifest.pluginApiVersion} 高于宿主 ${this.config.pluginApiVersion}，部分功能可能不可用`
          )
        }
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      warnings
    }
  }

  // ==================== 4. 权限验证 ====================

  /**
   * 验证插件声明的权限是否合法
   */
  validatePermissions(manifest: PluginManifest): SecurityCheckResult {
    const violations: string[] = []
    const warnings: string[] = []
    const permissions = manifest.permissions ?? []

    const validPermissions: ReadonlySet<string> = new Set([
      'storage', 'network', 'filesystem', 'ai-api', 'project-data', 'user-settings'
    ])

    for (const permission of permissions) {
      if (typeof permission !== 'string') {
        violations.push(`权限项类型非法: ${typeof permission}`)
        continue
      }

      if (!validPermissions.has(permission)) {
        if (this.config.strictMode) {
          violations.push(`未知权限: ${permission}`)
        } else {
          warnings.push(`未知权限: ${permission}，已忽略`)
        }
      }
    }

    // 高权限组合检查
    if (permissions.includes('ai-api') && permissions.includes('network')) {
      warnings.push('插件同时请求 ai-api 和 network 权限，允许发起外部 AI 请求')
    }

    if (permissions.includes('filesystem') && permissions.includes('network')) {
      warnings.push('插件同时请求 filesystem 和 network 权限，可能将文件内容发送至远程')
    }

    return {
      allowed: violations.length === 0,
      violations,
      warnings
    }
  }

  /**
   * 检查权限与沙盒命名空间的一致性
   *
   * 插件声明的权限必须覆盖其请求的所有高权限命名空间。
   */
  validatePermissionNamespaceConsistency(manifest: PluginManifest): SecurityCheckResult {
    const violations: string[] = []
    const warnings: string[] = []
    const permissions = new Set(manifest.permissions ?? [])
    const sandboxNs = manifest.sandbox?.allowedNamespaces ?? []

    for (const ns of sandboxNs) {
      const requiredPermission = HIGH_PRIVILEGE_NAMESPACES[ns]
      if (requiredPermission && !permissions.has(requiredPermission)) {
        violations.push(
          `命名空间 "${ns}" 需要 "${requiredPermission}" 权限，但插件未声明`
        )
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      warnings
    }
  }

  // ==================== 综合验证 ====================

  /**
   * 安装前综合安全检查
   */
  validateBeforeInstall(manifest: PluginManifest): LifecycleValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // 1. 版本兼容性
    const versionResult = this.checkVersionCompatibility(manifest)
    errors.push(...versionResult.violations)
    warnings.push(...versionResult.warnings)

    // 2. 权限验证
    const permResult = this.validatePermissions(manifest)
    errors.push(...permResult.violations)
    warnings.push(...permResult.warnings)

    // 3. 权限-命名空间一致性
    const consistencyResult = this.validatePermissionNamespaceConsistency(manifest)
    errors.push(...consistencyResult.violations)
    warnings.push(...consistencyResult.warnings)

    // 4. 全局对象白名单
    if (manifest.sandbox?.allowedGlobals) {
      const globalResult = this.validateGlobalAccess(manifest.sandbox.allowedGlobals)
      errors.push(...globalResult.violations)
      warnings.push(...globalResult.warnings)
    }

    // 5. 沙盒配置合理性
    const sandboxResult = this.validateSandboxConfig(manifest)
    errors.push(...sandboxResult.violations)
    warnings.push(...sandboxResult.warnings)

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * 激活前安全检查
   */
  validateBeforeActivate(manifest: PluginManifest): LifecycleValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // 权限二次校验（安装后、激活前）
    const permResult = this.validatePermissions(manifest)
    errors.push(...permResult.violations)
    warnings.push(...permResult.warnings)

    // 版本兼容性二次校验
    const versionResult = this.checkVersionCompatibility(manifest)
    errors.push(...versionResult.violations)
    warnings.push(...versionResult.warnings)

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  // ==================== 内部方法 ====================

  /**
   * 处理生命周期错误
   */
  private handleLifecycleError(
    pluginId: string,
    phase: string,
    error: unknown,
    strategy: ErrorIsolationStrategy
  ): SecurityCheckResult {
    const message = error instanceof Error ? error.message : String(error)
    const logMsg = `插件 ${pluginId} ${phase} 阶段出错: ${message}`

    switch (strategy) {
      case 'log-and-continue':
        logger.warn(logMsg)
        return {
          allowed: true,
          violations: [],
          warnings: [logMsg]
        }

      case 'deactivate-plugin':
        logger.error(logMsg)
        return {
          allowed: false,
          violations: [`${logMsg}，插件将被停用`],
          warnings: []
        }

      case 'propagate':
        logger.error(logMsg)
        throw error instanceof Error ? error : new Error(logMsg)

      default:
        logger.warn(logMsg)
        return {
          allowed: true,
          violations: [],
          warnings: [logMsg]
        }
    }
  }

  /**
   * 求两个命名空间列表的交集（保留顺序）
   */
  private intersectNamespaces(
    requested: Array<keyof PluginContext>,
    required: Array<keyof PluginContext>
  ): Array<keyof PluginContext> {
    const requiredSet = new Set(required)
    const seen = new Set<keyof PluginContext>()
    const result: Array<keyof PluginContext> = []

    for (const ns of requested) {
      if (requiredSet.has(ns) && !seen.has(ns)) {
        seen.add(ns)
        result.push(ns)
      }
    }

    // 确保所有必需的命名空间都被包含
    for (const ns of required) {
      if (!seen.has(ns)) {
        result.push(ns)
      }
    }

    return result
  }

  /**
   * 过滤并验证全局对象列表
   */
  private filterAllowedGlobals(globals: Array<string>): Array<'fetch' | 'setTimeout' | 'setInterval' | 'crypto'> {
    const allowed: Array<'fetch' | 'setTimeout' | 'setInterval' | 'crypto'> = []
    const validSet: ReadonlySet<string> = new Set(['fetch', 'setTimeout', 'setInterval', 'crypto'])

    for (const g of globals) {
      if (BLOCKED_GLOBALS.includes(g)) {
        logger.warn(`已拒绝插件请求的禁止全局对象: ${g}`)
        continue
      }
      if (validSet.has(g)) {
        allowed.push(g as 'fetch' | 'setTimeout' | 'setInterval' | 'crypto')
      }
    }

    return allowed
  }

  /**
   * 验证沙盒配置合理性
   */
  private validateSandboxConfig(manifest: PluginManifest): SecurityCheckResult {
    const violations: string[] = []
    const warnings: string[] = []

    if (!manifest.sandbox) {
      return { allowed: true, violations, warnings }
    }

    const sandbox = manifest.sandbox

    // 请求并发数上限检查
    if (sandbox.maxConcurrentRequests !== undefined) {
      if (sandbox.maxConcurrentRequests > DEFAULT_SANDBOX.maxConcurrentRequests) {
        warnings.push(
          `请求的并发请求数 ${sandbox.maxConcurrentRequests} 超过上限 ${DEFAULT_SANDBOX.maxConcurrentRequests}，已截断`
        )
      }
      if (sandbox.maxConcurrentRequests < 1) {
        violations.push('maxConcurrentRequests 必须 >= 1')
      }
    }

    // AI token 上限检查
    if (sandbox.maxAiTokensPerCall !== undefined) {
      if (sandbox.maxAiTokensPerCall > DEFAULT_SANDBOX.maxAiTokensPerCall) {
        warnings.push(
          `请求的单次 AI token 数 ${sandbox.maxAiTokensPerCall} 超过上限 ${DEFAULT_SANDBOX.maxAiTokensPerCall}，已截断`
        )
      }
      if (sandbox.maxAiTokensPerCall < 1) {
        violations.push('maxAiTokensPerCall 必须 >= 1')
      }
    }

    // 存储配额检查
    if (sandbox.storageQuotaBytes !== undefined) {
      if (sandbox.storageQuotaBytes > DEFAULT_SANDBOX.storageQuotaBytes) {
        warnings.push(
          `请求的存储配额 ${sandbox.storageQuotaBytes} 超过上限 ${DEFAULT_SANDBOX.storageQuotaBytes}，已截断`
        )
      }
      if (sandbox.storageQuotaBytes < 0) {
        violations.push('storageQuotaBytes 必须 >= 0')
      }
    }

    // 命名空间合法性检查
    if (sandbox.allowedNamespaces) {
      const validNamespaces: ReadonlySet<string> = new Set([
        'project', 'ai', 'data', 'ui', 'events', 'register', 'utils'
      ])
      for (const ns of sandbox.allowedNamespaces) {
        if (!validNamespaces.has(ns)) {
          if (this.config.strictMode) {
            violations.push(`未知命名空间: ${ns}`)
          } else {
            warnings.push(`未知命名空间: ${ns}，已忽略`)
          }
        }
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      warnings
    }
  }
}

// ==================== 便捷工厂 ====================

/**
 * 创建默认安全守卫实例
 */
export function createDefaultSecurityGuard(appVersion: string): PluginSecurityGuard {
  return new PluginSecurityGuard({
    currentAppVersion: appVersion,
    pluginApiVersion: CURRENT_PLUGIN_API_VERSION,
    defaultErrorIsolation: 'log-and-continue',
    strictMode: false
  })
}

/**
 * 创建严格模式安全守卫实例
 */
export function createStrictSecurityGuard(appVersion: string): PluginSecurityGuard {
  return new PluginSecurityGuard({
    currentAppVersion: appVersion,
    pluginApiVersion: CURRENT_PLUGIN_API_VERSION,
    defaultErrorIsolation: 'deactivate-plugin',
    strictMode: true
  })
}
