/**
 * ContinuityAuditor（连续性审计员）
 *
 * 对章节正文进行多维度质量审计，输出结构化的 AuditResult。
 * 参考 InkOS 的 continuity.ts 33维度审计设计。
 */

import { getLogger } from '@/utils/logger'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import { getGenreProfile, matchGenreFromText } from '@/types/genreProfile'
import type { GenreAuditDimension } from '@/types/genreProfile'
import { analyzeHookHealth } from '@/utils/hookHealthAnalyzer'
import type { HookHealthInput, HookHealthResult } from '@/utils/hookHealthAnalyzer'
import { analyzeChapterCadence } from '@/utils/chapterCadence'
import type { CadenceChapter, CadenceResult } from '@/utils/chapterCadence'
import { validateHookLedger } from '@/utils/hookLedgerValidator'
import { analyzeDialogue } from '@/utils/dialogueAnalyzer'
import { withRetry, AUDITOR_RETRY_CONFIG } from '@/utils/llmRetry'
import type { ChatResponse } from '@/types/ai'
import type {
  AuditChapterInput,
  AuditResult,
  AuditIssue,
  ContextPackage,
  RuleStack,
  ChapterMemo,
  TokenUsage,
  HookEntry,
} from '@/services/pipeline/types'

const logger = getLogger('agent:auditor')

// ============================================================================
// 审计维度定义
// ============================================================================

export interface AuditDimension {
  id: string
  name: string
  severity: 'critical' | 'warning' | 'info'
  weight: number
  description: string
  checkInstruction: string
}

