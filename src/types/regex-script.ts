/**
 * 正则脚本类型定义
 * @module types/regex-script
 *
 * 兼容 SillyTavern Regex Scripts 格式
 * 参考: https://docs.sillytavern.app/extensions/regex/
 */

/**
 * 正则脚本应用位置
 */
export enum RegexScriptPlacement {
  /** 用户输入 */
  USER_INPUT = 0,
  /** AI消息开始 */
  AI_MESSAGE_START = 1,
  /** AI消息结束 */
  AI_MESSAGE_END = 2,
  /** 斜杠命令 */
  SLASH_COMMAND = 3,
  /** 查找输出 */
  FIND_OUTPUT = 4,
  /** 推理输出 */
  REASONING_OUTPUT = 5
}

/**
 * 正则脚本 - SillyTavern兼容格式
 */
export interface RegexScript {
  // ============ 基础信息 ============

  /** 唯一标识符 */
  id: string

  /** 脚本名称 */
  scriptName: string

  /** 是否禁用 */
  disabled: boolean

  /** 编辑时运行 */
  runOnEdit: boolean

  // ============ 正则配置 ============

  /** 正则表达式（字符串格式，含标志） */
  findRegex: string

  /** 要修剪的字符串列表 */
  trimStrings: string[]

  /** 替换内容（支持 $1, $2 等捕获组） */
  replaceString: string

  // ============ 应用范围 ============

  /** 应用位置（数组，可多选） */
  placement: RegexScriptPlacement[]

  /** 替代正则模式 */
  substituteRegex: number

  /** 最小深度限制 */
  minDepth: number | null

  /** 最大深度限制 */
  maxDepth: number | null

  /** 仅Markdown环境 */
  markdownOnly: boolean

  /** 仅提示环境 */
  promptOnly: boolean

  // ============ AI小说工坊扩展 ============

  /** 扩展字段 */
  extensions?: RegexScriptExtensions
}

/**
 * AI小说工坊 - 正则脚本扩展
 */
export interface RegexScriptExtensions {
  /** 分类标签 */
  category?: string

  /** 优先级（数字越大优先级越高） */
  priority?: number

  /** 描述说明 */
  description?: string

  /** 创建时间 */
  createdAt?: Date

  /** 更新时间 */
  updatedAt?: Date

  /** 来源 */
  source?: 'manual' | 'imported' | 'preset'

  /** 标签 */
  tags?: string[]

  /** 启用条件（高级） */
  conditions?: RegexScriptCondition[]
}

/**
 * 正则脚本启用条件
 */
export interface RegexScriptCondition {
  /** 条件类型 */
  type: 'character' | 'worldbook' | 'chat' | 'variable'

  /** 条件键 */
  key: string

  /** 比较操作符 */
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'exists' | 'not_exists'

  /** 条件值 */
  value?: string | number | boolean

  /** 逻辑操作符（连接下一个条件） */
  logic?: 'and' | 'or'
}

/**
 * 正则脚本执行结果
 */
export interface RegexScriptResult {
  /** 是否匹配 */
  matched: boolean

  /** 匹配的脚本ID */
  scriptId: string

  /** 匹配的脚本名称 */
  scriptName: string

  /** 原始文本 */
  originalText: string

  /** 替换后文本 */
  replacedText: string

  /** 匹配次数 */
  matchCount: number

  /** 执行时间（毫秒） */
  executionTime: number

  /** 错误信息 */
  error?: string
}

/**
 * 正则脚本执行选项
 */
export interface RegexScriptExecutionOptions {
  /** 应用位置 */
  placement?: RegexScriptPlacement

  /** 当前深度 */
  depth?: number

  /** 是否Markdown环境 */
  isMarkdown?: boolean

  /** 是否提示环境 */
  isPrompt?: boolean

  /** 是否在编辑模式 */
  isEdit?: boolean

  /** 仅运行的脚本ID列表 */
  onlyRunIds?: string[]

  /** 跳过的脚本ID列表 */
  skipIds?: string[]

  /** 额外的上下文变量 */
  context?: Record<string, unknown>
}

/**
 * 正则脚本导入选项
 */
export interface RegexScriptImportOptions {
  /** 是否覆盖已存在的脚本 */
  overwrite?: boolean

  /** 是否跳过无效脚本 */
  skipInvalid?: boolean

  /** 是否验证正则表达式 */
  validateRegex?: boolean

  /** 默认禁用状态 */
  defaultDisabled?: boolean
}

/**
 * 正则脚本导出选项
 */
export interface RegexScriptExportOptions {
  /** 是否仅导出启用的脚本 */
  enabledOnly?: boolean

  /** 是否包含扩展字段 */
  includeExtensions?: boolean

  /** 格式 */
  format?: 'json' | 'jsonl'

  /** 是否美化输出 */
  pretty?: boolean
}

/**
 * 正则脚本集合
 */
export interface RegexScriptCollection {
  /** 脚本列表 */
  scripts: RegexScript[]

  /** 元数据 */
  metadata: {
    /** 名称 */
    name: string

    /** 描述 */
    description?: string

    /** 作者 */
    author?: string

    /** 版本 */
    version?: string

    /** 创建时间 */
    createdAt: Date

    /** 更新时间 */
    updatedAt: Date

    /** 来源 */
    source?: string
  }
}

/**
 * 正则脚本执行报告
 */
export interface RegexScriptExecutionReport {
  /** 总执行时间 */
  totalTime: number

  /** 执行的脚本数量 */
  executedCount: number

  /** 匹配的脚本数量 */
  matchedCount: number

  /** 错误数量 */
  errorCount: number

  /** 详细结果 */
  results: RegexScriptResult[]

  /** 性能统计 */
  performance: {
    /** 平均执行时间 */
    averageTime: number

    /** 最大执行时间 */
    maxTime: number

    /** 最小执行时间 */
    minTime: number

    /** 总匹配次数 */
    totalMatches: number
  }
}
