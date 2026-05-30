import { BaseAgent } from './BaseAgent'
import { getLogger } from '@/utils/logger'
import type { AgentConfig, AgentContext, AgentRole, AgentResult, ReaderFeedback, PersonaFeedback, ReaderPersona } from './types'

const logger = getLogger('agent:reader')

/** 预设读者群体 */
const READER_PERSONAS: ReaderPersona[] = [
  {
    id: 'veteran',
    name: '资深网文读者',
    readingExperience: 'veteran',
    genreFamiliarity: 'core',
    focusAreas: ['伏笔回收', '逻辑自洽', '角色成长', '套路创新'],
    toleranceForTropes: 'low',
  },
  {
    id: 'newcomer',
    name: '新手读者',
    readingExperience: 'newcomer',
    genreFamiliarity: 'unfamiliar',
    focusAreas: ['代入感', '情节易懂性', '角色辨识度', '悬念吸引力'],
    toleranceForTropes: 'high',
  },
  {
    id: 'genre_fan',
    name: '题材核心受众',
    readingExperience: 'intermediate',
    genreFamiliarity: 'core',
    focusAreas: ['题材套路满足度', '升级爽感', 'CP互动', '名场面'],
    toleranceForTropes: 'medium',
  },
]

const PERSONA_PROFILE_MAP: Record<string, 'reader_veteran' | 'reader_newcomer' | 'reader_genre_fan'> = {
  veteran: 'reader_veteran',
  newcomer: 'reader_newcomer',
  genre_fan: 'reader_genre_fan',
}

export class ReaderAgent extends BaseAgent {
  readonly role: AgentRole = 'reader'

  protected async run(context: AgentContext, config: AgentConfig): Promise<Omit<AgentResult<ReaderFeedback[]>, 'role' | 'durationMs'>> {
    if (!context.project || !context.chapter?.content) {
      return { status: 'success', message: '缺少读者反馈输入', data: [] }
    }

    const { runReview } = await import('@/assistant/review/reviewRunner')
    const result = await runReview({
      profile: 'quality',
      project: context.project,
      chapter: context.chapter,
      model: config.model,
    })

    const feedback = result.suggestions.map(suggestion => ({
      title: suggestion.title,
      message: suggestion.message,
      paragraphIndex: suggestion.paragraphIndex,
    }))

    return {
      status: 'success',
      message: `读者反馈生成 ${feedback.length} 条建议`,
      data: feedback,
    }
  }

  /**
   * 多读者群体并行评估
   * 同时运行3种读者群体的评估，返回每群体的独立反馈
   */
  async runMultiPersonaReview(
    context: AgentContext,
    config: AgentConfig,
    personas?: ReaderPersona[]
  ): Promise<PersonaFeedback[]> {
    if (!context.project || !context.chapter?.content) {
      logger.warn('[ReaderAgent] 多读者群体评估缺少输入')
      return []
    }

    const targetPersonas = personas || READER_PERSONAS
    logger.info(`[ReaderAgent] 开始多读者群体评估: ${targetPersonas.map(p => p.name).join(', ')}`)

    const { runReview } = await import('@/assistant/review/reviewRunner')

    // 并行执行3种读者群体评估
    const results = await Promise.allSettled(
      targetPersonas.map(async (persona): Promise<PersonaFeedback> => {
        const profile = PERSONA_PROFILE_MAP[persona.id]
        if (!profile) {
          logger.warn(`[ReaderAgent] 未知读者群体: ${persona.id}`)
          return this.buildFallbackFeedback(persona)
        }

        try {
          const reviewResult = await runReview({
            profile,
            project: context.project!,
            chapter: context.chapter!,
            model: config.model,
          })

          return this.parsePersonaFeedback(persona, reviewResult.suggestions)
        } catch (error) {
          logger.error(`[ReaderAgent] ${persona.name}评估失败:`, error)
          return this.buildFallbackFeedback(persona)
        }
      })
    )

    const feedbacks: PersonaFeedback[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value
      }
      logger.error(`[ReaderAgent] ${targetPersonas[index].name}评估异常:`, result.reason)
      return this.buildFallbackFeedback(targetPersonas[index])
    })

    logger.info(`[ReaderAgent] 多读者群体评估完成: ${feedbacks.length} 个群体反馈`)
    return feedbacks
  }

  /**
   * 解析 reviewRunner 返回的建议为 PersonaFeedback
   */
  private parsePersonaFeedback(
    persona: ReaderPersona,
    suggestions: Array<{ title: string; message: string; paragraphIndex?: number }>
  ): PersonaFeedback {
    const highPriorityCount = suggestions.filter(s =>
      s.title.includes('严重') || s.title.includes('重大') || s.title.includes('关键')
    ).length

    let overallScore = 7
    overallScore -= highPriorityCount * 1.5
    overallScore -= Math.max(0, suggestions.length - 3) * 0.5
    overallScore = Math.max(1, Math.min(10, Math.round(overallScore)))

    let engagementLevel: PersonaFeedback['engagementLevel']
    if (overallScore >= 8) engagementLevel = 'hooked'
    else if (overallScore >= 6) engagementLevel = 'interested'
    else if (overallScore >= 4) engagementLevel = 'neutral'
    else engagementLevel = 'bored'

    let dropRisk: PersonaFeedback['dropRisk']
    if (engagementLevel === 'hooked') dropRisk = 'none'
    else if (engagementLevel === 'interested') dropRisk = 'low'
    else if (engagementLevel === 'neutral') dropRisk = 'medium'
    else dropRisk = 'high'

    const specificFeedback = persona.focusAreas.map(aspect => {
      const relatedSuggestion = suggestions.find(s =>
        s.title.includes(aspect) || s.message.includes(aspect)
      )
      return {
        aspect,
        score: relatedSuggestion ? Math.max(3, overallScore - 2) : overallScore,
        comment: relatedSuggestion?.message || '未发现明显问题',
      }
    })

    return {
      personaId: persona.id,
      personaName: persona.name,
      overallScore,
      engagementLevel,
      specificFeedback,
      dropRisk,
    }
  }

  private buildFallbackFeedback(persona: ReaderPersona): PersonaFeedback {
    return {
      personaId: persona.id,
      personaName: persona.name,
      overallScore: 5,
      engagementLevel: 'neutral',
      specificFeedback: persona.focusAreas.map(aspect => ({
        aspect,
        score: 5,
        comment: '评估未完成',
      })),
      dropRisk: 'medium',
    }
  }

  /** 获取预设读者群体列表 */
  static getPersonas(): ReaderPersona[] {
    return [...READER_PERSONAS]
  }
}
