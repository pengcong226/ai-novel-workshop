/**
 * 全局错误处理器
 * 提供统一的错误捕获、日志记录和用户提示
 */

import { getLogger } from '@/utils/logger'
import { AppError as AppErrorClass, ErrorCode } from '@/utils/errors'
import { trackError } from '@/utils/analytics'

const logger = getLogger('utils:errorHandler')

export enum ErrorSeverity {
  LOW = 'low',           // 轻微错误，不影响使用
  MEDIUM = 'medium',     // 中等错误，部分功能受影响
  HIGH = 'high',         // 严重错误，核心功能无法使用
  CRITICAL = 'critical'  // 致命错误，应用无法继续运行
}

export enum ErrorCategory {
  NETWORK = 'network',     // 网络错误
  API = 'api',             // API调用错误
  STORAGE = 'storage',     // 存储错误
  VALIDATION = 'validation', // 数据验证错误
  PERMISSION = 'permission', // 权限错误
  RUNTIME = 'runtime',     // 运行时错误
  UNKNOWN = 'unknown'      // 未知错误
}

/** Map ErrorCategory to analytics EventCategory for local tracking. */
function mapErrorCategoryToAnalytics(category?: ErrorCategory): 'navigation' | 'ai' | 'editor' | 'sandbox' {
  switch (category) {
    case ErrorCategory.NETWORK:
    case ErrorCategory.API:
      return 'ai'
    case ErrorCategory.VALIDATION:
      return 'editor'
    case ErrorCategory.STORAGE:
    case ErrorCategory.PERMISSION:
    case ErrorCategory.RUNTIME:
    case ErrorCategory.UNKNOWN:
    default:
      return 'sandbox'
  }
}

export interface AppError {
  id: string
  message: string
  severity: ErrorSeverity
  category: ErrorCategory
  timestamp: Date
  context?: Record<string, unknown>
  stack?: string
  userAction?: string
  recoverable: boolean
  recoveryActions?: ErrorRecoveryAction[]
}

export interface ErrorRecoveryAction {
  label: string
  description: string
  action: () => Promise<void> | void
}

class ErrorHandler {
  private errors: AppError[] = []
  private maxErrors = 100
  private errorListeners: ((error: AppError) => void)[] = []

  /**
   * 注册错误监听器
   */
  onError(callback: (error: AppError) => void) {
    this.errorListeners.push(callback)
    return () => {
      const index = this.errorListeners.indexOf(callback)
      if (index > -1) {
        this.errorListeners.splice(index, 1)
      }
    }
  }

  /**
   * 处理错误
   */
  handleError(
    error: Error | string,
    options: {
      severity?: ErrorSeverity
      category?: ErrorCategory
      context?: Record<string, unknown>
      userAction?: string
      recoverable?: boolean
      recoveryActions?: ErrorRecoveryAction[]
    } = {}
  ): AppError {
    const appError: AppError = {
      id: this.generateErrorId(),
      message: typeof error === 'string' ? error : error.message,
      severity: options.severity || ErrorSeverity.MEDIUM,
      category: options.category || ErrorCategory.UNKNOWN,
      timestamp: new Date(),
      context: options.context,
      stack: typeof error === 'object' ? error.stack : undefined,
      userAction: options.userAction,
      recoverable: options.recoverable ?? true,
      recoveryActions: options.recoveryActions
    }

    // 记录错误
    this.logError(appError)

    // 本地分析追踪（隐私优先，无 PII）
    const analyticsCategory = mapErrorCategoryToAnalytics(options.category)
    trackError(analyticsCategory, options.category || 'unknown', appError.recoverable)

    // 通知监听器
    this.notifyListeners(appError)

    // 控制台输出
    this.consoleOutput(appError, error)

    return appError
  }

  /**
   * 处理异步错误
   */
  async handleAsyncError<T>(
    promise: Promise<T>,
    options: {
      severity?: ErrorSeverity
      category?: ErrorCategory
      context?: Record<string, unknown>
      userAction?: string
      recoverable?: boolean
      recoveryActions?: ErrorRecoveryAction[]
    } = {}
  ): Promise<{ data?: T; error?: AppError }> {
    try {
      const data = await promise
      return { data }
    } catch (err) {
      const appError = this.handleError(err as Error, options)
      return { error: appError }
    }
  }

