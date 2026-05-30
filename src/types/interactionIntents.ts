/**
 * 自然语言交互 Intent 类型定义
 *
 * 支持22种Intent，覆盖写作流程的所有操作
 */

// ============================================================================
// Intent 类型枚举
// ============================================================================

export type IntentType =
  // 写作类 (7种)
  | 'write_next'            // 写下一章
  | 'write_chapter'         // 写指定章节 (e.g., "写第5章")
  | 'rewrite_chapter'       // 改写指定章节
  | 'continue_writing'      // 续写N章
  | 'expand_chapter'        // 扩展章节内容
  | 'compress_chapter'      // 压缩章节内容
  | 'change_style'          // 改变文风

  // 审计类 (3种)
  | 'audit_chapter'         // 审计指定章节
  | 'audit_all'             // 审计所有章节
  | 'check_continuity'      // 检查连贯性

  // 状态管理类 (5种)
  | 'create_entity'         // 创建实体
  | 'update_entity'         // 更新实体
  | 'rename_entity'         // 重命名实体
  | 'delete_entity'         // 删除实体
  | 'query_entity'          // 查询实体信息

  // 大纲类 (3种)
  | 'extend_outline'        // 扩展大纲
  | 'modify_outline'        // 修改大纲
  | 'query_outline'         // 查询大纲

  // 批量操作类 (2种)
  | 'batch_generate'        // 批量生成
  | 'batch_audit'           // 批量审计

  // 系统类 (2种)
  | 'show_status'           // 显示当前状态
  | 'help'                  // 帮助信息

// ============================================================================
// Intent 参数定义
// ============================================================================

export interface IntentParams {
  chapterNumber?: number      // 章节号
  chapterRange?: [number, number]  // 章节范围
  count?: number              // 数量
  entityName?: string         // 实体名称
  entityType?: string         // 实体类型
  direction?: string          // 方向指导
  style?: string              // 文风
  content?: string            // 内容
  query?: string              // 查询文本
  chapterOutline?: any        // 章节大纲
  externalContext?: string    // 外部上下文
  wordCount?: number          // 字数
  temperature?: number        // 温度
  chapterId?: string          // 章节ID
  [key: string]: unknown      // 扩展字段
}

// ============================================================================
// Intent 路由结果
// ============================================================================

export interface IntentMatch {
  intent: IntentType
  params: IntentParams
  confidence: number          // 0-1, 匹配置信度
  method: 'regex' | 'llm'    // 匹配方式
  rawText: string             // 原始输入
}

// ============================================================================
// Intent 元数据
// ============================================================================

export interface IntentMeta {
  type: IntentType
  category: 'writing' | 'audit' | 'entity' | 'outline' | 'batch' | 'system'
  label: string               // 中文标签
  description: string         // 描述
  requiredParams: string[]    // 必需参数
  optionalParams: string[]    // 可选参数
  examples: string[]          // 示例输入
  autoExecutable: boolean     // 是否可自动执行（无需确认）
}