export const AUDIT_DIMENSIONS: AuditDimension[] = [
  {
    id: 'ooc',
    name: 'OOC检查',
    severity: 'critical',
    weight: 10,
    description: '角色行为是否偏离人设',
    checkInstruction: '检查每个角色的言行是否与其设定的性格、背景、能力一致。特别关注：角色做出不符合其知识水平的判断、突然改变已建立的行为模式、说出不符合其性格的话。',
  },
  {
    id: 'timeline',
    name: '时间线检查',
    severity: 'critical',
    weight: 9,
    description: '时间线是否自洽',
    checkInstruction: '检查事件发生的时间顺序是否合理。关注：角色同时出现在两个地点、事件间隔不合理、回忆/闪回的时间标记矛盾。',
  },
  {
    id: 'lore',
    name: '设定冲突',
    severity: 'critical',
    weight: 9,
    description: '是否与已有设定矛盾',
    checkInstruction: '检查正文内容是否与项目世界观、力量体系、地理设定等产生矛盾。关注：已死角色复活、已毁地点再现、能力设定前后不一。',
  },
  {
    id: 'power',
    name: '战力崩坏',
    severity: 'critical',
    weight: 8,
    description: '力量体系是否合理',
    checkInstruction: '检查战斗场景中的力量对比是否合理。关注：弱者无理由战胜强者、新能力无铺垫出现、已知能力威力大幅偏离。',
  },
  {
    id: 'numbers',
    name: '数值检查',
    severity: 'warning',
    weight: 6,
    description: '数值前后是否一致',
    checkInstruction: '检查距离、年龄、时间、数量等数值是否前后一致。关注：角色年龄与事件不符、物品数量矛盾。',
  },
  {
    id: 'hooks',
    name: '伏笔检查',
    severity: 'warning',
    weight: 7,
    description: '悬而未决伏笔状态',
    checkInstruction: '检查伏笔池中的伏笔是否在合理时机被提及或推进。\n\n【确定性诊断数据】如果上下文中包含伏笔健康诊断，请参考以下数据：\n- 健康评分低于60分：标记为critical级别问题\n- 存在stale伏笔（超过半衰期未推进）：要求本章必须推进至少一个stale伏笔\n- 存在blocked伏笔（上游依赖未解决）：检查是否可以先解决上游伏笔\n- advancePressure最高的伏笔：优先在本章推进\n- 活跃伏笔超过15个：建议控制伏笔数量\n\n关注：长期未推进的伏笔、过早揭示的伏笔、遗忘的伏笔。',
  },
  {
    id: 'pacing',
    name: '节奏检查',
    severity: 'warning',
    weight: 6,
    description: '章节节奏是否单调',
    checkInstruction: '检查章节是否有张弛变化。\n\n【确定性诊断数据】如果上下文中包含节奏分析结果，请参考以下数据：\n- 连续同类型章节≥3章：标记节奏单调警告，建议切换场景类型\n- 连续高张力章节≥3章：标记读者疲劳警告，建议插入喘息/日常章节\n- 标题同质化检测：检查标题是否有重复词汇\n- 张力曲线：如果本章张力分数与前几章相同，建议调整\n\n关注：全章都是对话无描写、全章都是战斗无喘息、过渡段落过长。',
  },
  {
    id: 'style',
    name: '文风检查',
    severity: 'warning',
    weight: 5,
    description: '是否偏离项目文风',
    checkInstruction: '检查文风是否与项目设定一致。关注：突然使用不符合风格的词汇、叙述视角跳转、语体不一致。',
  },
  {
    id: 'info-leak',
    name: '信息越界',
    severity: 'critical',
    weight: 9,
    description: '是否泄露未来信息',
    checkInstruction: '检查正文是否包含角色不可能知道的信息。关注：角色预知未来事件、叙述者泄露后续剧情、角色获知未被传递的情报。',
  },
  {
    id: 'word-fatigue',
    name: '词汇疲劳',
    severity: 'info',
    weight: 3,
    description: '高频词/标记词密度',
    checkInstruction: '检查是否有过度重复的词汇或句式。关注：同一形容词在3段内重复3次以上、句式结构高度雷同。',
  },
  {
    id: 'sidekick-dumb',
    name: '配角降智',
    severity: 'warning',
    weight: 5,
    description: '配角行为是否合理',
    checkInstruction: '检查配角是否被降智以突显主角。\n\n对每个配角的可疑行为执行三连问：\n1. 为什么这么做？——行为是否有合理动机？\n2. 符合人设吗？——与其已建立的性格、能力、背景是否一致？\n3. 读者觉得突兀吗？——普通读者是否会觉得这个行为不合理？\n\n关注：专业人士犯低级错误、反派无理由轻敌、配角突然失去已展示的能力。',
  },
  {
    id: 'cliche',
    name: '套话密度',
    severity: 'info',
    weight: 3,
    description: 'AI标记词/套话密度',
    checkInstruction: '检查AI生成常见的标记词和套话。关注："仿佛"、"不禁"、"宛如"、"竟然"、"忽然"、"猛地"等词的密度。',
  },
  {
    id: 'paragraph-length',
    name: '段落等长',
    severity: 'info',
    weight: 2,
    description: '段落长度是否均匀',
    checkInstruction: '检查段落长度是否有变化。关注：连续5个以上段落长度几乎相同（±10字）。',
  },
  {
    id: 'pov',
    name: '视角一致性',
    severity: 'warning',
    weight: 6,
    description: 'POV是否一致',
    checkInstruction: '检查叙述视角是否一致。关注：第一人称突然跳到第三人称、限制视角突然出现角色不可能知道的信息。',
  },
  {
    id: 'memo-deviation',
    name: '章节备忘偏离',
    severity: 'critical',
    weight: 8,
    description: '是否偏离ChapterMemo',
    checkInstruction: '检查正文是否遵循了章节备忘录中的计划。\n\n逐段对照memo的7个部分：\n1. 本章目标（goal）：正文是否推进了这个目标？\n2. 必须保留元素（mustKeep）：这些元素是否都出现了？\n3. 绝对不要做（mustNot）：是否有违规行为？\n4. 情绪基调（emotionalTone）：正文情绪是否匹配？\n5. 关键事件（keyEvents）：这些事件是否被执行？\n6. 伏笔操作（hookOperations）：计划的埋设/推进/回收是否完成？\n7. 角色出场（characterAppearances）：计划中的角色是否出场？\n\n关注：memo中"必须保留"的元素是否出现、"绝对不要做"的事情是否发生。',
  },
  {
    id: 'desire-drive',
    name: '爽点虚化',
    severity: 'warning',
    weight: 5,
    description: '欲望驱动是否到位',
    checkInstruction: '检查本章是否满足了读者的欲望驱动预期。具体检查：\n1. 是否有欲望缺口被制造出来（主角面临困境/被低估/被欺压）？\n2. 缺口是否有释放预期（读者期待看到翻盘/逆袭/扬眉吐气）？\n3. 释放是否超过预期（翻盘方式是否有新意，而非千篇一律）？\n4. 如果是过渡章节，是否至少有小爽点（如小打脸、小发现、小推进）？\n如果连续3章以上没有欲望缺口或释放，标记为"爽点虚化"。',
  },
  {
    id: 'format',
    name: '格式违规',
    severity: 'critical',
    weight: 7,
    description: '章节格式是否规范',
    checkInstruction: '检查章节格式。关注：是否有未闭合的引号、异常的换行、错乱的标点、重复的段落。',
  },
  {
    id: 'dialogue',
    name: '对话质量',
    severity: 'warning',
    weight: 6,
    description: '对话质量是否达标',
    checkInstruction: '检查对话质量。\n\n【确定性诊断数据】如果上下文中包含对话质量分析结果，请参考以下数据：\n- 对话比例：balanced(20%-60%)为正常，dialogue_heavy(>60%)为对话过多，narration_heavy(<20%)为叙述过多\n- 重复对话标签：同一标签在同一章出现超过5次为重复\n- 连续对话行数：超过6行无叙述间隔为过多\n- 角色对话占比：单个角色对话超过60%可能失衡\n\n关注：对话与叙述比例失衡、对话标签重复单调、连续对话缺少动作描写、角色话语权分配不均。',
  },
]