  /**
   * 获取错误历史
   */
  getErrors(limit?: number): AppError[] {
    return this.errors.slice(-(limit || 20))
  }

  /**
   * 清除错误历史
   */
  clearErrors() {
    this.errors = []
  }

  /**
   * 生成错误ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 记录错误
   */
  private logError(error: AppError) {
    this.errors.push(error)

    // 保持错误列表在限制内
    if (this.errors.length > this.maxErrors) {
      this.errors.shift()
    }

    // 持久化到 localStorage (仅严重错误)
    if (error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL) {
      try {
        const storedErrors = JSON.parse(localStorage.getItem('app_errors') || '[]')
        storedErrors.push(error)
        localStorage.setItem('app_errors', JSON.stringify(storedErrors.slice(-50)))
      } catch (e) {
        logger.error('无法保存错误日志:', e)
      }
    }
  }

  /**
   * 通知监听器
   */
  private notifyListeners(error: AppError) {
    this.errorListeners.forEach(callback => {
      try {
        callback(error)
      } catch (e) {
        logger.error('错误监听器执行失败:', e)
      }
    })
  }

  /**
   * 控制台输出
   */
  private consoleOutput(appError: AppError, originalError: Error | string) {
    const severityEmoji = {
      [ErrorSeverity.LOW]: '⚠️',
      [ErrorSeverity.MEDIUM]: '❌',
      [ErrorSeverity.HIGH]: '🔥',
      [ErrorSeverity.CRITICAL]: '💀'
    }

    const emoji = severityEmoji[appError.severity]
    logger.error(`${emoji} [${appError.category.toUpperCase()}] ${appError.message}`, {
      id: appError.id,
      timestamp: appError.timestamp.toISOString(),
      context: appError.context,
      stack: appError.stack
    })

    if (typeof originalError === 'object' && originalError.stack) {
      logger.error(originalError.stack)
    }
  }
}

// 全局错误处理器实例
export const errorHandler = new ErrorHandler()

/**
 * 全局错误处理设置
 */
export function setupGlobalErrorHandler() {
  // 处理未捕获的Promise错误
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    // If the reason is an AppError, preserve its code and context
    if (reason instanceof AppErrorClass) {
      logger.error(`[unhandledrejection] [${reason.code}] ${reason.message}`, reason.toJSON())
    }
    errorHandler.handleError(reason, {
      severity: ErrorSeverity.HIGH,
      category: reason instanceof AppErrorClass
        ? (reason.code.startsWith('AI_') ? ErrorCategory.API
          : reason.code.startsWith('STORAGE_') ? ErrorCategory.STORAGE
          : reason.code.startsWith('NETWORK_') ? ErrorCategory.NETWORK
          : ErrorCategory.RUNTIME)
        : ErrorCategory.RUNTIME,
      context: reason instanceof AppErrorClass ? reason.context : undefined,
      userAction: '异步操作',
      recoverable: false
    })
    event.preventDefault()
  })

  // 处理全局错误
  window.addEventListener('error', (event) => {
    const error = event.error || event.message
    if (error instanceof AppErrorClass) {
      logger.error(`[global error] [${error.code}] ${error.message}`, error.toJSON())
    }
    errorHandler.handleError(error, {
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.RUNTIME,
      userAction: '页面操作',
      recoverable: false
    })
  })

  logger.info('✅ 全局错误处理器已初始化')
}

/**
 * 快捷错误处理函数
 */
export function handleError(
  error: Error | string,
  severity?: ErrorSeverity,
  category?: ErrorCategory
): AppError {
  return errorHandler.handleError(error, { severity, category })
}

/**
 * 错误消息友好化映射
 * 将技术性错误信息转换为用户可操作的建议提示
 */
