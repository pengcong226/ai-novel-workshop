import { getLogger } from '@/utils/logger'
import type { StateEvent, StateEventType } from '@/types/sandbox'

const logger = getLogger('schema:state-event')

// ─── Validation result ───────────────────────────────────────────────────────

export interface SchemaValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  sanitizedPayload?: StateEvent['payload']
}

// ─── Schema definitions for each event type ──────────────────────────────────

interface PayloadFieldRule {
  field: string
  required: boolean
  type: 'string' | 'number' | 'object' | 'boolean'
  validator?: (value: any) => boolean
  description: string
}

// 合法的事件类型集合，用于快速查找
const VALID_EVENT_TYPES: ReadonlySet<string> = new Set<StateEventType>([
  'PROPERTY_UPDATE',
  'RELATION_ADD',
  'RELATION_REMOVE',
  'RELATION_UPDATE',
  'LOCATION_MOVE',
  'VITAL_STATUS_CHANGE',
  'ABILITY_CHANGE',
])

// 合法的事件来源集合
const VALID_SOURCES: ReadonlySet<string> = new Set(['MANUAL', 'AI_EXTRACTED', 'MIGRATION'])

// 坐标对象校验器
function isValidCoordinates(value: unknown): boolean {
  if (value === null || value === undefined || typeof value !== 'object') return false
  const coord = value as Record<string, unknown>
  return (
    typeof coord.x === 'number' &&
    typeof coord.y === 'number' &&
    !isNaN(coord.x) &&
    !isNaN(coord.y)
  )
}

// 各事件类型的 payload 字段规则映射
const PAYLOAD_SCHEMA: Record<StateEventType, PayloadFieldRule[]> = {
  PROPERTY_UPDATE: [
    { field: 'key', required: true, type: 'string', description: '属性名' },
    { field: 'value', required: true, type: 'string', description: '属性值' },
  ],
  RELATION_ADD: [
    { field: 'targetId', required: true, type: 'string', description: '目标实体ID' },
    { field: 'relationType', required: true, type: 'string', description: '关系类型' },
    { field: 'attitude', required: false, type: 'string', description: '态度' },
  ],
  RELATION_REMOVE: [
    { field: 'targetId', required: true, type: 'string', description: '目标实体ID' },
    { field: 'relationType', required: false, type: 'string', description: '关系类型' },
  ],
  RELATION_UPDATE: [
    { field: 'targetId', required: true, type: 'string', description: '目标实体ID' },
    { field: 'relationType', required: false, type: 'string', description: '关系类型' },
    { field: 'attitude', required: false, type: 'string', description: '态度' },
  ],
  LOCATION_MOVE: [
    { field: 'coordinates', required: false, type: 'object', validator: isValidCoordinates, description: '坐标 {x,y}' },
    { field: 'value', required: false, type: 'string', description: '位置描述' },
  ],
  VITAL_STATUS_CHANGE: [
    { field: 'status', required: true, type: 'string', description: '生命状态' },
  ],
  ABILITY_CHANGE: [
    { field: 'abilityName', required: true, type: 'string', description: '能力名称' },
    { field: 'abilityStatus', required: true, type: 'string', description: '能力状态' },
  ],
}

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

/**
 * 判断值是否为非空字符串
 */
function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * 检查给定类型是否为预期的 payload 字段类型
 */
function matchesType(value: unknown, expectedType: PayloadFieldRule['type']): boolean {
  if (value === null || value === undefined) return false
  switch (expectedType) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && !isNaN(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'object':
      return typeof value === 'object'
    default:
      return false
  }
}

/**
 * 获取类型名称的中文描述
 */
function typeDisplayName(type: PayloadFieldRule['type']): string {
  switch (type) {
    case 'string':
      return '字符串'
    case 'number':
      return '数字'
    case 'boolean':
      return '布尔值'
    case 'object':
      return '对象'
    default:
      return type
  }
}

// ─── StateEventSchema 主类 ───────────────────────────────────────────────────

export class StateEventSchema {
  /**
   * 校验完整的 StateEvent 对象
   */
  static validate(event: Partial<StateEvent>): SchemaValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // ── 顶层字段校验 ──