/**
 * 根据题材获取对应的审计维度
 * 优先使用题材Profile的自定义维度，如果没有匹配的题材则使用默认维度
 * @param genre 题材字符串（如 '玄幻', 'xuanhuan'）
 * @returns AuditDimension[]
 */
export function getGenreAuditDimensions(genre?: string): AuditDimension[] {
  if (!genre) {
    return AUDIT_DIMENSIONS
  }

  // 尝试将中文题材名匹配为ID，或直接使用ID
  const genreId = matchGenreFromText(genre) || genre.toLowerCase().trim()
  const profile = getGenreProfile(genreId)

  if (!profile || !profile.auditDimensions || profile.auditDimensions.length === 0) {
    return AUDIT_DIMENSIONS
  }

  // 将题材审计维度映射为标准 AuditDimension 格式
  return profile.auditDimensions.map((gd: GenreAuditDimension): AuditDimension => ({
    id: gd.id,
    name: gd.name,
    severity: gd.severity,
    weight: gd.weight,
    description: gd.name, // 使用 name 作为 description 的默认值
    checkInstruction: gd.checkInstruction,
  }))
}

// ============================================================================
// Prompt 构建
// ============================================================================

function buildAuditSystemPrompt(dimensions?: AuditDimension[]): string {
  const dims = dimensions || AUDIT_DIMENSIONS
  const dimensionList = dims.map((d, i) =>
    `${i + 1}. ${d.name}（${d.severity}级，权重${d.weight}）— ${d.description}\n   检查指引：${d.checkInstruction}`
  ).join('\n\n')

  return `你是一位专业的网络小说质量审计员。请对以下章节进行多维度质量审计。

## 审计维度清单
${dimensionList}

## 评分体系
- 总分 0-100 整数
- 90-100：优秀  85-89：良好  70-84：需修订  <70：严重问题
- 通过条件：score >= 85 且无 critical 级别问题

## 输出格式
严格返回 JSON（不要输出其他内容）：
{
  "overallScore": 0-100,
  "passed": true/false,
  "issues": [
    {
      "severity": "critical|warning|info",
      "category": "维度名称",
      "description": "具体问题描述",
      "suggestion": "修复建议"
    }
  ],
  "summary": "一句话审计总结",
  "dimensionScores": {
    "ooc": 0-100,
    "timeline": 0-100,
    "lore": 0-100,
    "pacing": 0-100,
    "style": 0-100,
    "hooks": 0-100,
    "memo": 0-100,
    "desire-drive": 0-100
  }
}`
}

function buildAuditUserPrompt(
  chapterContent: string,
  contextPackage?: ContextPackage,
  ruleStack?: RuleStack,
  memo?: ChapterMemo,
  hookDiagnosticsText?: string,
  cadenceText?: string,
  dialogueText?: string,
): string {
  const parts: string[] = []

  if (contextPackage) {
    if (contextPackage.storyBible) {
      parts.push(`## 项目设定\n${contextPackage.storyBible.slice(0, 3000)}`)
    }
    if (contextPackage.currentState) {
      parts.push(`## 当前状态\n${contextPackage.currentState.slice(0, 2000)}`)
    }
    if (contextPackage.hookSnapshot) {
      parts.push(`## 伏笔池\n${contextPackage.hookSnapshot.slice(0, 2000)}`)
    }
    if (contextPackage.characterMatrix) {
      parts.push(`## 角色矩阵\n${contextPackage.characterMatrix.slice(0, 2000)}`)
    }
  }

  // 注入伏笔健康确定性诊断数据
  if (hookDiagnosticsText) {
    parts.push(`## 伏笔健康诊断（确定性分析）\n${hookDiagnosticsText}`)
  }

  // 注入节奏分析确定性诊断数据
  if (cadenceText) {
    parts.push(`## 节奏分析结果（确定性分析）\n${cadenceText}`)
  }

  // 注入对话质量确定性诊断数据
  if (dialogueText) {
    parts.push(`## 对话质量分析结果（确定性分析）\n${dialogueText}`)
  }

  if (ruleStack) {
    const rules: string[] = []
    if (ruleStack.prohibitions.length > 0) {
      rules.push('禁止事项：\n' + ruleStack.prohibitions.map(r => `- ${r}`).join('\n'))
    }
    if (ruleStack.styleGuide) {
      rules.push(`文风指南：${ruleStack.styleGuide}`)
    }
    if (rules.length > 0) {
      parts.push(`## 规则约束\n${rules.join('\n\n')}`)
    }
  }

  if (memo) {
    parts.push(`## 章节备忘
- 目标：${memo.goal}
- 当前任务：${memo.currentTasks}
- 必须保留：${memo.payoffOrHold}
- 绝对不要：${memo.hardDonts}
- 章尾变化：${memo.chapterEndChanges}`)
  }

  parts.push(`## 待审计正文\n${chapterContent}`)

  return parts.join('\n\n')
}

// ============================================================================
// 确定性辅助审计（不依赖LLM）
// ============================================================================