const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  // 网络错误
  'Failed to fetch': '网络连接失败，请检查网络后重试',
  'NetworkError': '网络连接异常，请确认网络状态',
  'Network request failed': '网络请求失败，请稍后再试',
  'ERR_CONNECTION_REFUSED': '服务连接被拒绝，请确认后端服务已启动',
  'ERR_NETWORK': '网络异常，请检查网络连接',
  'ERR_INTERNET_DISCONNECTED': '网络已断开，请重新连接网络',
  'ETIMEDOUT': '网络请求超时，请稍后重试',
  'ECONNREFUSED': '服务连接被拒绝，请确认后端服务已启动',
  'ECONNRESET': '网络连接已重置，请重试',
  'timeout': '请求超时，服务器可能正忙，请稍后重试',
  'abort': '请求已取消',
  'ERR_NAME_NOT_RESOLVED': '域名解析失败，请检查网络设置',
  'ERR_SSL': '安全连接失败，请检查网络代理设置',

  // API 错误
  'Unauthorized': '登录已过期，请重新登录',
  '401': '登录已过期，请重新登录',
  '403': '没有权限执行此操作',
  '404': '请求的资源不存在',
  '408': '请求超时，请稍后重试',
  '409': '数据冲突，请刷新页面后重试',
  '413': '提交的数据过大，请减少内容后重试',
  '422': '提交的数据格式不正确，请检查输入',
  '429': '请求过于频繁，请稍后再试',
  '500': '服务器内部错误，请稍后重试',
  '502': '服务暂时不可用，请稍后重试',
  '503': '服务正在维护中，请稍后重试',
  '504': '服务器响应超时，请稍后重试',

  // AI 相关错误
  'AI未初始化': '尚未配置AI模型，请前往「配置」页面添加模型提供商',
  '模型未配置': '请先在「配置」页面选择一个AI模型',
  'AI generation failed': 'AI生成失败，请检查模型配置或稍后重试',
  'context_length_exceeded': '输入内容超出模型限制，请缩短内容后重试',
  'insufficient_quota': 'AI额度不足，请检查API账户余额或更换模型',
  'invalid_api_key': 'API密钥无效，请在「配置」页面更新密钥',
  'rate_limit': 'AI请求频率过高，请稍后重试',
  'model_not_found': '所选AI模型不可用，请在「配置」页面更换模型',
  'overloaded': 'AI服务繁忙，请稍后重试',
  'content_filter': '生成内容触发安全过滤，请调整写作方向后重试',
  'max_tokens': '生成内容超出长度限制，请缩短目标字数',
  'unknown provider': 'AI模型提供商配置异常，请检查「配置」页面',

  // Pipeline 错误
  '批量续写': '一键续写过程中出现错误，已完成的章节已自动保存',
  'pipeline': '写作流水线执行异常，请检查AI配置后重试',
  '续写失败': '章节续写失败，可能是AI服务暂时不可用，请稍后重试',
  '审计失败': '章节质量审计未通过，系统将自动尝试修订',
  '断点': '续写进度已保存，可以稍后继续',

  // 存储错误
  'QuotaExceededError': '本地存储空间已满，请清理浏览器数据后重试',
  'localStorage': '本地存储异常，请检查浏览器设置',
  'IndexedDB': '本地数据库异常，请尝试刷新页面或清除浏览器缓存',
  'DataCloneError': '数据保存格式异常，请刷新页面后重试',
  'InvalidStateError': '数据库状态异常，请刷新页面后重试',
  'TransactionInactiveError': '数据库事务超时，请重试操作',

  // 编辑器错误
  '保存失败': '自动保存失败，请手动保存或检查网络连接',
  '章节保存失败': '章节保存失败，请检查编辑内容后重试',
  '项目未加载': '项目数据未加载完成，请等待加载后重试',
  '项目未找到': '项目不存在或已被删除',

  // 导入导出错误
  '导入': '文件导入失败，请检查文件格式是否正确',
  '导出': '文件导出失败，请重试',
  '文件格式': '文件格式不支持，请使用 .txt 或 .md 格式',

  // 权限错误
  'NotAllowedError': '浏览器权限被拒绝，请在设置中允许相关权限',
  'Permission denied': '权限不足，请检查浏览器设置',
  'clipboard': '剪贴板访问被拒绝，请手动复制',

  // Tauri 桌面端错误
  'invoke': '桌面端功能调用失败，请重启应用后重试',
  'tauri': '桌面端服务异常，请重启应用',
}

/**
 * 将原始错误消息转为用户友好的提示
 */
