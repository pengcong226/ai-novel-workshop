/**
 * 全局错误处理器
 * 提供统一的错误捕获、日志记录和用户提示
 */

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

export interface AppError {
  id: string
  message: string
  severity: ErrorSeverity
  category: ErrorCategory
  timestamp: Date
  context?: Record<string, any>
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
      context?: Record<string, any>
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
      context?: Record<string, any>
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
        console.error('无法保存错误日志:', e)
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
        console.error('错误监听器执行失败:', e)
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
    console.error(`${emoji} [${appError.category.toUpperCase()}] ${appError.message}`, {
      id: appError.id,
      timestamp: appError.timestamp.toISOString(),
      context: appError.context,
      stack: appError.stack
    })

    if (typeof originalError === 'object' && originalError.stack) {
      console.error(originalError.stack)
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
    errorHandler.handleError(event.reason, {
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.RUNTIME,
      userAction: '异步操作',
      recoverable: false
    })
    event.preventDefault()
  })

  // 处理全局错误
  window.addEventListener('error', (event) => {
    errorHandler.handleError(event.error || event.message, {
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.RUNTIME,
      userAction: '页面操作',
      recoverable: false
    })
  })

  console.log('✅ 全局错误处理器已初始化')
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

export function handleNetworkError(error: Error | string, context?: Record<string, any>): AppError {
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

export function handleAPIError(error: Error | string, context?: Record<string, any>): AppError {
  return errorHandler.handleError(error, {
    severity: ErrorSeverity.MEDIUM,
    category: ErrorCategory.API,
    context,
    recoverable: true
  })
}

export function handleStorageError(error: Error | string, context?: Record<string, any>): AppError {
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

export function handleValidationError(error: Error | string, context?: Record<string, any>): AppError {
  return errorHandler.handleError(error, {
    severity: ErrorSeverity.LOW,
    category: ErrorCategory.VALIDATION,
    context,
    recoverable: true
  })
}