// AI 标记词
const AI_TELL_WORDS = ['仿佛', '不禁', '宛如', '竟然', '忽然', '猛地', '一下子', '顿时', '刹那间', '犹如']

function runDeterministicChecks(content: string): AuditIssue[] {
  const issues: AuditIssue[] = []
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim())
  const sentences = content.split(/[。！？；\n]+/).filter(s => s.trim().length > 0)

  // ---- 维度: cliche（套话密度）— AI 标记词密度检测 ----
  const tellCounts: Record<string, number> = {}
  for (const word of AI_TELL_WORDS) {
    const count = (content.match(new RegExp(word, 'g')) || []).length
    if (count > 0) tellCounts[word] = count
  }
  const totalTells = Object.values(tellCounts).reduce((a, b) => a + b, 0)
  const tellDensity = totalTells / Math.max(1, content.length / 1000)
  if (tellDensity > 5) {
    issues.push({
      severity: 'info',
      category: '套话密度',
      description: `AI标记词密度偏高（${tellDensity.toFixed(1)}次/千字）。高频词：${Object.entries(tellCounts).map(([w, c]) => `${w}(${c})`).join('、')}`,
      suggestion: '替换为更具体的描写，减少模板化表达',
    })
  }

  // ---- 维度: paragraph-length（段落等长）— 段落长度均匀度检测 ----
  if (paragraphs.length >= 5) {
    const lengths = paragraphs.map(p => p.length)
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
    const uniformCount = lengths.filter(l => Math.abs(l - avg) < avg * 0.1).length
    if (uniformCount > lengths.length * 0.7) {
      issues.push({
        severity: 'info',
        category: '段落等长',
        description: `${uniformCount}/${paragraphs.length} 个段落长度接近（平均${Math.round(avg)}字），缺乏节奏变化`,
        suggestion: '交替使用长短段落，营造阅读节奏',
      })
    }
  }

  // ---- 维度: word-fatigue（词汇疲劳）— 高频词重复检测 ----
  const allWords = content.match(/[\u4e00-\u9fa5]{2,}/g) || []
  const wordFreq: Record<string, number> = {}
  for (const w of allWords) {
    wordFreq[w] = (wordFreq[w] || 0) + 1
  }
  const totalWordCount = allWords.length
  const repetitiveWords = Object.entries(wordFreq)
    .filter(([w, count]) => count >= 5 && count / totalWordCount > 0.01 && w.length >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  if (repetitiveWords.length > 0) {
    issues.push({
      severity: 'info',
      category: '词汇疲劳',
      description: `高频词过多：${repetitiveWords.map(([w, c]) => `${w}(${c}次)`).join('、')}，全文${totalWordCount}字`,
      suggestion: '替换同义词或调整句式，降低词汇重复率',
    })
  }

  // ---- 维度: pacing（节奏检查）— 连续段落类型单一检测 ----
  if (paragraphs.length >= 6) {
    const dialogPattern = /[""「」『』]/
    const paraTypes = paragraphs.map(p => dialogPattern.test(p) ? 'dialog' : 'narrative')
    let maxConsecutive = 1
    let currentConsecutive = 1
    for (let i = 1; i < paraTypes.length; i++) {
      if (paraTypes[i] === paraTypes[i - 1]) {
        currentConsecutive++
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive)
      } else {
        currentConsecutive = 1
      }
    }
    if (maxConsecutive >= 6) {
      const _dominatedType = maxConsecutive === paraTypes.filter((_, i, arr) => i > 0 && arr[i] === arr[i - 1]).length + 1
      issues.push({
        severity: 'warning',
        category: '节奏检查',
        description: `连续${maxConsecutive}个段落类型相同（${paraTypes[0] === 'dialog' ? '纯对话' : '纯叙述'}），节奏单调`,
        suggestion: '在对话和叙述之间交替，穿插环境描写和心理活动',
      })
    }
  }

  // ---- 维度: format（格式违规）— 基本格式检查 ----
  // 检测未闭合的引号
  const openQuotes = (content.match(/[""]/g) || []).length
  if (openQuotes % 2 !== 0) {
    issues.push({
      severity: 'warning',
      category: '格式违规',
      description: `检测到引号数量不匹配（共${openQuotes}个），可能存在未闭合的引号`,
      suggestion: '检查并修复未闭合的引号',
    })
  }

  // 检测连续重复段落
  if (paragraphs.length >= 2) {
    for (let i = 1; i < paragraphs.length; i++) {
      const prev = paragraphs[i - 1]!.trim()
      const curr = paragraphs[i]!.trim()
      if (prev.length > 20 && prev === curr) {
        issues.push({
          severity: 'warning',
          category: '格式违规',
          description: `第${i}段与第${i + 1}段内容完全重复（${prev.length}字）`,
          suggestion: '删除重复段落',
        })
        break // 只报告一次
      }
    }
  }

  // ---- 维度: pov（视角一致性）— 人称跳转检测 ----
  const firstPersonMarkers = content.match(/(?<![a-zA-Z])(?:我|我们|咱|咱们)(?![a-zA-Z])/g) || []
  const thirdPersonMarkers = content.match(/(?<![a-zA-Z])(?:他|她|他们|她们)(?![a-zA-Z])/g) || []
  const firstPersonCount = firstPersonMarkers.length
  const thirdPersonCount = thirdPersonMarkers.length
  // 如果同时大量使用第一和第三人称，可能存在视角跳转
  if (firstPersonCount > 10 && thirdPersonCount > 10) {
    const ratio = Math.min(firstPersonCount, thirdPersonCount) / Math.max(firstPersonCount, thirdPersonCount)
    if (ratio > 0.5) {
      issues.push({
        severity: 'info',
        category: '视角一致性',
        description: `第一人称(${firstPersonCount}次)与第三人称(${thirdPersonCount}次)混用比例接近，可能存在视角跳转`,
        suggestion: '统一叙述视角，避免在同一章节内频繁切换人称',
      })
    }
  }

  // ---- 维度: style（文风检查）— 句式结构单一检测 ----
  if (sentences.length >= 10) {
    // 检测大量句子以相同模式开头
    const starters: Record<string, number> = {}
    for (const s of sentences) {
      const trimmed = s.trim()
      if (trimmed.length >= 2) {
        const starter = trimmed.slice(0, 2)
        starters[starter] = (starters[starter] || 0) + 1
      }
    }
    const dominantStarters = Object.entries(starters)
      .filter(([, count]) => count >= 5 && count / sentences.length > 0.15)
    if (dominantStarters.length > 0) {
      issues.push({
        severity: 'info',
        category: '文风检查',
        description: `句式开头重复：${dominantStarters.map(([s, c]) => `"${s}…"` + `(${c}次)`).join('、')}，共${sentences.length}句`,
        suggestion: '变化句式开头，增加倒装、感叹、省略等多样化表达',
      })
    }
  }

  // ---- 维度: numbers（数值检查）— 常见数值矛盾快检 ----
  const numberPattern = /(\d+)\s*(岁|年|月|天|日|米|公里|里|步|层|重|斤|两)/g
  const numbers: Array<{ value: number; unit: string; position: number }> = []
  let numMatch: RegExpExecArray | null
  while ((numMatch = numberPattern.exec(content)) !== null) {
    numbers.push({ value: parseInt(numMatch[1]!), unit: numMatch[2]!, position: numMatch.index })
  }
  // 同一单位出现矛盾数值（如 "30岁" 和 "18岁" 指同一上下文）
  const unitGroups: Record<string, Array<{ value: number; position: number }>> = {}
  for (const n of numbers) {
    if (!unitGroups[n.unit]) unitGroups[n.unit] = []
    unitGroups[n.unit]!.push({ value: n.value, position: n.position })
  }
  for (const [unit, values] of Object.entries(unitGroups)) {
    if (values.length >= 2) {
      const distinct = [...new Set(values.map(v => v.value))]
      if (distinct.length >= 2) {
        // 数值跨度超过3倍才报告（避免正常范围内的合理差异）
        const maxVal = Math.max(...distinct)
        const minVal = Math.min(...distinct)
        if (maxVal > minVal * 3 && maxVal - minVal > 10) {
          issues.push({
            severity: 'info',
            category: '数值检查',
            description: `同单位"${unit}"出现差异较大的数值：${distinct.join('、')}，可能存在矛盾`,
            suggestion: '检查数值前后是否一致',
          })
        }
      }
    }
  }

  return issues
}

