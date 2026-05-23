/**
 * 预设系统类型定义
 * 兼容酒馆预设格式
 */

/**
 * 预设 - 兼容酒馆预设
 */
export interface Preset {
  id: string
  name: string
  description?: string
  author?: string
  version?: string

  // 酒馆预设核心字段
  prompt_template?: string
  prompt_prefix?: string
  prompt_suffix?: string

  // 模型参数
  temperature?: number
  top_p?: number
  top_k?: number
  top_a?: number
  min_p?: number
  repetition_penalty?: number
  frequency_penalty?: number
  presence_penalty?: number

  // 生成控制
  max_tokens?: number
  stop_sequences?: string[]

  // 高级设置
  advanced?: {
    context_size?: number
    input_format?: string
    output_format?: string
    streaming?: boolean
    seed?: number
  }

  // AI小说工坊扩展
  novelWorkshop?: {
    category?: 'character' | 'worldbuilding' | 'plot' | 'style' | 'custom'
    tags?: string[]
    modelCompatibility?: string[]  // 兼容的模型列表
    useCase?: string               // 使用场景描述
    examples?: PresetExample[]
  }

  // 元数据
  createdAt: number
  updatedAt: number
  isBuiltin?: boolean             // 是否内置预设
  source?: 'imported' | 'created' | 'builtin'
}

/**
 * 预设示例
 */
export interface PresetExample {
  input: string
  output: string
  description?: string
}
