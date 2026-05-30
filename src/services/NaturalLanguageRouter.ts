/**
 * 自然语言意图路由器
 * @module services/NaturalLanguageRouter
 *
 * 基于正则快速匹配 + LLM 兜底的自然语言意图识别系统
 * 将用户的自然语言输入解析为结构化的 Intent 对象
 *
 * 策略：
 * 1. 优先使用正则快速匹配（无LLM调用，速度快）
 * 2. 置信度 > 0.8 时直接返回
 * 3. 否则回退到 LLM 分类（准确率高）
 * 4. 返回两者中置信度更高的结果
 */

import { getLogger } from '@/utils/logger'
import type { IntentType, IntentParams, IntentMatch, IntentMeta } from '@/types/interactionIntents'
import { INTENT_REGISTRY } from '@/types/interactionIntents'

const logger = getLogger('service:nl-router')

// ============================================================================
// 中文数字映射
// ============================================================================

const CHINESE_NUMBERS: Record<string, number> = {
  '零': 0,
  '一': 1, '壹': 1,
  '二': 2, '两': 2, '贰': 2, '俩': 2,
  '三': 3, '叁': 3,
  '四': 4, '肆': 4,
  '五': 5, '伍': 5,
  '六': 6, '陆': 6,
  '七': 7, '柒': 7,
  '八': 8, '捌': 8,
  '九': 9, '玖': 9,
  '十': 10, '拾': 10,
  '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
  '十六': 16, '十七': 17, '十八': 18, '十九': 19,
  '二十': 20, '廿': 20,
  '二十一': 21, '二十二': 22, '二十三': 23, '二十四': 24, '二十五': 25,
  '二十六': 26, '二十七': 27, '二十八': 28, '二十九': 29,
  '三十': 30, '卅': 30,
  '三十一': 31, '三十二': 32, '三十三': 33, '三十四': 34, '三十五': 35,
  '三十六': 36, '三十七': 37, '三十八': 38, '三十九': 39,
  '四十': 40,
  '四十一': 41, '四十二': 42, '四十三': 43, '四十四': 44, '四十五': 45,
  '四十六': 46, '四十七': 47, '四十八': 48, '四十九': 49,
  '五十': 50,
  '五十一': 51, '五十二': 52, '五十三': 53, '五十四': 54, '五十五': 55,
  '五十六': 56, '五十七': 57, '五十八': 58, '五十九': 59,
  '六十': 60, '七十': 70, '八十': 80, '九十': 90,
  '一百': 100, '百': 100,
}

// ============================================================================
// 正则模式定义
// ============================================================================

interface RegexPattern {
  /** 匹配正则 */
  pattern: RegExp
  /** 对应意图类型 */
  intent: IntentType
  /** 从正则匹配结果中提取参数 */
  extractParams?: (match: RegExpMatchArray) => IntentParams
  /** 优先级（数字越大越优先，默认0） */
  priority?: number
}

/**
 * 构建章节号捕获组（支持阿拉伯数字和中文数字）
 */
const CH = '(\\d+|[一二三四五六七八九十百零壹贰叁肆伍陆柒捌玖拾廿卅]+)'

/**
 * 正则模式列表
 * 按意图分类组织，共计 35+ 条规则覆盖全部 22 种意图
 */
