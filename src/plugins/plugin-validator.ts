/**
 * 插件清单验证器
 *
 * 提供对 PluginManifest 的全面验证，包括：
 * - 必填字段检查
 * - 字段类型检查
 * - ID / 版本号格式校验
 * - 权限声明合法性
 * - 贡献点结构与内部字段校验
 * - 依赖声明合法性
 * - 配置 Schema 校验
 *
 * 使用方式：
 *   import { validateManifest } from './plugin-validator'
 *   const result = validateManifest(manifest)
 *   if (!result.valid) console.error(result.errors)
 */

import type {
  PluginManifest,
  PluginPermission
} from './types'

// ==================== 结果类型 ====================

export interface ValidationResult {
  /** 整体是否通过（无 errors） */
  valid: boolean
  /** 致命错误，阻止插件安装 */
  errors: string[]
  /** 非致命警告，不阻止安装但建议修复 */
  warnings: string[]
}

// ==================== 常量 ====================

const REQUIRED_FIELDS: Array<keyof PluginManifest> = [
  'id',
  'name',
  'version',
  'author',
  'description'
]

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[\w\d.-]+)?$/

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

const VALID_PERMISSIONS: readonly PluginPermission[] = [
  'storage',
  'network',
  'filesystem',
  'ai-api',
  'project-data',
  'user-settings'
]

const VALID_PROCESSOR_STAGES = ['pre-import', 'post-import', 'pre-export', 'post-generation'] as const

const VALID_SIDEBAR_POSITIONS = ['left', 'right'] as const

const VALID_TOOLBAR_LOCATIONS = ['chapter-editor', 'outline-editor', 'character-editor'] as const

const VALID_THEME_MODES = ['light', 'dark'] as const

const VALID_CONFIG_TYPES = ['string', 'number', 'boolean', 'array', 'object'] as const

const MAX_ID_LENGTH = 128
const MAX_NAME_LENGTH = 256
const MAX_DESCRIPTION_LENGTH = 2048

// ==================== 主验证入口 ====================

/**
 * 验证插件清单，返回结构化结果。
 *
 * @param manifest - 待验证的原始对象（可能是 untrusted JSON）
 * @returns ValidationResult
 */