    if (!event.id || !isNonEmptyString(event.id)) {
      errors.push('缺少必填字段 id，或 id 为空')
    }

    if (!event.projectId || !isNonEmptyString(event.projectId)) {
      errors.push('缺少必填字段 projectId，或 projectId 为空')
    }

    if (event.chapterNumber === undefined || event.chapterNumber === null) {
      errors.push('缺少必填字段 chapterNumber')
    } else if (typeof event.chapterNumber !== 'number' || isNaN(event.chapterNumber)) {
      errors.push(`chapterNumber 必须为数字，当前值: ${String(event.chapterNumber)}`)
    } else if (event.chapterNumber < 0) {
      errors.push(`chapterNumber 不能小于 0，当前值: ${event.chapterNumber}`)
    } else if (!Number.isInteger(event.chapterNumber)) {
      errors.push(`chapterNumber 必须为整数，当前值: ${event.chapterNumber}`)
    }

    if (!event.entityId || !isNonEmptyString(event.entityId)) {
      errors.push('缺少必填字段 entityId，或 entityId 为空')
    }

    if (!event.eventType) {
      errors.push('缺少必填字段 eventType')
    } else if (!StateEventSchema.isValidEventType(event.eventType)) {
      errors.push(
        `无效的 eventType: "${event.eventType}"，合法值: ${Array.from(VALID_EVENT_TYPES).join(', ')}`
      )
    }

    if (!event.source) {
      errors.push('缺少必填字段 source')
    } else if (!VALID_SOURCES.has(event.source)) {
      errors.push(
        `无效的 source: "${event.source}"，合法值: ${Array.from(VALID_SOURCES).join(', ')}`
      )
    }

    // 如果顶层字段校验已经失败或 eventType 不合法，无法继续校验 payload
    if (errors.length > 0 || !event.eventType || !StateEventSchema.isValidEventType(event.eventType)) {
      logger.warn('StateEvent 校验失败', { errors, event })
      return { valid: false, errors, warnings }
    }

    // ── payload 校验 ──

    const payloadResult = StateEventSchema.validatePayload(
      event.eventType as StateEventType,
      (event.payload as Record<string, unknown>) ?? {}
    )

    errors.push(...payloadResult.errors)
    warnings.push(...payloadResult.warnings)

    const valid = errors.length === 0

    if (valid) {
      logger.debug('StateEvent 校验通过', { id: event.id, eventType: event.eventType })
    } else {
      logger.warn('StateEvent 校验失败', { errors, event })
    }