const REGEX_PATTERNS: RegexPattern[] = [
  // ========================================================================
  // 写作类 (Writing intents) - 7种意图，14条规则
  // ========================================================================

  // write_next: 写下一章
  { pattern: /(?:帮我)?(?:写|生成)下一章/, intent: 'write_next', priority: 2 },
  { pattern: /继续(?:写|创作)/, intent: 'write_next', priority: 1 },
  { pattern: /下一章/, intent: 'write_next' },
  { pattern: /续写下去|接着写|往下写/, intent: 'write_next' },

  // write_chapter: 写指定章节
  {
    pattern: /(?:帮我)?(?:写|生成|创作)第\s*${CH}\s*章/,
    intent: 'write_chapter',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },
  {
    pattern: /(?:写|生成)第\s*${CH}\s*章/,
    intent: 'write_chapter',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },

  // rewrite_chapter: 改写指定章节
  {
    pattern: /(?:改写|重写)第\s*${CH}\s*章/,
    intent: 'rewrite_chapter',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },
  {
    pattern: /第\s*${CH}\s*章(?:改写|重写|重来)/,
    intent: 'rewrite_chapter',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },
  {
    pattern: /(?:把|将)第\s*${CH}\s*章(?:改写|重写)/,
    intent: 'rewrite_chapter',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },

  // continue_writing: 续写
  {
    pattern: /续写\s*${CH}\s*(?:章|节)/,
    intent: 'continue_writing',
    extractParams: (m) => ({ count: parseNumber(m[1]) }),
  },
  { pattern: /续写下去|继续续写|接着续写/, intent: 'continue_writing' },

  // expand_chapter: 扩展章节
  {
    pattern: /(?:扩写|扩展|扩充)第\s*${CH}\s*章/,
    intent: 'expand_chapter',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },
  {
    pattern: /第\s*${CH}\s*章(?:太短|太少了).*(?:扩[充写]|加[长多]|丰富)/,
    intent: 'expand_chapter',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },
  {
    pattern: /(?:把|将)第\s*${CH}\s*章(?:写长|扩展|丰富|充实)/,
    intent: 'expand_chapter',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },

  // compress_chapter: 压缩章节
  {
    pattern: /(?:压缩|精简|缩短|瘦身)第\s*${CH}\s*章/,
    intent: 'compress_chapter',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },
  {
    pattern: /第\s*${CH}\s*章(?:太长|太多了).*(?:压缩|精简|缩短|删减)/,
    intent: 'compress_chapter',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },
  {
    pattern: /(?:把|将)第\s*${CH}\s*章(?:压缩|精简|缩短)/,
    intent: 'compress_chapter',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },

  // change_style: 改变文风
  {
    pattern: /(?:改|换|切换|变成?)(?:为|成|到)?(.+?)(?:风格|文风|口吻|语气)/,
    intent: 'change_style',
    extractParams: (m) => ({ style: m[1]?.trim() }),
  },
  {
    pattern: /(?:风格|文风)(?:改为?|换成?|变成?|切换[为到]?)(.+)/,
    intent: 'change_style',
    extractParams: (m) => ({ style: m[1]?.trim() }),
  },
  {
    pattern: /第\s*${CH}\s*章(?:改|换|变成?)(?:为|成|到)?(.+?)(?:风格|文风)/,
    intent: 'change_style',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]), style: m[2]?.trim() }),
  },
  { pattern: /(?:更|再)?(?:口语化|文艺|幽默|严肃|悬疑|轻松)/, intent: 'change_style', extractParams: (m) => ({ style: m[0] }) },

  // ========================================================================
  // 审计类 (Audit intents) - 3种意图，6条规则
  // ========================================================================

  // audit_chapter: 审计指定章节
  {
    pattern: /(?:检查|审计|审核|质检|查查|看看)第\s*${CH}\s*章/,
    intent: 'audit_chapter',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },
  {
    pattern: /第\s*${CH}\s*章(?:有没有问题|写得[怎怎]么样|质量[怎怎]么样|检查一下)/,
    intent: 'audit_chapter',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },

  // audit_all: 审计所有章节
  { pattern: /(?:检查|审计|审核|质检)(?:所有|全部|所有的|全部的)(?:章节|内容)/, intent: 'audit_all' },
  { pattern: /全面(?:检查|审计|审核|质检)/, intent: 'audit_all' },
  { pattern: /(?:整体|全局)(?:检查|审计|质检)/, intent: 'audit_all' },

  // check_continuity: 检查连贯性
  { pattern: /(?:检查|看看)(?:连贯|连续|衔接|剧情连续性)/, intent: 'check_continuity' },
  { pattern: /防吃书|吃书检查/, intent: 'check_continuity' },
  { pattern: /(?:前后|章节)(?:衔接|连贯|一致性)/, intent: 'check_continuity' },

  // ========================================================================
  // 实体类 (Entity intents) - 5种意图，10条规则
  // ========================================================================

  // create_entity: 创建实体
  {
    pattern: /创建(?:角色|人物|实体|人物卡)[：:]\s*(.+)/,
    intent: 'create_entity',
    extractParams: (m) => ({ entityName: m[1].trim() }),
  },
  {
    pattern: /创建(?:一个|新的)?(?:角色|人物|实体)[叫名叫]\s*(.+)/,
    intent: 'create_entity',
    extractParams: (m) => ({ entityName: m[1].trim() }),
  },
  {
    pattern: /(?:添加|新增|新建)(?:一个)?(?:角色|人物|实体|地点|物品)[：:]\s*(.+)/,
    intent: 'create_entity',
    extractParams: (m) => ({ entityName: m[1].trim() }),
  },
  {
    pattern: /(?:添加|新增|新建)(?:一个)?(?:角色|人物|实体)[叫名叫]\s*(.+)/,
    intent: 'create_entity',
    extractParams: (m) => ({ entityName: m[1].trim() }),
  },

  // update_entity: 更新实体
  {
    pattern: /(?:更新|修改|编辑)(?:角色|人物|实体)?[：:]\s*(.+)/,
    intent: 'update_entity',
    extractParams: (m) => ({ entityName: m[1].trim() }),
  },
  {
    pattern: /(?:给|为)\s*(.+?)\s*(?:添加|加上|增加|更新)(?:属性|描述|设定)/,
    intent: 'update_entity',
    extractParams: (m) => ({ entityName: m[1].trim() }),
  },

  // rename_entity: 重命名实体
  {
    pattern: /(?:把|将)\s*(.+?)\s*(?:改[名称为叫]|重命名[为成]?|更名为?|改为|改叫)\s*(.+)/,
    intent: 'rename_entity',
    extractParams: (m) => ({ entityName: m[1].trim(), content: m[2].trim() }),
  },
  {
    pattern: /(?:角色|人物)\s*(.+?)\s*(?:改[名称为叫]|重命名[为成]?)\s*(.+)/,
    intent: 'rename_entity',
    extractParams: (m) => ({ entityName: m[1].trim(), content: m[2].trim() }),
  },

  // delete_entity: 删除实体
  {
    pattern: /(?:删除|移除|去掉)(?:角色|人物|实体)[：:]\s*(.+)/,
    intent: 'delete_entity',
    extractParams: (m) => ({ entityName: m[1].trim() }),
  },
  {
    pattern: /(?:删除|移除|去掉)(?:角色|人物|实体)\s*(.+)/,
    intent: 'delete_entity',
    extractParams: (m) => ({ entityName: m[1].trim() }),
  },

  // query_entity: 查询实体
  {
    pattern: /(?:查询|查看|搜索|找)(?:角色|人物|实体)[：:]\s*(.+)/,
    intent: 'query_entity',
    extractParams: (m) => ({ entityName: m[1].trim() }),
  },
  {
    pattern: /(.+?)(?:是谁|什么人|什么身份|什么来头)/,
    intent: 'query_entity',
    extractParams: (m) => ({ entityName: m[1].trim() }),
  },
  {
    pattern: /(?:查看|列出|显示)(?:所有|全部)(?:角色|人物|实体)/,
    intent: 'query_entity',
  },

  // ========================================================================
  // 大纲类 (Outline intents) - 3种意图，5条规则
  // ========================================================================

  // extend_outline: 扩展大纲
  { pattern: /(?:扩展|扩充|展开|细化)大纲/, intent: 'extend_outline' },
  { pattern: /大纲(?:扩展|扩充|展开|细化)/, intent: 'extend_outline' },
  {
    pattern: /大纲(?:扩展|扩充)到?\s*${CH}\s*(?:章|节)/,
    intent: 'extend_outline',
    extractParams: (m) => ({ count: parseNumber(m[1]) }),
  },

  // modify_outline: 修改大纲
  { pattern: /(?:修改|调整|改|编辑)大纲/, intent: 'modify_outline' },
  {
    pattern: /(?:修改|调整)第\s*${CH}\s*章(?:的)?大纲/,
    intent: 'modify_outline',
    extractParams: (m) => ({ chapterNumber: parseNumber(m[1]) }),
  },

  // query_outline: 查询大纲
  { pattern: /(?:查看|看看|显示|列出)大纲/, intent: 'query_outline' },
  {
    pattern: /第\s*${CH}\s*章(?:到|至|~)第\s*${CH}\s*章(?:的)?大纲/,
    intent: 'query_outline',
    extractParams: (m) => ({ chapterRange: [parseNumber(m[1])!, parseNumber(m[2])!] }),
  },
  { pattern: /(?:整体|全局|当前)(?:故事)?结构/, intent: 'query_outline' },

  // ========================================================================
  // 批量操作类 (Batch intents) - 2种意图，4条规则
  // ========================================================================

  // batch_generate: 批量生成
  {
    pattern: /批量(?:生成|写作|创作)\s*${CH}\s*(?:章|节)/,
    intent: 'batch_generate',
    extractParams: (m) => ({ count: parseNumber(m[1]) }),
  },
  {
    pattern: /(?:一次性|连续|一口气)(?:写|生成|创作)\s*${CH}\s*(?:章|节)/,
    intent: 'batch_generate',
    extractParams: (m) => ({ count: parseNumber(m[1]) }),
  },
  {
    pattern: /(?:生成|写)(?:完)?(?:第\s*${CH}\s*章)?\s*(?:到|至|~)\s*(?:第\s*${CH}\s*章)/,
    intent: 'batch_generate',
    extractParams: (m) => ({
      chapterRange: [parseNumber(m[1])!, parseNumber(m[2])!],
      count: parseNumber(m[2])! - parseNumber(m[1])! + 1,
    }),
  },
  { pattern: /(?:把|将)(?:剩余|剩下|后面)(?:的)?(?:章节|内容)(?:全部|都)?(?:生成|写完)/, intent: 'batch_generate' },

  // batch_audit: 批量审计
  {
    pattern: /(?:批量|连续|一起)(?:检查|审计|审核|质检)\s*(?:第\s*${CH}\s*章)?\s*(?:到|至|~)\s*(?:第\s*${CH}\s*章)/,
    intent: 'batch_audit',
    extractParams: (m) => ({ chapterRange: [parseNumber(m[1])!, parseNumber(m[2])!] }),
  },
  {
    pattern: /(?:审计|检查|质检)(?:第\s*${CH}\s*章)?\s*(?:到|至|~)\s*(?:第\s*${CH}\s*章)/,
    intent: 'batch_audit',
    extractParams: (m) => ({ chapterRange: [parseNumber(m[1])!, parseNumber(m[2])!] }),
  },

  // ========================================================================
  // 系统类 (System intents) - 2种意图，4条规则
  // ========================================================================

  // show_status: 显示状态
  { pattern: /(?:当前|系统|项目|写作)(?:状态|进度|情况)/, intent: 'show_status' },
  { pattern: /(?:写了|完成)(?:多少|几)(?:章|节)(?:了)?/, intent: 'show_status' },
  { pattern: /(?:进度|字数|统计|概览)/, intent: 'show_status' },

  // help: 帮助
  { pattern: /^帮助$|^help$/i, intent: 'help', priority: 10 },
  { pattern: /怎么用|有哪些功能|功能[介绍列表说明]|使用[说明方法指南]/, intent: 'help' },
  { pattern: /(?:你|系统)(?:能|会|可以)(?:做|干)(?:什么|啥|些啥)/, intent: 'help' },
]