// ============================================================================
// ContinuityAuditor 主类
// ============================================================================

export class ContinuityAuditor {
  private aiStore: any = null
  private passScoreThreshold: number
  private genre: string | undefined

  constructor(options?: { passScoreThreshold?: number; genre?: string }) {
    this.passScoreThreshold = options?.passScoreThreshold ?? 85
    this.genre = options?.genre
  }

  private async getAIStore() {
    if (!this.aiStore) {
      const { useAIStore } = await import('@/stores/ai')
      this.aiStore = useAIStore()
    }
    return this.aiStore
  }

  /**
   * 执行审计
   */
  async audit(input: AuditChapterInput): Promise<AuditResult> {
    const startTime = performance.now()
    logger.info(`[Auditor] 开始审计第${input.chapterNumber}章`)

    const emptyUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    // 1. 确定性辅助审计
    const deterministicIssues = runDeterministicChecks(input.chapterContent)
    logger.info(`[Auditor] 确定性检查发现 ${deterministicIssues.length} 个问题`)

    // 1.5 伏笔健康确定性诊断
    const hookDiagnosticsText = this.buildHookDiagnosticsText(input)
    if (hookDiagnosticsText) {
      logger.info('[Auditor] 已生成伏笔健康诊断数据')
    }

    // 1.6 节奏分析确定性诊断
    const cadenceText = this.buildCadenceText(input)
    if (cadenceText) {
      logger.info('[Auditor] 已生成节奏分析诊断数据')
    }

    // 1.65 对话质量确定性诊断
    const { dialogueText, dialogueIssues } = this.buildDialogueAnalysis(input)
    if (dialogueText) {
      logger.info('[Auditor] 已生成对话质量诊断数据')
    }
    if (dialogueIssues.length > 0) {
      deterministicIssues.push(...dialogueIssues)
      logger.info(`[Auditor] 对话质量检查发现 ${dialogueIssues.length} 个问题`)
    }

    // 1.7 伏笔账本校验（Hook Ledger Validator）
    if (input.memo) {
      try {
        const ledgerResult = validateHookLedger(
          input.chapterContent,
          input.memo,
          input.hooks as HookEntry[] | undefined,
        )
        deterministicIssues.push(...ledgerResult.issues)
        if (ledgerResult.missedCount > 0) {
          logger.warn(`[Auditor] 伏笔账本校验: ${ledgerResult.missedCount} 个承诺操作未执行`)
        }
      } catch (err) {
        logger.warn('[Auditor] 伏笔账本校验失败（不阻断审计）:', err)
      }
    }

    // 2. LLM 审计
    let llmResult: Omit<AuditResult, 'tokenUsage'> | null = null
    try {
      const aiStore = await this.getAIStore()
      if (!aiStore.checkInitialized()) {
        logger.warn('[Auditor] AI未初始化，仅返回确定性检查结果')
        return this.buildFallbackResult(input.chapterContent, deterministicIssues, emptyUsage)
      }

      const genreDimensions = getGenreAuditDimensions(this.genre)
      const systemPrompt = buildAuditSystemPrompt(genreDimensions)
      const userPrompt = buildAuditUserPrompt(
        input.chapterContent,
        input.contextPackage,
        input.ruleStack,
        input.memo,
        hookDiagnosticsText,
        cadenceText,
        dialogueText,
      )

      const response: ChatResponse = await withRetry(
        () => aiStore.chat(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          {
            type: 'check',
            complexity: 'medium',
            priority: 'quality',
          },
          { maxTokens: 4000 }
        ),
        'Auditor',
        AUDITOR_RETRY_CONFIG,
      )

      const parsed = safeParseAIJson<{
        overallScore: number
        passed: boolean
        issues: AuditIssue[]
        summary: string
        dimensionScores: Record<string, number>
      }>(response.content)

      if (parsed && typeof parsed.overallScore === 'number') {
        // 确保所有 16 个维度都有评分
        const dimensionScores = this.ensureAllDimensionScores(parsed.dimensionScores || {}, parsed.issues || [])

        llmResult = {
          passed: parsed.passed ?? parsed.overallScore >= this.passScoreThreshold,
          overallScore: Math.max(0, Math.min(100, Math.round(parsed.overallScore))),
          issues: Array.isArray(parsed.issues) ? parsed.issues : [],
          summary: parsed.summary || '审计完成',
          dimensionScores,
        }
      }

      const tokenUsage: TokenUsage = {
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
        totalTokens: response.usage?.totalTokens || 0,
      }

      if (llmResult) {
        // 合并确定性检查结果
        const allIssues = [...llmResult.issues, ...deterministicIssues]
        const hasCritical = allIssues.some(i => i.severity === 'critical')
        const passed = llmResult.overallScore >= this.passScoreThreshold && !hasCritical

        const elapsed = Math.round(performance.now() - startTime)
        logger.info(`[Auditor] 审计完成，评分 ${llmResult.overallScore}，${passed ? '通过' : '未通过'}，耗时 ${elapsed}ms`)

        return {
          passed,
          overallScore: llmResult.overallScore,
          issues: allIssues,
          summary: llmResult.summary,
          dimensionScores: llmResult.dimensionScores,
          tokenUsage,
        }
      }
    } catch (error) {
      logger.error('[Auditor] LLM审计调用失败:', error)
    }

    // 3. 降级：仅确定性检查
    return this.buildFallbackResult(input.chapterContent, deterministicIssues, emptyUsage)
  }