export function validateManifest(manifest: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 0. 基本结构检查
  if (!manifest || typeof manifest !== 'object') {
    return result(['manifest 必须是一个对象'])
  }

  const m = manifest as Record<string, unknown>

  // 1. 必填字段
  for (const field of REQUIRED_FIELDS) {
    if (m[field] === undefined || m[field] === null || m[field] === '') {
      errors.push(`缺少必填字段: ${field}`)
    }
  }

  // 如果缺少 id/version，后续校验意义不大
  if (errors.length > 0) {
    return result(errors, warnings)
  }

  // 2. 字段类型检查
  checkStringField(m, 'id', errors)
  checkStringField(m, 'name', errors)
  checkStringField(m, 'version', errors)
  checkStringField(m, 'author', errors)
  checkStringField(m, 'description', errors)

  if (m.icon !== undefined && m.icon !== null && typeof m.icon !== 'string') {
    errors.push('icon 必须是字符串')
  }
  if (m.homepage !== undefined && m.homepage !== null && typeof m.homepage !== 'string') {
    errors.push('homepage 必须是字符串')
  }
  if (m.repository !== undefined && m.repository !== null && typeof m.repository !== 'string') {
    errors.push('repository 必须是字符串')
  }

  // 3. ID 格式
  if (typeof m.id === 'string') {
    if (!ID_PATTERN.test(m.id)) {
      errors.push('id 只能包含小写字母、数字和连字符，且必须以字母或数字开头')
    }
    if (m.id.length > MAX_ID_LENGTH) {
      errors.push(`id 长度不能超过 ${MAX_ID_LENGTH} 个字符`)
    }
  }

  // 4. 版本号格式
  if (typeof m.version === 'string' && !SEMVER_PATTERN.test(m.version)) {
    errors.push(`版本号格式不正确: "${m.version}"，应为 semver 格式 (例如: 1.0.0)`)
  }

  // 5. 字段长度
  if (typeof m.name === 'string' && m.name.length > MAX_NAME_LENGTH) {
    errors.push(`name 长度不能超过 ${MAX_NAME_LENGTH} 个字符`)
  }
  if (typeof m.description === 'string' && m.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description 长度不能超过 ${MAX_DESCRIPTION_LENGTH} 个字符`)
  }

  // 6. 权限
  if (m.permissions !== undefined && m.permissions !== null) {
    checkPermissions(m.permissions, errors, warnings)
  }

  // 7. 依赖
  if (m.dependencies !== undefined && m.dependencies !== null) {
    checkDependencies(m.dependencies, errors)
  }

  // 8. 贡献点
  if (m.contributes !== undefined && m.contributes !== null) {
    checkContributions(m.contributes, errors, warnings)
  }

  // 9. 配置 Schema
  if (m.configuration !== undefined && m.configuration !== null) {
    checkConfiguration(m.configuration, errors, warnings)
  }

  return result(errors, warnings)
}

/**
 * 快速检查：manifest 是否至少包含所有必填字段。
 * 比 validateManifest 更轻量，适合在性能敏感路径使用。
 */
export function hasRequiredFields(manifest: unknown): boolean {
  if (!manifest || typeof manifest !== 'object') return false
  const m = manifest as Record<string, unknown>
  return REQUIRED_FIELDS.every(
    field => m[field] !== undefined && m[field] !== null && m[field] !== ''
  )
}

/**
 * 仅验证版本号格式。
 */
export function isValidSemver(version: unknown): boolean {
  return typeof version === 'string' && SEMVER_PATTERN.test(version)
}

/**
 * 仅验证插件 ID 格式。
 */
export function isValidPluginId(id: unknown): boolean {
  return typeof id === 'string' && ID_PATTERN.test(id) && id.length <= MAX_ID_LENGTH
}

// ==================== 内部校验函数 ====================

function result(errors: string[], warnings: string[] = []): ValidationResult {
  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

function checkStringField(
  obj: Record<string, unknown>,
  field: string,
  errors: string[]
): void {
  const value = obj[field]
  if (value !== undefined && value !== null && typeof value !== 'string') {
    errors.push(`${field} 必须是字符串`)
  }
}

function checkPermissions(
  permissions: unknown,
  errors: string[],
  warnings: string[]
): void {
  if (!Array.isArray(permissions)) {
    errors.push('permissions 必须是数组')
    return
  }

  for (const permission of permissions) {
    if (typeof permission !== 'string') {
      errors.push(`权限项必须是字符串，得到: ${typeof permission}`)
      continue
    }
    if (!VALID_PERMISSIONS.includes(permission as PluginPermission)) {
      warnings.push(`未知权限: "${permission}"，已知权限: ${VALID_PERMISSIONS.join(', ')}`)
    }
  }
}

function checkDependencies(
  dependencies: unknown,
  errors: string[]
): void {
  if (typeof dependencies !== 'object' || dependencies === null || Array.isArray(dependencies)) {
    errors.push('dependencies 必须是对象 (Record<string, string>)')
    return
  }

  const deps = dependencies as Record<string, unknown>
  for (const [depId, version] of Object.entries(deps)) {
    if (typeof depId !== 'string' || depId.trim() === '') {
      errors.push('依赖项的 key 必须是非空字符串')
    }
    if (typeof version !== 'string' || version.trim() === '') {
      errors.push(`依赖 "${depId}" 的版本范围必须是非空字符串`)
    }
  }
}

function checkContributions(
  contributes: unknown,
  errors: string[],
  warnings: string[]
): void {
  if (typeof contributes !== 'object' || contributes === null || Array.isArray(contributes)) {
    errors.push('contributes 必须是对象')
    return
  }

  const c = contributes as Record<string, unknown>

  // AI Providers
  if (c.aiProviders !== undefined) {
    checkArrayField(c.aiProviders, 'aiProviders', errors)
    if (Array.isArray(c.aiProviders)) {
      for (const item of c.aiProviders) {
        checkContributionId(item, 'aiProviders', errors)
      }
    }
  }

  // Exporters
  if (c.exporters !== undefined) {
    checkArrayField(c.exporters, 'exporters', errors)
    if (Array.isArray(c.exporters)) {
      for (const item of c.exporters) {
        checkContributionId(item, 'exporters', errors)
        if (item && typeof item === 'object') {
          checkExporterFields(item as Record<string, unknown>, errors)
        }
      }
    }
  }

  // Importers
  if (c.importers !== undefined) {
    checkArrayField(c.importers, 'importers', errors)
    if (Array.isArray(c.importers)) {
      for (const item of c.importers) {
        checkContributionId(item, 'importers', errors)
        if (item && typeof item === 'object') {
          checkImporterFields(item as Record<string, unknown>, errors)
        }
      }
    }
  }

  // Processors
  if (c.processors !== undefined) {
    checkArrayField(c.processors, 'processors', errors)
    if (Array.isArray(c.processors)) {
      for (const item of c.processors) {
        checkContributionId(item, 'processors', errors)
        if (item && typeof item === 'object') {
          checkProcessorFields(item as Record<string, unknown>, errors, warnings)
        }
      }
    }
  }

  // Menu Items
  if (c.menuItems !== undefined) {
    checkArrayField(c.menuItems, 'menuItems', errors)
    if (Array.isArray(c.menuItems)) {
      for (const item of c.menuItems) {
        checkContributionId(item, 'menuItems', errors)
      }
    }
  }

  // Sidebar Panels
  if (c.sidebarPanels !== undefined) {
    checkArrayField(c.sidebarPanels, 'sidebarPanels', errors)
    if (Array.isArray(c.sidebarPanels)) {
      for (const item of c.sidebarPanels) {
        checkContributionId(item, 'sidebarPanels', errors)
        if (item && typeof item === 'object') {
          checkSidebarPanelFields(item as Record<string, unknown>, warnings)
        }
      }
    }
  }

  // Toolbar Buttons
  if (c.toolbarButtons !== undefined) {
    checkArrayField(c.toolbarButtons, 'toolbarButtons', errors)
    if (Array.isArray(c.toolbarButtons)) {
      for (const item of c.toolbarButtons) {
        checkContributionId(item, 'toolbarButtons', errors)
        if (item && typeof item === 'object') {
          checkToolbarButtonFields(item as Record<string, unknown>, warnings)
        }
      }
    }
  }

  // Quick Commands
  if (c.quickCommands !== undefined) {
    checkArrayField(c.quickCommands, 'quickCommands', errors)
    if (Array.isArray(c.quickCommands)) {
      for (const item of c.quickCommands) {
        checkContributionId(item, 'quickCommands', errors)
      }
    }
  }

  // AI Action Handlers
  if (c.aiActionHandlers !== undefined) {
    checkArrayField(c.aiActionHandlers, 'aiActionHandlers', errors)
    if (Array.isArray(c.aiActionHandlers)) {
      for (const item of c.aiActionHandlers) {
        if (!item || typeof item !== 'object') {
          errors.push('aiActionHandlers 中的每一项必须是对象')
          continue
        }
        const handler = item as Record<string, unknown>
        if (!handler.type || typeof handler.type !== 'string') {
          errors.push('aiActionHandler 必须包含字符串类型的 type 字段')
        }
      }
    }
  }

  // Themes
  if (c.themes !== undefined) {
    checkArrayField(c.themes, 'themes', errors)
    if (Array.isArray(c.themes)) {
      for (const item of c.themes) {
        checkContributionId(item, 'themes', errors)
        if (item && typeof item === 'object') {
          checkThemeFields(item as Record<string, unknown>, warnings)
        }
      }
    }
  }
}

function checkArrayField(
  value: unknown,
  fieldName: string,
  errors: string[]
): void {
  if (!Array.isArray(value)) {
    errors.push(`${fieldName} 必须是数组`)
  }
}

function checkContributionId(
  item: unknown,
  collection: string,
  errors: string[]
): void {
  if (!item || typeof item !== 'object') {
    errors.push(`${collection} 中的每一项必须是对象`)
    return
  }
  const obj = item as Record<string, unknown>
  // aiActionHandlers use "type" instead of "id"
  if (collection !== 'aiActionHandlers') {
    if (!obj.id || typeof obj.id !== 'string') {
      errors.push(`${collection} 中的项缺少字符串类型的 id 字段`)
    }
  }
}

function checkExporterFields(
  item: Record<string, unknown>,
  errors: string[]
): void {
  if (!item.format || typeof item.format !== 'string') {
    errors.push(`exporter "${item.id}" 缺少字符串类型的 format 字段`)
  }
  if (!item.fileExtension || typeof item.fileExtension !== 'string') {
    errors.push(`exporter "${item.id}" 缺少字符串类型的 fileExtension 字段`)
  }
  if (!item.mimeType || typeof item.mimeType !== 'string') {
    errors.push(`exporter "${item.id}" 缺少字符串类型的 mimeType 字段`)
  }
}

function checkImporterFields(
  item: Record<string, unknown>,
  errors: string[]
): void {
  if (!Array.isArray(item.supportedFormats)) {
    errors.push(`importer "${item.id}" 的 supportedFormats 必须是数组`)
  }
  if (!Array.isArray(item.fileExtensions)) {
    errors.push(`importer "${item.id}" 的 fileExtensions 必须是数组`)
  }
}

function checkProcessorFields(
  item: Record<string, unknown>,
  errors: string[],
  warnings: string[]
): void {
  if (!item.stage || typeof item.stage !== 'string') {
    errors.push(`processor "${item.id}" 缺少字符串类型的 stage 字段`)
  } else if (!VALID_PROCESSOR_STAGES.includes(item.stage as typeof VALID_PROCESSOR_STAGES[number])) {
    warnings.push(
      `processor "${item.id}" 的 stage "${item.stage}" 无效，` +
      `有效值: ${VALID_PROCESSOR_STAGES.join(', ')}`
    )
  }
}

function checkSidebarPanelFields(
  item: Record<string, unknown>,
  warnings: string[]
): void {
  if (item.position && !VALID_SIDEBAR_POSITIONS.includes(item.position as typeof VALID_SIDEBAR_POSITIONS[number])) {
    warnings.push(
      `sidebarPanel "${item.id}" 的 position "${item.position}" 无效，` +
      `有效值: ${VALID_SIDEBAR_POSITIONS.join(', ')}`
    )
  }
}

function checkToolbarButtonFields(
  item: Record<string, unknown>,
  warnings: string[]
): void {
  if (item.location && !VALID_TOOLBAR_LOCATIONS.includes(item.location as typeof VALID_TOOLBAR_LOCATIONS[number])) {
    warnings.push(
      `toolbarButton "${item.id}" 的 location "${item.location}" 无效，` +
      `有效值: ${VALID_TOOLBAR_LOCATIONS.join(', ')}`
    )
  }
}

function checkThemeFields(
  item: Record<string, unknown>,
  warnings: string[]
): void {
  if (item.mode && !VALID_THEME_MODES.includes(item.mode as typeof VALID_THEME_MODES[number])) {
    warnings.push(
      `theme "${item.id}" 的 mode "${item.mode}" 无效，` +
      `有效值: ${VALID_THEME_MODES.join(', ')}`
    )
  }
}

function checkConfiguration(
  configuration: unknown,
  errors: string[],
  warnings: string[]
): void {
  if (typeof configuration !== 'object' || configuration === null || Array.isArray(configuration)) {
    errors.push('configuration 必须是对象')
    return
  }

  const config = configuration as Record<string, unknown>
  for (const [key, definition] of Object.entries(config)) {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      errors.push(`configuration.${key} 必须是对象`)
      continue
    }

    const def = definition as Record<string, unknown>
    if (!def.type || typeof def.type !== 'string') {
      errors.push(`configuration.${key} 缺少 type 字段`)
      continue
    }

    if (!VALID_CONFIG_TYPES.includes(def.type as typeof VALID_CONFIG_TYPES[number])) {
      warnings.push(
        `configuration.${key} 的 type "${def.type}" 不受支持，` +
        `有效值: ${VALID_CONFIG_TYPES.join(', ')}`
      )
    }
  }
}