// 将模板字符串中的 ${CH} 替换为实际的正则表达式
const compiledPatterns: RegexPattern[] = REGEX_PATTERNS.map((p) => {
  const source = p.pattern.source.replace(/\$\{CH\}/g, CH)
  return {
    ...p,
    pattern: new RegExp(source, p.pattern.flags),
  }
}).sort((a, b) => (b.priority || 0) - (a.priority || 0))

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 解析中文数字为阿拉伯数字
 */
function parseChineseNumber(text: string): number | undefined {
  if (!text) return undefined

  // 直接查表
  const direct = CHINESE_NUMBERS[text]
  if (direct !== undefined) return direct

  // 纯阿拉伯数字
  if (/^\d+$/.test(text)) {
    return parseInt(text, 10)
  }

  // 复合中文数字解析（如：三百五十、二十一）
  let result = 0
  let current = 0

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const value = CHINESE_NUMBERS[char]

    if (value === undefined) continue

    if (value === 100) {
      // 百
      result += (current || 1) * 100
      current = 0
    } else if (value === 10) {
      // 十
      if (i === 0 || current === 0) {
        // 十开头（如"十五"）或前面没有数字（如"一十"）
        current = (current || 1) * 10
      } else {
        current = current * 10
      }
    } else {
      current = value
    }
  }

  result += current
  return result > 0 ? result : undefined
}