  /**
   * 降级结果（仅确定性检查）
   */
  private buildFallbackResult(content: string, issues: AuditIssue[], tokenUsage: TokenUsage): AuditResult {
    const hasCritical = issues.some(i => i.severity === 'critical')
    const score = hasCritical ? 50 : 75

    // 为降级结果也生成完整维度评分
    const dimensionScores = this.ensureAllDimensionScores({}, issues)

    return {
      passed: score >= this.passScoreThreshold && !hasCritical,
      overallScore: score,
      issues,
      summary: '仅执行确定性检查（LLM不可用）',
      dimensionScores,
      tokenUsage,
    }
  }

  /**
   * 确保所有 16 个审计维度都有评分输出
   * 如果 LLM 未返回某些维度的评分，根据相关 issue 推断
   */
  private ensureAllDimensionScores(
    scores: Record<string, number>,
    issues: AuditIssue[],
  ): Record<string, number> {
    const result: Record<string, number> = { ...scores }
    const categoryDimensionMap: Record<string, string> = {
      'OOC检查': 'ooc',
      'OOC': 'ooc',
      '角色一致性': 'ooc',
      '时间线检查': 'timeline',
      '时间线': 'timeline',
      '设定冲突': 'lore',
      '世界观': 'lore',
      '战力崩坏': 'power',
      '力量体系': 'power',
      '数值检查': 'numbers',
      '数值': 'numbers',
      '伏笔检查': 'hooks',
      '伏笔': 'hooks',
      '节奏检查': 'pacing',
      '节奏': 'pacing',
      '文风检查': 'style',
      '文风': 'style',
      '信息越界': 'info-leak',
      '信息泄露': 'info-leak',
      '词汇疲劳': 'word-fatigue',
      '配角降智': 'sidekick-dumb',
      '套话密度': 'cliche',
      '段落等长': 'paragraph-length',
      '视角一致性': 'pov',
      '视角': 'pov',
      '章节备忘偏离': 'memo-deviation',
      'Memo偏离': 'memo-deviation',
      '格式违规': 'format',
      '格式': 'format',
      '爽点虚化': 'desire-drive',
      '欲望驱动': 'desire-drive',
      '对话质量': 'dialogue',
      '对话': 'dialogue',
    }

    // 将 issue 按维度分组
    const issuesByDimension: Record<string, AuditIssue[]> = {}
    for (const issue of issues) {
      const dimId = categoryDimensionMap[issue.category] || issue.category
      if (!issuesByDimension[dimId]) issuesByDimension[dimId] = []
      issuesByDimension[dimId].push(issue)
    }

    // 为缺失评分的维度推断分数
    for (const dim of AUDIT_DIMENSIONS) {
      if (result[dim.id] === undefined || result[dim.id] === null) {
        const dimIssues = issuesByDimension[dim.id] || []
        const criticalCount = dimIssues.filter(i => i.severity === 'critical').length
        const warningCount = dimIssues.filter(i => i.severity === 'warning').length
        const infoCount = dimIssues.filter(i => i.severity === 'info').length

        if (criticalCount === 0 && warningCount === 0 && infoCount === 0) {
          result[dim.id] = 90  // 无问题，默认高分
        } else if (criticalCount >= 2) {
          result[dim.id] = 30
        } else if (criticalCount === 1) {
          result[dim.id] = 50
        } else {
          let score = 90
          score -= warningCount * 10
          score -= infoCount * 3
          result[dim.id] = Math.max(40, score)
        }
      }
    }

    return result
  }

