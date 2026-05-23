/**
 * SillyTavern 角色卡类型定义
 * @module types/character-card
 *
 * 支持完整角色卡格式，包括：
 * - Character Card V1 (Legacy)
 * - Character Card V2
 * - Character Card V3
 * - SillyTavern扩展格式（包含设置和提示词）
 */

// ============================================================================
// Character Card V1 (Legacy)
// ============================================================================

/**
 * Character Card V1 格式
 */
export interface CharacterCardV1 {
  // 基本信息
  name: string
  description?: string
  personality?: string
  scenario?: string
  first_mes?: string
  mes_example?: string

  // 扩展字段
  creator_notes?: string
  system_prompt?: string
  post_history_instructions?: string
  alternate_greetings?: string[]
  tags?: string[]
  creator?: string
  character_version?: string

  // Character Book (V1格式)
  character_book?: CharacterBookV1

  // 其他字段
  [key: string]: any
}

/**
 * Character Book V1 格式
 */
export interface CharacterBookV1 {
  name?: string
  description?: string
  scan_depth?: number
  token_budget?: number
  recursive_scanning?: boolean
  extensions?: Record<string, unknown>
  entries: CharacterBookEntry[]
}

/**
 * Character Book 条目
 */
export interface CharacterBookEntry {
  uid: number
  key: string[]
  keysecondary?: string[]
  content: string
  comment?: string
  constant?: boolean
  selective?: boolean
  order?: number
  position?: number
  disable?: boolean
  excludeRecursion?: boolean
  probability?: number
  depth?: number
  useProbability?: boolean
  displayIndex?: number
  extensions?: Record<string, unknown>
}

// ============================================================================
// Character Card V2
// ============================================================================

/**
 * Character Card V2 格式
 */
export interface CharacterCardV2 {
  spec: 'chara_card_v2'
  spec_version: '2.0'

  data: {
    // 基本信息
    name: string
    description?: string
    personality?: string
    scenario?: string
    first_mes?: string
    mes_example?: string

    // 扩展信息
    creator_notes?: string
    system_prompt?: string
    post_history_instructions?: string
    alternate_greetings?: string[]
    tags?: string[]
    creator?: string
    character_version?: string
    extensions?: CharacterCardExtensions

    // Character Book
    character_book?: CharacterBookV2
  }
}

/**
 * Character Book V2 格式
 */
export interface CharacterBookV2 {
  name?: string
  description?: string
  scan_depth?: number
  token_budget?: number
  recursive_scanning?: boolean
  extensions?: Record<string, unknown>
  entries: CharacterBookEntry[]
}

// ============================================================================
// Character Card V3
// ============================================================================

/**
 * Character Card V3 格式
 */
export interface CharacterCardV3 {
  spec: 'chara_card_v3'
  spec_version: '3.0'

  data: {
    // 基本信息
    name: string
    description?: string
    personality?: string
    scenario?: string
    first_mes?: string
    mes_example?: string

    // 扩展信息
    creator_notes?: string
    system_prompt?: string
    post_history_instructions?: string
    alternate_greetings?: string[]
    tags?: string[]
    creator?: string
    character_version?: string
    extensions?: CharacterCardExtensions

    // Character Book
    character_book?: CharacterBookV3

    // V3特有字段
    nickname?: string
    avatar?: string
    notes?: string
  }
}

/**
 * Character Book V3 格式
 */
export interface CharacterBookV3 {
  name?: string
  description?: string
  scan_depth?: number
  token_budget?: number
  recursive_scanning?: boolean
  extensions?: Record<string, unknown>
  entries: CharacterBookEntry[]
}

// ============================================================================
// Character Card Extensions
// ============================================================================

/**
 * Character Card 扩展字段
 */
export interface CharacterCardExtensions {
  // 深度提示词
  depth_prompt?: {
    prompt: string
    depth: number
    role: 'system' | 'user' | 'assistant'
  }

  // 正则脚本
  regex_scripts?: RegexScript[]

  // Tavern Helper扩展
  tavern_helper?: TavernHelperExtension[]

  // 其他扩展
  [key: string]: any
}

/**
 * 正则脚本（SillyTavern格式）
 */
export interface RegexScript {
  id: string
  scriptName: string
  disabled: boolean
  runOnEdit: boolean
  findRegex: string
  trimStrings: string[]
  replaceString: string
  placement: number[]
  substituteRegex: number
  minDepth: number | null
  maxDepth: number | null
  markdownOnly: boolean
  promptOnly: boolean
}

/**
 * Tavern Helper 扩展
 */
export interface TavernHelperExtension {
  // 具体结构待分析
  [key: string]: any
}

// ============================================================================
// SillyTavern 扩展格式
// ============================================================================

/**
 * SillyTavern 扩展格式（包含设置和提示词）
 *
 * 这是SillyTavern特有的格式，在角色卡基础上添加了：
 * - AI模型设置
 * - 提示词系统
 * - 正则脚本
 * - 全局设置
 */
export interface SillyTavernCharacterCard {
  // AI模型设置
  temperature?: number
  frequency_penalty?: number
  presence_penalty?: number
  top_p?: number
  top_k?: number
  top_a?: number
  min_p?: number
  repetition_penalty?: number
  max_context_unlocked?: boolean
  openai_max_context?: number
  openai_max_tokens?: number