// Intent元数据注册表
export const INTENT_REGISTRY: Record<IntentType, IntentMeta> = {
  // ==========================================================================
  // 写作类 (7种)
  // ==========================================================================
  write_next: {
    type: 'write_next',
    category: 'writing',
    label: '写下一章',
    description: '自动撰写下一章内容，基于已有章节的上下文和风格续写',
    requiredParams: [],
    optionalParams: ['direction'],
    examples: ['帮我写下一章', '继续写', '下一章'],
    autoExecutable: true,
  },
  write_chapter: {
    type: 'write_chapter',
    category: 'writing',
    label: '写指定章节',
    description: '撰写指定编号的章节，支持中文和阿拉伯数字章节号',
    requiredParams: ['chapterNumber'],
    optionalParams: ['direction', 'style'],
    examples: ['写第5章', '帮我写第五章', '生成第10章'],
    autoExecutable: true,
  },
  rewrite_chapter: {
    type: 'rewrite_chapter',
    category: 'writing',
    label: '改写章节',
    description: '改写指定章节的内容，保留情节核心但重新组织语言和叙述方式',
    requiredParams: ['chapterNumber'],
    optionalParams: ['direction', 'style'],
    examples: ['改写第3章', '重写第5章', '第8章写得不好，重写一下'],
    autoExecutable: true,
  },
  continue_writing: {
    type: 'continue_writing',
    category: 'writing',
    label: '续写N章',
    description: '批量续写指定数量的章节，默认续写1章',
    requiredParams: [],
    optionalParams: ['count', 'direction'],
    examples: ['续写5章', '再写10章', '帮我续写下去'],
    autoExecutable: true,
  },
  expand_chapter: {
    type: 'expand_chapter',
    category: 'writing',
    label: '扩展章节',
    description: '扩展指定章节的内容，增加细节描写和情节丰富度',
    requiredParams: ['chapterNumber'],
    optionalParams: ['direction'],
    examples: ['第5章太短了，扩展一下', '把第3章写长一点', '扩充第7章的细节'],
    autoExecutable: true,
  },
  compress_chapter: {
    type: 'compress_chapter',
    category: 'writing',
    label: '压缩章节',
    description: '压缩指定章节的内容，精简冗余描述，保留核心情节',
    requiredParams: ['chapterNumber'],
    optionalParams: [],
    examples: ['第5章太长了，精简一下', '压缩第3章', '第9章需要瘦身'],
    autoExecutable: true,
  },
  change_style: {
    type: 'change_style',
    category: 'writing',
    label: '改变文风',
    description: '改变指定章节或全局的写作风格，如口语化、文艺风、悬疑风等',
    requiredParams: [],
    optionalParams: ['chapterNumber', 'style', 'direction'],
    examples: ['改成更幽默的风格', '文风再口语化一些', '第3章改成悬疑风格'],
    autoExecutable: false,
  },

  // ==========================================================================
  // 审计类 (3种)
  // ==========================================================================
  audit_chapter: {
    type: 'audit_chapter',
    category: 'audit',
    label: '审计章节',
    description: '审计指定章节的质量，检查语法、逻辑、一致性等问题',
    requiredParams: ['chapterNumber'],
    optionalParams: [],
    examples: ['检查第3章有没有问题', '审计第5章', '看看第7章写得怎么样'],
    autoExecutable: true,
  },
  audit_all: {
    type: 'audit_all',
    category: 'audit',
    label: '审计所有章节',
    description: '对所有已写章节进行全面质量审计，生成综合审计报告',
    requiredParams: [],
    optionalParams: [],
    examples: ['全面检查一下', '审计所有章节', '帮我做个全面质检'],
    autoExecutable: true,
  },
  check_continuity: {
    type: 'check_continuity',
    category: 'audit',
    label: '检查连贯性',
    description: '检查章节间的剧情连贯性、人物一致性、时间线合理性',
    requiredParams: [],
    optionalParams: ['chapterRange'],
    examples: ['检查一下剧情是否连贯', '看看前后章衔接有没有问题', '连贯性检查'],
    autoExecutable: true,
  },

  // ==========================================================================
  // 状态管理类 (5种)
  // ==========================================================================
  create_entity: {
    type: 'create_entity',
    category: 'entity',
    label: '创建实体',
    description: '创建新的实体（人物、地点、物品等），记录到知识库中',
    requiredParams: ['entityName', 'entityType'],
    optionalParams: ['content'],
    examples: ['创建一个角色叫李白', '添加一个新地点：长安城', '新增一个法宝：青莲剑'],
    autoExecutable: false,
  },
  update_entity: {
    type: 'update_entity',
    category: 'entity',
    label: '更新实体',
    description: '更新已有实体的属性信息，如人物性格、地点描述等',
    requiredParams: ['entityName'],
    optionalParams: ['content', 'entityType'],
    examples: ['更新李白的背景故事', '修改长安城的描述', '给张三加一个属性：擅长剑术'],
    autoExecutable: false,
  },
  rename_entity: {
    type: 'rename_entity',
    category: 'entity',
    label: '重命名实体',
    description: '重命名已有实体，同时更新所有引用该实体的章节内容',
    requiredParams: ['entityName'],
    optionalParams: ['content'],
    examples: ['把李白改名叫李太白', '把长安城改名为京城', '角色张三改名为张无忌'],
    autoExecutable: false,
  },
  delete_entity: {
    type: 'delete_entity',
    category: 'entity',
    label: '删除实体',
    description: '从知识库中删除指定实体，操作不可逆，需用户确认',
    requiredParams: ['entityName'],
    optionalParams: [],
    examples: ['删除角色李白', '移除长安城这个地点', '把青莲剑从知识库删掉'],
    autoExecutable: false,
  },
  query_entity: {
    type: 'query_entity',
    category: 'entity',
    label: '查询实体',
    description: '查询指定实体的详细信息，包括属性、出现章节等',
    requiredParams: [],
    optionalParams: ['entityName', 'entityType', 'query'],
    examples: ['李白是谁', '查看所有角色', '长安城出现在哪些章节'],
    autoExecutable: true,
  },

  // ==========================================================================
  // 大纲类 (3种)
  // ==========================================================================
  extend_outline: {
    type: 'extend_outline',
    category: 'outline',
    label: '扩展大纲',
    description: '在现有大纲基础上扩展更多章节或细化情节分支',
    requiredParams: [],
    optionalParams: ['direction', 'count'],
    examples: ['把大纲再细化一些', '大纲扩展到50章', '帮我补充后面的大纲'],
    autoExecutable: true,
  },
  modify_outline: {
    type: 'modify_outline',
    category: 'outline',
    label: '修改大纲',
    description: '修改现有大纲的特定章节内容或调整章节顺序',
    requiredParams: [],
    optionalParams: ['chapterNumber', 'direction', 'content'],
    examples: ['修改第10章的大纲', '把第5章和第6章调换', '调整一下中间部分的剧情走向'],
    autoExecutable: false,
  },
  query_outline: {
    type: 'query_outline',
    category: 'outline',
    label: '查询大纲',
    description: '查看当前大纲的整体结构或指定章节的摘要',
    requiredParams: [],
    optionalParams: ['chapterNumber', 'chapterRange'],
    examples: ['看一下大纲', '第10章到第20章的大纲是什么', '查看整体故事结构'],
    autoExecutable: true,
  },

  // ==========================================================================
  // 批量操作类 (2种)
  // ==========================================================================
  batch_generate: {
    type: 'batch_generate',
    category: 'batch',
    label: '批量生成',
    description: '批量生成多个章节的内容，适合快速产出初稿',
    requiredParams: [],
    optionalParams: ['chapterRange', 'count', 'direction'],
    examples: ['批量生成第10到15章', '一次性写完后面5章', '把剩余章节全部生成'],
    autoExecutable: true,
  },
  batch_audit: {
    type: 'batch_audit',
    category: 'batch',
    label: '批量审计',
    description: '批量审计多个章节，生成逐章审计报告',
    requiredParams: [],
    optionalParams: ['chapterRange'],
    examples: ['审计第5到第10章', '检查前半部分的所有章节', '批量质检第20到30章'],
    autoExecutable: true,
  },

  // ==========================================================================
  // 系统类 (2种)
  // ==========================================================================
  show_status: {
    type: 'show_status',
    category: 'system',
    label: '显示状态',
    description: '显示当前写作项目的整体进度、章节数量、字数统计等信息',
    requiredParams: [],
    optionalParams: [],
    examples: ['当前进度如何', '显示一下状态', '写了多少章了'],
    autoExecutable: true,
  },
  help: {
    type: 'help',
    category: 'system',
    label: '帮助信息',
    description: '显示所有支持的命令和操作说明',
    requiredParams: [],
    optionalParams: [],
    examples: ['帮助', '怎么用', '有哪些功能', 'help'],
    autoExecutable: true,
  },
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 根据Intent类型获取元数据
 */
export function getIntentByType(type: IntentType): IntentMeta {
  return INTENT_REGISTRY[type]
}

/**
 * 获取所有Intent的示例列表，用于NLP训练或提示词生成
 */
export function getIntentExamples(): Array<{ intent: IntentType; example: string }> {
  const examples: Array<{ intent: IntentType; example: string }> = []
  for (const meta of Object.values(INTENT_REGISTRY)) {
    for (const example of meta.examples) {
      examples.push({ intent: meta.type, example })
    }
  }
  return examples
}

/**
 * 根据分类过滤Intent列表
 */
export function getIntentsByCategory(category: IntentMeta['category']): IntentType[] {
  return (Object.values(INTENT_REGISTRY) as IntentMeta[])
    .filter(meta => meta.category === category)
    .map(meta => meta.type)
}

/**
 * 获取所有可自动执行的Intent类型
 */
export function getAutoExecutableIntents(): IntentType[] {
  return (Object.values(INTENT_REGISTRY) as IntentMeta[])
    .filter(meta => meta.autoExecutable)
    .map(meta => meta.type)
}

/**
 * 验证给定的字符串是否为合法的IntentType
 */
export function isValidIntentType(value: string): value is IntentType {
  return value in INTENT_REGISTRY
}