  /**
   * 构建伏笔健康确定性诊断文本，供 LLM 审计参考
   */
  private buildHookDiagnosticsText(input: AuditChapterInput): string | undefined {
    if (!input.hooks || input.hooks.length === 0) return undefined

    try {
      const hookInputs: HookHealthInput[] = input.hooks.map(h => ({
        hookId: h.id,
        content: h.content,
        status: h.status,
        startChapter: h.chapterNumber,
        lastAdvancedChapter: h.lastAdvancedChapter || h.chapterNumber,
        advanceCount: h.advanceCount || 0,
        payoffTiming: h.payoffTiming,
        dependsOn: h.dependsOn,
        coreHook: h.coreHook,
      }))

      const result: HookHealthResult = analyzeHookHealth({
        hooks: hookInputs,
        currentChapter: input.chapterNumber,
      })

      const { stats } = result
      const lines: string[] = [
        `- 健康评分：${stats.healthScore}/100${stats.healthScore < 60 ? ' ⚠️ 低于60分，需要重点关注' : ''}`,
        `- 活跃伏笔数：${stats.activeCount}${stats.activeCount > 15 ? ' ⚠️ 超过15个，建议控制' : ''}`,
        `- 过期(stale)伏笔：${stats.staleCount}${stats.staleCount > 0 ? ' 个，需要在本章推进' : ' 个 ✓'}`,
        `- 阻塞(blocked)伏笔：${stats.blockedCount}${stats.blockedCount > 0 ? ' 个，需要先解决上游依赖' : ' 个 ✓'}`,
        `- 可回收伏笔：${stats.readyToResolveCount} 个`,
        `- 已逾期伏笔：${stats.overdueCount}${stats.overdueCount > 0 ? ' 个 ⚠️ 严重超期' : ' 个 ✓'}`,
      ]

      // 列出压力最高的伏笔
      const sortedDiags = [...result.diagnostics.values()]
        .sort((a, b) => (b.advancePressure + b.resolvePressure) - (a.advancePressure + a.resolvePressure))
        .slice(0, 5)

      if (sortedDiags.length > 0) {
        lines.push('')
        lines.push('压力最高的伏笔（优先推进）：')
        for (const diag of sortedDiags) {
          const hook = input.hooks.find(h => h.id === diag.hookId)
          const totalPressure = diag.advancePressure + diag.resolvePressure
          if (totalPressure <= 0) continue
          const tags: string[] = []
          if (diag.stale) tags.push('stale')
          if (diag.blocked) tags.push('blocked')
          if (diag.overdue) tags.push('overdue')
          if (diag.readyToResolve) tags.push('readyToResolve')
          lines.push(`  - 「${(hook?.content || '').slice(0, 30)}」压力=${totalPressure}，${tags.length > 0 ? tags.join('+') : '正常'}，距今${diag.distance}章/半衰期${diag.halfLife}`)
        }
      }

      return lines.join('\n')
    } catch (err) {
      logger.warn('[Auditor] 伏笔健康诊断计算失败:', err)
      return undefined
    }
  }