/**
 * 解析文本中的数字（支持阿拉伯数字和中文数字）
 */
function parseNumber(text: string | undefined): number | undefined {
  if (!text) return undefined
  text = text.trim()
  if (!text) return undefined

  // 阿拉伯数字
  if (/^\d+$/.test(text)) {
    return parseInt(text, 10)
  }

  // 中文数字
  return parseChineseNumber(text)
}

// ============================================================================
// LLM 意图分类提示词
// ============================================================================

function buildLLMSystemPrompt(): string {
  const categories: Record<string, IntentMeta[]> = {}

  for (const meta of Object.values(INTENT_REGISTRY)) {
    if (!categories[meta.category]) {
      categories[meta.category] = []
    }
    categories[meta.category].push(meta)
  }

  let prompt = `你是一个意图分类系统。你的任务是分析用户的自然语言输入，并将其分类为以下预定义意图之一。

请以JSON格式返回结果：
{
  "intent": "意图类型",
  "params": { ... },
  "confidence": 0.0-1.0
}

支持的意图列表：

`

  const categoryLabels: Record<string, string> = {
    writing: '写作类',
    audit: '审计类',
    entity: '实体管理类',
    outline: '大纲类',
    batch: '批量操作类',
    system: '系统类',
  }

  for (const [category, intents] of Object.entries(categories)) {
    prompt += `【${categoryLabels[category] || category}】\n`
    for (const meta of intents) {
      prompt += `- ${meta.type}: ${meta.label} - ${meta.description}\n`
      prompt += `  示例: ${meta.examples.join('、')}\n`
      if (meta.requiredParams.length > 0) {
        prompt += `  必需参数: ${meta.requiredParams.join(', ')}\n`
      }
      if (meta.optionalParams.length > 0) {
        prompt += `  可选参数: ${meta.optionalParams.join(', ')}\n`
      }
    }
    prompt += '\n'
  }

  prompt += `参数说明：
- chapterNumber: 章节号（数字）
- count: 数量（数字）
- entityName: 实体名称（字符串）
- entityContent: 实体内容描述（字符串）
- newEntityName: 新实体名称（字符串，用于重命名）
- style: 风格描述（字符串）
- direction: 方向指导（字符串）
- outlineContent: 大纲内容（字符串）
- chapterRange: 章节范围 [起始章, 结束章]

注意事项：
1. 只返回JSON，不要有其他文字
2. 如果无法识别意图，返回 {"intent": "help", "params": {}, "confidence": 0.3}
3. chapterNumber 支持阿拉伯数字和中文数字，请统一转为阿拉伯数字
4. confidence 表示你对分类结果的置信度，范围 0-1
5. 参数中不需要的字段不要包含在params中
`

  return prompt
}