  // 名称行为
  names_behavior?: number

  // 提示词相关
  send_if_empty?: string
  impersonation_prompt?: string
  new_chat_prompt?: string
  new_group_chat_prompt?: string
  new_example_chat_prompt?: string
  continue_nudge_prompt?: string
  bias_preset_selected?: string
  wi_format?: string
  scenario_format?: string
  personality_format?: string
  group_nudge_prompt?: string

  // OpenAI设置
  stream_openai?: boolean
  assistant_prefill?: string
  assistant_impersonation?: string
  use_sysprompt?: boolean
  squash_system_messages?: boolean
  continue_prefill?: boolean
  continue_postfix?: string

  // 多媒体设置
  media_inlining?: boolean
  inline_image_quality?: string
  image_inlining?: boolean
  video_inlining?: boolean
  wrap_in_quotes?: boolean

  // 高级设置
  function_calling?: boolean
  show_thoughts?: boolean
  reasoning_effort?: string
  verbosity?: string
  enable_web_search?: boolean
  seed?: number
  n?: number

  // 图片生成
  request_images?: boolean
  request_image_aspect_ratio?: string
  request_image_resolution?: string

  // 提示词列表
  prompts?: PromptConfig[]

  // 提示词顺序
  prompt_order?: PromptOrder[]

  // 扩展
  extensions?: {
    regex_scripts?: RegexScript[]
    tavern_helper?: TavernHelperExtension[]
    SPreset?: any
    [key: string]: any
  }

  // 角色数据（V2/V3格式）
  spec?: 'chara_card_v2' | 'chara_card_v3'
  spec_version?: string
  data?: CharacterCardV2['data'] | CharacterCardV3['data']

  // 或者V1格式的直接字段
  name?: string
  description?: string
  personality?: string
  scenario?: string
  first_mes?: string
  mes_example?: string
  character_book?: CharacterBookV1

  // 其他字段
  [key: string]: any
}

/**
 * 提示词配置
 */
export interface PromptConfig {
  name?: string
  identifier: string
  content: string
  system_prompt?: boolean
  position?: 'before_char' | 'after_char' | 'before_example' | 'after_example'
  role?: 'system' | 'user' | 'assistant'
  depth?: number
  injection_behavior?: 'prepend' | 'append'
  enabled?: boolean
}

/**
 * 提示词顺序
 */
export interface PromptOrder {
  identifier: string
  order: number
  enabled?: boolean
}

// ============================================================================
// 角色卡导入导出选项
// ============================================================================

/**
 * 角色卡导入选项
 */
export interface CharacterCardImportOptions {
  /** 是否导入世界书 */
  importWorldbook?: boolean

  /** 是否导入正则脚本 */
  importRegexScripts?: boolean

  /** 是否导入提示词 */
  importPrompts?: boolean

  /** 是否导入AI设置 */
  importAISettings?: boolean

  /** 是否导入扩展 */
  importExtensions?: boolean

  /** 世界书导入选项 */
  worldbookOptions?: {
    overwrite?: boolean
    merge?: boolean
    setAsConstant?: boolean
    defaultDisabled?: boolean
  }

  /** 正则脚本导入选项 */
  regexOptions?: {
    overwrite?: boolean
    defaultDisabled?: boolean
  }
}

/**
 * 角色卡导出选项
 */
export interface CharacterCardExportOptions {
  /** 导出格式 */
  format: 'v1' | 'v2' | 'v3' | 'sillytavern'

  /** 是否导出世界书 */
  includeWorldbook?: boolean

  /** 是否导出正则脚本 */
  includeRegexScripts?: boolean

  /** 是否导出提示词 */
  includePrompts?: boolean

  /** 是否导出AI设置 */
  includeAISettings?: boolean

  /** 是否导出扩展 */
  includeExtensions?: boolean

  /** 图片设置 */
  imageOptions?: {
    width?: number
    height?: number
    backgroundColor?: string
    customImage?: Blob
  }
}

/**
 * 角色卡导入结果
 */
export interface CharacterCardImportResult {
  success: boolean
  format: 'v1' | 'v2' | 'v3' | 'sillytavern'

  character?: {
    name: string
    description?: string
    personality?: string
    scenario?: string
    first_mes?: string
    mes_example?: string
    creator_notes?: string
    system_prompt?: string
    post_history_instructions?: string
    tags?: string[]
    creator?: string
  }

  worldbook?: {
    imported: boolean
    entriesCount: number
    entries?: CharacterBookEntry[]
  }

  regexScripts?: {
    imported: boolean
    count: number
    scripts?: RegexScript[]
  }

  prompts?: {
    imported: boolean
    count: number
    prompts?: PromptConfig[]
  }

  aiSettings?: {
    temperature?: number
    top_p?: number
    top_k?: number
    repetition_penalty?: number
    [key: string]: any
  }

  errors?: string[]
  warnings?: string[]
}

/**
 * 角色卡导出结果
 */
export interface CharacterCardExportResult {
  success: boolean
  format: 'v1' | 'v2' | 'v3' | 'sillytavern' | 'png'
  data?: string | Blob
  size: number
}