  /**
   * 构建节奏分析确定性诊断文本，供 LLM 审计参考
   */
  private buildCadenceText(input: AuditChapterInput): string | undefined {
    if (!input.chapters || input.chapters.length < 3) return undefined

    try {
      const cadenceChapters: CadenceChapter[] = input.chapters.map(ch => ({
        number: ch.number,
        title: ch.title,
        contentPreview: ch.contentPreview,
      }))

      const result: CadenceResult = analyzeChapterCadence(cadenceChapters)

      const lines: string[] = []

      // 张力曲线（最近10章）
      const recentCurve = result.tensionCurve.slice(-10)
      if (recentCurve.length > 0) {
        lines.push(`- 最近${recentCurve.length}章张力曲线：${recentCurve.join(' → ')}`)
        const currentTension = recentCurve[recentCurve.length - 1]
        const avgTension = recentCurve.reduce((a, b) => a + b, 0) / recentCurve.length
        lines.push(`- 本章张力值：${currentTension}，近期平均：${avgTension.toFixed(1)}`)
      }

      // 当前章节类型
      const currentType = result.chapterTypes.get(input.chapterNumber)
      if (currentType) {
        lines.push(`- 本章场景类型：${currentType}`)
      }

      // 告警
      if (result.warnings.length > 0) {
        lines.push('')
        lines.push('节奏告警：')
        for (const w of result.warnings) {
          const icon = w.severity === 'warning' ? '⚠️' : 'ℹ️'
          lines.push(`  ${icon} ${w.message}（影响章节：${w.affectedChapters.join(', ')}）`)
        }
      } else {
        lines.push('- 节奏告警：无 ✓')
      }

      return lines.join('\n')
    } catch (err) {
      logger.warn('[Auditor] 节奏分析计算失败:', err)
      return undefined
    }
  }

  /**
   * 构建对话质量确定性诊断文本及问题列表
   * @returns 包含诊断文本和 AuditIssue 数组的对象
   */
  private buildDialogueAnalysis(input: AuditChapterInput): { dialogueText: string | undefined; dialogueIssues: AuditIssue[] } {
    if (!input.chapterContent || input.chapterContent.length < 50) {
      return { dialogueText: undefined, dialogueIssues: [] }
    }

    try {
      const result = analyzeDialogue(input.chapterContent)

      // 将对话分析 issues 转换为 AuditIssue 格式
      const dialogueIssues: AuditIssue[] = result.issues.map(issue => ({
        severity: issue.severity,
        category: issue.category,
        description: issue.description,
        suggestion: issue.suggestion,
      }))

      // 构建诊断文本供 LLM 参考
      const lines: string[] = []

      // 对话比例
      const ratioPercent = (result.dialogueRatio * 100).toFixed(1)
      const ratioLabel = result.ratioAssessment === 'balanced'
        ? '正常'
        : result.ratioAssessment === 'dialogue_heavy'
          ? '对话过多'
          : '叙述过多'
      lines.push(`- 对话比例：${ratioPercent}%（${ratioLabel}，理想范围20%-60%）`)

      // 对话标签频率（取前5个）
      if (result.tagFrequency.length > 0) {
        const topTags = result.tagFrequency.slice(0, 5)
        lines.push(`- 高频对话标签：${topTags.map(t => `${t.tag}(${t.count}次)`).join('、')}`)
      }

      // 重复标签
      if (result.repeatedTags.length > 0) {
        lines.push(`- 重复标签警告：${result.repeatedTags.map(t => `"${t.tag}"出现${t.count}次（阈值5次）`).join('；')}`)
      } else {
        lines.push('- 重复标签：无 ✓')
      }

      // 连续对话
      if (result.maxConsecutiveDialogues > 6) {
        lines.push(`- 连续对话行数：${result.maxConsecutiveDialogues}行（阈值6行，建议插入叙述间隔）`)
      } else {
        lines.push(`- 连续对话行数：${result.maxConsecutiveDialogues}行 ✓`)
      }

      // 总分
      lines.push(`- 对话质量评分：${result.overallScore}/100`)

      return {
        dialogueText: lines.join('\n'),
        dialogueIssues,
      }
    } catch (err) {
      logger.warn('[Auditor] 对话质量分析计算失败:', err)
      return { dialogueText: undefined, dialogueIssues: [] }
    }
  }
}