const LLM_SYSTEM_PROMPT = buildLLMSystemPrompt()

// ============================================================================
// NaturalLanguageRouter 类
// ============================================================================

export class NaturalLanguageRouter {
  /** LLM 系统提示词缓存 */
  private readonly systemPrompt: string = LLM_SYSTEM_PROMPT

  constructor() {
    logger.info('自然语言路由器初始化完成', {
      patternCount: compiledPatterns.length,
      intentCount: Object.keys(INTENT_REGISTRY).length,
    })
  }

  /**
   * 路由用户输入到 IntentMatch
   *
   * 策略：
   * 1. 优先使用正则快速匹配（无LLM调用，速度快）
   * 2. 置信度 > 0.8 时直接返回
   * 3. 否则回退到 LLM 分类（准确率高）
   * 4. 返回两者中置信度更高的结果
   *
   * @param input 用户自然语言输入
   * @returns IntentMatch 或 null（无法识别时）
   */
  async route(input: string): Promise<IntentMatch | null> {
    const trimmedInput = input.trim()
    if (!trimmedInput) {
      logger.warn('收到空输入，跳过路由')
      return null
    }

    logger.info('开始路由用户输入', { input: trimmedInput })

    // 第一步：正则快速匹配
    const regexResult = this.regexMatch(trimmedInput)

    if (regexResult && regexResult.confidence >= 0.8) {
      logger.info('正则匹配成功且置信度足够', {
        intent: regexResult.intent,
        confidence: regexResult.confidence,
        params: regexResult.params,
      })
      return regexResult
    }

    // 第二步：LLM 兜底分类
    logger.info('正则匹配置信度不足或未匹配，尝试LLM分类', {
      regexResult: regexResult ? { intent: regexResult.intent, confidence: regexResult.confidence } : null,
    })

    let llmResult: IntentMatch | null = null
    try {
      llmResult = await this.llmMatch(trimmedInput)
    } catch (error) {
      logger.error('LLM 意图分类失败', { error })
    }

    // 第三步：选择置信度更高的结果
    if (regexResult && llmResult) {
      const best = regexResult.confidence >= llmResult.confidence ? regexResult : llmResult
      logger.info('选择置信度更高的结果', {
        regexConfidence: regexResult.confidence,
        llmConfidence: llmResult.confidence,
        selected: best.intent,
        source: best.method,
      })
      return best
    }

    if (llmResult) {
      logger.info('使用LLM分类结果', {
        intent: llmResult.intent,
        confidence: llmResult.confidence,
      })
      return llmResult
    }

    if (regexResult) {
      logger.info('使用正则匹配结果（低置信度）', {
        intent: regexResult.intent,
        confidence: regexResult.confidence,
      })
      return regexResult
    }

    logger.warn('无法识别用户意图', { input: trimmedInput })
    return null
  }

