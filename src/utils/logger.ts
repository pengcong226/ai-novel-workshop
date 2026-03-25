export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

export interface LoggerConfig {
  enabled: boolean
  level: LogLevel
  namespaces: string[]
  maxBuffer: number
  persist: boolean
}

export interface LogEntry {
  time: string
  timestamp: number
  level: Exclude<LogLevel, 'silent'>
  namespace: string
  message: string
  args: unknown[]
}

type RuntimeLogLevel = Exclude<LogLevel, 'silent'>

const CONFIG_STORAGE_KEY = '__ai_novel_logger_config__'

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99
}

const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  enabled: true,
  level: 'info',
  namespaces: ['*'],
  maxBuffer: 1000,
  persist: true
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function normalizeConfig(partial?: Partial<LoggerConfig>): LoggerConfig {
  return {
    enabled: partial?.enabled ?? DEFAULT_LOGGER_CONFIG.enabled,
    level: partial?.level ?? DEFAULT_LOGGER_CONFIG.level,
    namespaces: partial?.namespaces?.length ? partial.namespaces : DEFAULT_LOGGER_CONFIG.namespaces,
    maxBuffer: partial?.maxBuffer && partial.maxBuffer > 0 ? partial.maxBuffer : DEFAULT_LOGGER_CONFIG.maxBuffer,
    persist: partial?.persist ?? DEFAULT_LOGGER_CONFIG.persist
  }
}

function loadPersistedConfig(): Partial<LoggerConfig> {
  if (!isBrowser()) {
    return {}
  }

  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<LoggerConfig>
    return parsed || {}
  } catch {
    return {}
  }
}

function savePersistedConfig(config: LoggerConfig): void {
  if (!isBrowser() || !config.persist) {
    return
  }

  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // 忽略持久化失败，避免影响主流程
  }
}

function namespaceMatched(filters: string[], namespace: string): boolean {
  if (!filters.length) return true

  for (const filter of filters) {
    if (filter === '*') return true
    if (filter === namespace) return true

    if (filter.endsWith('*')) {
      const prefix = filter.slice(0, -1)
      if (namespace.startsWith(prefix)) {
        return true
      }
    }
  }

  return false
}

class LoggerManager {
  private config: LoggerConfig = normalizeConfig(loadPersistedConfig())
  private buffer: LogEntry[] = []

  getConfig(): LoggerConfig {
    return { ...this.config, namespaces: [...this.config.namespaces] }
  }

  configure(config: Partial<LoggerConfig>): void {
    const merged = normalizeConfig({ ...this.config, ...config })
    this.config = merged
    savePersistedConfig(this.config)
  }

  setEnabled(enabled: boolean): void {
    this.configure({ enabled })
  }

  setLevel(level: LogLevel): void {
    this.configure({ level })
  }

  setNamespaces(namespaces: string[]): void {
    this.configure({ namespaces })
  }

  clearLogs(): void {
    this.buffer = []
  }

  getLogs(): LogEntry[] {
    return [...this.buffer]
  }

  createLogger(namespace: string) {
    return {
      debug: (message: string, ...args: unknown[]) => this.log('debug', namespace, message, ...args),
      info: (message: string, ...args: unknown[]) => this.log('info', namespace, message, ...args),
      warn: (message: string, ...args: unknown[]) => this.log('warn', namespace, message, ...args),
      error: (message: string, ...args: unknown[]) => this.log('error', namespace, message, ...args)
    }
  }

  private canLog(level: RuntimeLogLevel, namespace: string): boolean {
    if (!this.config.enabled) return false
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level]) return false
    if (!namespaceMatched(this.config.namespaces, namespace)) return false
    return true
  }

  private pushToBuffer(entry: LogEntry): void {
    this.buffer.push(entry)

    const overflow = this.buffer.length - this.config.maxBuffer
    if (overflow > 0) {
      this.buffer.splice(0, overflow)
    }
  }

  private log(level: RuntimeLogLevel, namespace: string, message: string, ...args: unknown[]): void {
    if (!this.canLog(level, namespace)) {
      return
    }

    const now = new Date()
    const entry: LogEntry = {
      time: now.toISOString(),
      timestamp: now.getTime(),
      level,
      namespace,
      message,
      args
    }

    this.pushToBuffer(entry)

    const prefix = `[${entry.time}] [${entry.level.toUpperCase()}] [${entry.namespace}]`

    if (level === 'debug') {
      console.debug(prefix, message, ...args)
    } else if (level === 'info') {
      console.info(prefix, message, ...args)
    } else if (level === 'warn') {
      console.warn(prefix, message, ...args)
    } else {
      console.error(prefix, message, ...args)
    }
  }
}

const loggerManager = new LoggerManager()

function exposeLoggerDebugTools(): void {
  if (!isBrowser()) {
    return
  }

  ;(window as any).__APP_LOGGER__ = {
    getConfig: () => loggerManager.getConfig(),
    setEnabled: (enabled: boolean) => loggerManager.setEnabled(enabled),
    setLevel: (level: LogLevel) => loggerManager.setLevel(level),
    setNamespaces: (namespaces: string[]) => loggerManager.setNamespaces(namespaces),
    getLogs: () => loggerManager.getLogs(),
    clearLogs: () => loggerManager.clearLogs()
  }
}

export function initLogger(config?: Partial<LoggerConfig>) {
  if (config) {
    loggerManager.configure(config)
  }

  exposeLoggerDebugTools()
  return loggerManager
}

export function getLogger(namespace: string) {
  return loggerManager.createLogger(namespace)
}

export function getLoggerManager() {
  return loggerManager
}