    return {
      valid,
      errors,
      warnings,
      sanitizedPayload: payloadResult.sanitizedPayload,
    }
  }

  /**
   * 仅校验指定 eventType 的 payload 字段
   */
  static validatePayload(
    eventType: StateEventType,
    payload: Record<string, unknown>
  ): SchemaValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const schema = PAYLOAD_SCHEMA[eventType]

    if (!schema) {
      errors.push(`未找到 eventType "${eventType}" 的 payload 校验规则`)
      logger.error('未找到 payload 校验规则', { eventType })
      return { valid: false, errors, warnings }
    }

    for (const rule of schema) {
      const value = payload[rule.field]
      const fieldLabel = `${rule.description}(${rule.field})`

      // 必填字段检查
      if (rule.required) {
        if (value === undefined || value === null) {
          errors.push(`payload 缺少必填字段: ${fieldLabel}`)
          continue
        }

        if (rule.type === 'string' && !isNonEmptyString(value)) {
          errors.push(`payload 字段 ${fieldLabel} 不能为空字符串`)
          continue
        }
      }

      // 如果字段不存在且非必填，跳过后续校验
      if (value === undefined || value === null) {
        continue
      }

      // 类型检查
      if (!matchesType(value, rule.type)) {
        errors.push(
          `payload 字段 ${fieldLabel} 类型不匹配，期望 ${typeDisplayName(rule.type)}，实际类型: ${typeof value}`
        )
        continue
      }

      // 自定义校验器
      if (rule.validator && !rule.validator(value)) {
        errors.push(`payload 字段 ${fieldLabel} 校验未通过`)
      }
    }

    // 检查 payload 中是否存在未知字段
    const knownFields = new Set(schema.map((r) => r.field))
    for (const key of Object.keys(payload)) {
      if (!knownFields.has(key)) {
        warnings.push(`payload 包含未知字段: "${key}"，该字段将被忽略`)
      }
    }

    const valid = errors.length === 0
    const sanitizedPayload = StateEventSchema.sanitizePayload(eventType, payload)

    if (!valid) {
      logger.warn('payload 校验失败', { eventType, errors })
    }

    return { valid, errors, warnings, sanitizedPayload }
  }

  /**
   * 清理 payload：只保留已知字段，修剪字符串，类型校正
   */
  static sanitizePayload(
    eventType: StateEventType,
    payload: Record<string, unknown>
  ): StateEvent['payload'] {
    const schema = PAYLOAD_SCHEMA[eventType]
    if (!schema) {
      logger.warn('无法清理 payload：未找到 eventType 的校验规则', { eventType })
      return {}
    }

    const sanitized: Record<string, unknown> = {}
    const knownFields = new Set(schema.map((r) => r.field))

    for (const rule of schema) {
      const value = payload[rule.field]

      // 跳过不存在的字段
      if (value === undefined || value === null) continue

      // 只保留已知字段
      if (!knownFields.has(rule.field)) continue

      switch (rule.type) {
        case 'string':
          if (typeof value === 'string') {
            sanitized[rule.field] = value.trim()
          } else {
            // 尝试强制转换为字符串
            sanitized[rule.field] = String(value).trim()
          }
          break

        case 'number':
          if (typeof value === 'number' && !isNaN(value)) {
            sanitized[rule.field] = value
          } else if (typeof value === 'string') {
            const parsed = Number(value)
            if (!isNaN(parsed)) {
              sanitized[rule.field] = parsed
            }
          }
          break

        case 'boolean':
          if (typeof value === 'boolean') {
            sanitized[rule.field] = value
          } else if (typeof value === 'string') {
            if (value === 'true') sanitized[rule.field] = true
            else if (value === 'false') sanitized[rule.field] = false
          }
          break

        case 'object':
          if (typeof value === 'object') {
            // 对 coordinates 做特殊处理
            if (rule.field === 'coordinates' && isValidCoordinates(value)) {
              const coord = value as { x: number; y: number }
              sanitized[rule.field] = { x: coord.x, y: coord.y }
            } else if (rule.field !== 'coordinates') {
              sanitized[rule.field] = value
            }
          }
          break

        default:
          sanitized[rule.field] = value
      }
    }

    logger.debug('payload 清理完成', { eventType, originalKeys: Object.keys(payload), sanitizedKeys: Object.keys(sanitized) })

    return sanitized as StateEvent['payload']
  }

  /**
   * 批量校验 StateEvent 数组
   */
  static validateBatch(events: Partial<StateEvent>[]): {
    valid: SchemaValidationResult[]
    allValid: boolean
  } {
    if (!Array.isArray(events)) {
      logger.error('validateBatch 收到非数组参数', { events })
      return {
        valid: [{ valid: false, errors: ['传入参数必须为数组'], warnings: [] }],
        allValid: false,
      }
    }

    logger.info('开始批量校验 StateEvent', { count: events.length })

    const results = events.map((event, index) => {
      const result = StateEventSchema.validate(event)
      if (!result.valid) {
        logger.warn(`批量校验中第 ${index + 1} 个事件校验失败`, { errors: result.errors })
      }
      return result
    })

    const allValid = results.every((r) => r.valid)

    logger.info('批量校验完成', { total: events.length, failed: results.filter((r) => !r.valid).length, allValid })

    return { valid: results, allValid }
  }

  /**
   * 判断给定的字符串是否为合法的 StateEventType
   */
  static isValidEventType(type: string): type is StateEventType {
    return VALID_EVENT_TYPES.has(type)
  }

  /**
   * 获取指定 eventType 的 payload 校验规则（用于文档/调试）
   */
  static getSchema(eventType: StateEventType): PayloadFieldRule[] {
    const schema = PAYLOAD_SCHEMA[eventType]
    if (!schema) {
      logger.warn('请求了未知 eventType 的 schema', { eventType })
      return []
    }
    return [...schema]
  }
}