  /**
   * 使用正则模式进行快速匹配
   *
   * 遍历所有正则模式，返回第一个匹配的结果
   * 正则匹配的默认置信度为 0.9
   */
  private regexMatch(input: string): IntentMatch | null {
    for (const { pattern, intent, extractParams } of compiledPatterns) {
      const match = input.match(pattern)
      if (match) {
        const params: IntentParams = extractParams ? extractParams(match) : {}

        logger.debug('正则匹配成功', {
          pattern: pattern.source,
          intent,
          match: match[0],
          params,
        })

        return {
          intent,
          params,
          confidence: 0.9,
          method: 'regex',
          rawText: input,
        }
      }
    }

    logger.debug('正则匹配未命中任何模式', { input })
    return null
  }

  /**
   * 基于 LLM 的意图分类（兜底方案）
   *
   * 发送用户输入到 LLM，请求其返回结构化的意图分类结果
   */
  private async llmMatch(input: string): Promise<IntentMatch | null> {
    // 延迟导入避免循环依赖
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    if (!aiStore.isInitialized) {
      logger.warn('AI 服务未初始化，跳过 LLM 分类')
      return null
    }

    const messages = [
      { role: 'system' as const, content: this.systemPrompt },
      { role: 'user' as const, content: `请对以下用户输入进行意图分类：\n\n"${input}"` },
    ]

    logger.info('发送 LLM 意图分类请求', { input })

    try {
      const response = await aiStore.chat(messages, {
        type: 'check',
        complexity: 'low',
        priority: 'speed',
      })

      const content = response.content?.trim() || ''
      logger.debug('LLM 意图分类原始响应', { content })

      // 解析 JSON 响应
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        logger.warn('LLM 响应中未找到JSON', { content })
        return null
      }

      const parsed = JSON.parse(jsonMatch[0])

      if (!parsed.intent || !isValidIntentType(parsed.intent)) {
        logger.warn('LLM 返回的意图类型无效', { intent: parsed.intent })
        return null
      }

      const result: IntentMatch = {
        intent: parsed.intent as IntentType,
        params: sanitizeParams(parsed.params || {}),
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
        method: 'llm',
        rawText: input,
      }

      logger.info('LLM 意图分类成功', {
        intent: result.intent,
        confidence: result.confidence,
        params: result.params,
      })

      return result
    } catch (error) {
      logger.error('LLM 意图分类请求失败', { error })
      throw error
    }
  }

  /**
   * 解析中文数字为阿拉伯数字
   */
  parseChineseNumber(text: string): number | undefined {
    return parseChineseNumber(text)
  }

  /**
   * 解析文本中的数字（支持阿拉伯和中文数字）
   */
  parseNumber(text: string): number | undefined {
    return parseNumber(text)
  }

  /**
   * 获取帮助文本，列出所有支持的意图
   */
  getHelpText(): string {
    const categories: Record<string, IntentMeta[]> = {}

    for (const meta of Object.values(INTENT_REGISTRY)) {
      if (!categories[meta.category]) {
        categories[meta.category] = []
      }
      categories[meta.category].push(meta)
    }

    const categoryLabels: Record<string, string> = {
      writing: '✍️ 写作',
      audit: '🔍 审计',
      entity: '👤 实体管理',
      outline: '📋 大纲',
      batch: '📦 批量操作',
      system: '⚙️ 系统',
    }

    const lines: string[] = [
      '📖 AI小说工坊 - 自然语言命令指南',
      '=' .repeat(40),
      '',
      '您可以用自然语言与系统交互，以下是我能理解的操作：',
      '',
    ]

    for (const [category, intents] of Object.entries(categories)) {
      lines.push(`${categoryLabels[category] || category}`)
      lines.push('-'.repeat(30))

      for (const meta of intents) {
        lines.push(`  ${meta.label}（${meta.type}）`)
        lines.push(`    ${meta.description}`)
        lines.push(`    示例：${meta.examples.slice(0, 3).join(' | ')}`)
        if (meta.requiredParams.length > 0) {
          lines.push(`    参数：${meta.requiredParams.join(', ')}`)
        }
        lines.push('')
      }
    }

    lines.push('💡 提示：')
    lines.push('  - 支持中文数字，如"第五章"、"十章"')
    lines.push('  - 支持多种表达方式，如"写下一章"、"继续写"、"下一章"')
    lines.push('  - 如果不确定如何表达，直接描述你想做什么即可')

    return lines.join('\n')
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 验证是否为合法的 IntentType
 */
function isValidIntentType(value: string): value is IntentType {
  return value in INTENT_REGISTRY
}

/**
 * 清理参数，移除空值和无效字段
 */
function sanitizeParams(params: Record<string, unknown>): IntentParams {
  const result: IntentParams = {}

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue

    // 数字类型字段
    if (['chapterNumber', 'count'].includes(key)) {
      const num = typeof value === 'number' ? value : parseNumber(String(value))
      if (num !== undefined) {
        result[key as keyof IntentParams] = num
      }
      continue
    }

    // 章节范围
    if (key === 'chapterRange' && Array.isArray(value) && value.length === 2) {
      const start = typeof value[0] === 'number' ? value[0] : parseNumber(String(value[0]))
      const end = typeof value[1] === 'number' ? value[1] : parseNumber(String(value[1]))
      if (start !== undefined && end !== undefined) {
        result.chapterRange = [start, end]
      }
      continue
    }

    // 字符串类型字段
    if (typeof value === 'string') {
      result[key as keyof IntentParams] = value.trim()
      continue
    }

    // 其他类型直接传递
    result[key as keyof IntentParams] = value
  }

  return result
}

// ============================================================================
// 导出单例
// ============================================================================

/** 全局单例路由器实例 */
let routerInstance: NaturalLanguageRouter | null = null

/**
 * 获取 NaturalLanguageRouter 单例
 */
export function getNaturalLanguageRouter(): NaturalLanguageRouter {
  if (!routerInstance) {
    routerInstance = new NaturalLanguageRouter()
  }
  return routerInstance
}

/**
 * 重置单例（用于测试）
 */
export function resetNaturalLanguageRouter(): void {
  routerInstance = null
}