export function getFriendlyMessage(rawMessage: string): string {
  if (!rawMessage) return '发生了未知错误，请稍后重试'

  // 精确匹配
  if (FRIENDLY_ERROR_MESSAGES[rawMessage]) {
    return FRIENDLY_ERROR_MESSAGES[rawMessage]
  }

  // 模糊匹配：遍历关键词
  for (const [keyword, friendly] of Object.entries(FRIENDLY_ERROR_MESSAGES)) {
    if (rawMessage.includes(keyword)) {
      return friendly
    }
  }

  // 如果消息本身已经是中文且较短，直接返回（可能已经是友好消息）
  if (/[\u4e00-\u9fff]/.test(rawMessage) && rawMessage.length < 80) {
    return rawMessage
  }

  // 默认友好消息
  return '操作未能完成，请稍后重试。如果问题持续存在，请尝试刷新页面'
}

/**
 * Pipeline 阶段级错误分类提示
 * 根据 Pipeline 阶段和错误消息，返回针对性的用户友好提示
 */
const STAGE_ERROR_TIPS: Record<string, Record<string, string>> = {
  prepare: {
    default: '输入准备阶段失败，请检查项目数据是否完整',
    '项目': '项目数据加载失败，请刷新页面后重试',
    '大纲': '大纲数据异常，请在大纲编辑器中检查',
  },
  plan: {
    default: '规划阶段失败，可能是AI服务暂时不可用',
    'timeout': '规划请求超时，请检查网络或切换模型后重试',
    'AI': 'AI模型响应异常，请检查模型配置',
    '大纲': '大纲信息不足，请检查大纲是否完整',
  },
  compose: {
    default: '上下文组装失败，请检查项目设定是否完整',
  },
  write: {
    default: 'AI写作阶段失败，请检查网络或切换模型后重试',
    'timeout': '写作请求超时，章节内容较长时可能发生，请稍后重试',
    'AI': 'AI服务响应异常，请检查模型配置或切换其他模型',
    'quota': 'AI额度不足，请检查API账户余额',
    'content_filter': '生成内容触发安全过滤，请调整写作方向',
  },
  normalize: {
    default: '字数标准化处理失败（不影响已生成的内容）',
  },
  audit: {
    default: '质量审计服务不可用，章节已跳过审计直接保存',
    'timeout': '审计请求超时，章节已跳过审计保存',
    'AI': 'AI审计服务异常，章节已跳过审计保存',
  },
  revise: {
    default: '修订阶段失败，已保留审计前的原始版本',
    'timeout': '修订请求超时，已保留原始版本',
  },
  settle: {
    default: '状态沉淀失败（不影响章节内容）',
  },
  analyze: {
    default: '章节分析失败（不影响章节内容）',
  },
  'promote-hooks': {
    default: '伏笔升级检查失败（不影响章节内容）',
  },
}

export function getStageFriendlyMessage(stage: string, rawError: string): string {
  const stageTips = STAGE_ERROR_TIPS[stage]
  if (!stageTips) return getFriendlyMessage(rawError)

  // 检查阶段特定的关键词匹配
  for (const [keyword, message] of Object.entries(stageTips)) {
    if (keyword === 'default') continue
    if (rawError.includes(keyword)) return message
  }

  // 使用阶段默认提示
  return stageTips.default || getFriendlyMessage(rawError)
}

export function handleNetworkError(error: Error | string, context?: Record<string, unknown>): AppError {
  return errorHandler.handleError(error, {
    severity: ErrorSeverity.MEDIUM,
    category: ErrorCategory.NETWORK,
    context,
    recoverable: true,
    recoveryActions: [
      {
        label: '重试',
        description: '重新尝试网络请求',
        action: () => window.location.reload()
      }
    ]
  })
}

export function handleAPIError(error: Error | string, context?: Record<string, unknown>): AppError {
  return errorHandler.handleError(error, {
    severity: ErrorSeverity.MEDIUM,
    category: ErrorCategory.API,
    context,
    recoverable: true
  })
}

export function handleStorageError(error: Error | string, context?: Record<string, unknown>): AppError {
  return errorHandler.handleError(error, {
    severity: ErrorSeverity.HIGH,
    category: ErrorCategory.STORAGE,
    context,
    recoverable: false,
    recoveryActions: [
      {
        label: '清除缓存',
        description: '清除浏览器缓存并刷新页面',
        action: () => {
          localStorage.clear()
          sessionStorage.clear()
          window.location.reload()
        }
      }
    ]
  })
}

export function handleValidationError(error: Error | string, context?: Record<string, unknown>): AppError {
  return errorHandler.handleError(error, {
    severity: ErrorSeverity.LOW,
    category: ErrorCategory.VALIDATION,
    context,
    recoverable: true
  })
}
