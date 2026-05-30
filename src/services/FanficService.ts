/**
 * FanficService — 同人创作服务
 *
 * 支持4种同人模式：
 * - canon: 忠实原作设定和人物性格
 * - au (Alternate Universe): 原作角色放入不同世界观
 * - ooc (Out of Character): 角色性格大幅偏离原作
 * - cp (Couple Pairing): 以CP关系为核心
 */

import { getLogger } from '@/utils/logger'
import { AIError, ErrorCode } from '@/utils/errors'
import type { TokenUsage } from '@/services/pipeline/types'

const logger = getLogger('service:fanfic')

export type FanficMode = 'canon' | 'au' | 'ooc' | 'cp'

export interface FanficConfig {
  sourceMaterial: string           // 原作名称
  mode: FanficMode
  characters: string[]             // 主要角色列表
  cpPairing?: string               // CP配对（如"林夜x苏晴"）
  auDescription?: string           // AU模式的世界观描述
  theme?: string                   // 主题
  language: 'zh' | 'en'
}

export interface FanficProjectInit {
  title: string
  description: string
  genre: string
  systemPrompt: string             // 角色系统提示词
  worldRules: string[]             // 世界观规则
  characterProfiles: Array<{
    name: string
    sourceDescription: string      // 原作中的角色描述
    fanficGuidelines: string       // 同人创作中的角色指导
  }>
  writingConstraints: string[]     // 写作约束
}

// ============================================================================
// 模式指导规则
// ============================================================================

const MODE_GUIDELINES: Record<FanficMode, {
  systemPromptAddon: string
  rules: string[]
  prohibitions: string[]
}> = {
  canon: {
    systemPromptAddon: '你正在创作一篇忠实原作设定的同人小说。所有角色的性格、能力和行为必须与原作保持高度一致，世界观设定不得违背原作已确立的规则。',
    rules: [
      '保持角色性格一致，角色的言行举止必须符合原作中的性格特征和成长轨迹',
      '遵守原作世界观，不得引入原作中不存在的设定或规则',
      '角色之间的关系动态需与原作保持一致，包括情感、立场和互动模式',
      '故事时间线需合理，如设定在原作某一时段则不得出现矛盾',
      '对白风格需贴合角色原作中的说话方式和用语习惯',
      '新增情节需合理嵌入原作框架，不破坏已知剧情走向',
    ],
    prohibitions: [
      '禁止出现原作未设定的能力或技能',
      '禁止角色做出与性格严重不符的行为（除非有充分的剧情铺垫）',
      '禁止颠覆原作已确立的世界观规则',
      '禁止引入原作中不存在的种族或势力（除非原作有暗示空间）',
      '禁止角色突然拥有原作中未曾提及的过去或背景',
    ],
  },
  au: {
    systemPromptAddon: '你正在创作一篇AU（平行宇宙）同人小说。角色的核心性格特征需保留，但可以放入全新的世界观背景中。重点在于探索角色在不同环境下的可能性。',
    rules: [
      '角色核心性格保留，但允许因新环境产生合理的行为变化',
      '世界观可自由设定，但需内在逻辑自洽',
      '需保持角色之间的关系张力和化学反应',
      'AU设定需对角色产生实质性影响，而非仅是换个背景',
      '角色在新环境中的适应过程需自然真实',
      '需建立AU世界的基本规则并保持一致',
    ],
    prohibitions: [
      '禁止AU设定沦为纯粹的背景板，不对角色和剧情产生影响',
      '禁止完全抛弃角色的核心性格特征',
      '禁止世界观前后矛盾',
      '禁止简单套用原作剧情而仅更换场景',
      '禁止忽略AU设定对角色价值观和行为逻辑的影响',
    ],
  },
  ooc: {
    systemPromptAddon: '你正在创作一篇OOC（角色性格偏离）同人小说。角色性格可以大幅偏离原作设定，但仍需保留角色名称和基本关系框架。重点在于自由的角色探索。',
    rules: [
      '角色性格可自由发挥，但需保持内在逻辑一致',
      '保留角色名称和基本人际关系框架',
      '剧情走向不受原作限制，可自由创造新故事',
      '性格偏离需有合理的故事内逻辑，不可无理由突变',
      'OOC程度需在全文中保持一致，不可忽左忽右',
      '如保留原作某些性格特征，需明确是哪些特征并保持一致',
    ],
    prohibitions: [
      '禁止角色变成完全不同的原创角色（失去了同人的识别性）',
      '禁止性格偏离在文中毫无逻辑地反复变化',
      '禁止完全忽略角色之间原作中的关系基础',
      '禁止将OOC作为偷懒的借口，写出没有深度的扁平角色',
      '禁止无视故事内部逻辑，认为OOC就可以随意发展',
    ],
  },
  cp: {
    systemPromptAddon: '你正在创作一篇以CP关系为核心的同人小说。感情线是主要叙事驱动力，所有配角和情节都服务于CP关系的发展和深化。',
    rules: [
      'CP关系为核心驱动力，感情发展是叙事主线',
      '感情线为主要叙事线，需有完整的萌芽、发展、冲突、和解弧线',
      '配角服务于CP关系发展，可作为催化剂、阻碍者或见证者',
      '情感描写需细腻真实，避免突兀的感情跳跃',
      'CP双方都需有独立的角色弧线，不可一方完全依附另一方',
      '冲突来源需围绕CP关系的核心张力展开',
    ],
    prohibitions: [
      '禁止将CP关系简化为单纯的肉体吸引',
      '禁止使用无意义的误会作为感情冲突的主要来源',
      '禁止一方角色完全丧失自我，成为另一方的附属品',
      '禁止感情发展缺乏过渡，突然从敌对跳到相爱',
      '禁止配角完全沦为CP工具人，缺乏自身存在的意义',
      '禁止忽略感情关系中的权力动态和相互成长',
    ],
  },
}

// ============================================================================
// FanficService
// ============================================================================

export class FanficService {
  private aiStore: any = null

  private async getAIStore() {
    if (!this.aiStore) {
      try {
        const { useAIStore } = await import('@/stores/ai')
        this.aiStore = useAIStore()
      } catch (error) {
        logger.error('获取AI Store失败:', error)
        throw new AIError('AI服务不可用，请检查配置', { code: ErrorCode.AI_NOT_INITIALIZED })
      }
    }
    return this.aiStore
  }

  /**
   * 初始化同人项目
   * 根据原作信息和模式生成项目配置
   */
  async initFanficProject(config: FanficConfig): Promise<FanficProjectInit> {
    logger.info('开始初始化同人项目:', {
      sourceMaterial: config.sourceMaterial,
      mode: config.mode,
      characterCount: config.characters.length,
    })

    // 1. 获取模式指导
    const modeGuidelines = this.getModeGuidelines(config.mode)

    // 2. 生成角色设定卡
    logger.info('正在生成角色设定卡...')
    const characterProfiles = await this.generateCharacterProfiles(
      config.sourceMaterial,
      config.characters,
      config.mode
    )

    // 3. 构建世界观规则
    const worldRules = this.buildWorldRules(config)

    // 4. 构建系统提示词
    const systemPrompt = this.buildSystemPrompt(config, modeGuidelines)

    // 5. 构建写作约束
    const writingConstraints = this.buildWritingConstraints(config, modeGuidelines)

    // 6. 生成项目标题和描述
    const title = this.generateProjectTitle(config)
    const description = this.generateProjectDescription(config)

    const projectInit: FanficProjectInit = {
      title,
      description,
      genre: `fanfic-${config.mode}`,
      systemPrompt,
      worldRules,
      characterProfiles,
      writingConstraints,
    }

    logger.info('同人项目初始化完成:', { title, genre: projectInit.genre })
    return projectInit
  }

  /**
   * 获取模式特定的创作指导
   */
  getModeGuidelines(mode: FanficMode): {
    systemPromptAddon: string
    rules: string[]
    prohibitions: string[]
  } {
    const guidelines = MODE_GUIDELINES[mode]
    if (!guidelines) {
      logger.warn('未知的同人模式:', mode)
      return MODE_GUIDELINES.canon
    }
    return guidelines
  }

  /**
   * 生成角色设定卡
   */
  async generateCharacterProfiles(
    sourceMaterial: string,
    characters: string[],
    mode: FanficMode
  ): Promise<FanficProjectInit['characterProfiles']> {
    logger.info('开始生成角色设定卡:', { sourceMaterial, characters, mode })

    try {
      const aiStore = await this.getAIStore()

      const modeContext = this.getModeGuidelines(mode)
      const characterList = characters.join('、')

      const prompt = `你是一位专业的同人小说角色设定师。请为以下同人创作项目生成角色设定卡。

原作：《${sourceMaterial}》
同人模式：${mode}
主要角色：${characterList}

模式指导：
${modeContext.systemPromptAddon}

请为每个角色生成以下信息（以JSON数组格式返回）：
[
  {
    "name": "角色名",
    "sourceDescription": "该角色在原作中的性格特征、能力、背景、人际关系等描述（100-200字）",
    "fanficGuidelines": "在本篇同人创作中该角色的创作指导，包括性格定位、行为约束、关系处理等（100-200字）"
  }
]

要求：
1. sourceDescription必须基于对原作角色的理解，准确描述角色核心特质
2. fanficGuidelines必须结合当前同人模式（${mode}），给出具体的创作指导
3. 每个角色设定需有独特性，不可千篇一律
4. 确保角色之间的关系描述相互一致`

      const response = await aiStore.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        maxTokens: 4000,
      })

      const content = response?.content || response?.choices?.[0]?.message?.content || ''

      // 尝试从响应中提取JSON
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        logger.info(`成功生成${parsed.length}个角色设定卡`)
        return parsed
      }

      // 如果JSON解析失败，生成默认角色设定
      logger.warn('角色设定卡JSON解析失败，使用默认模板')
      return this.generateDefaultCharacterProfiles(characters, mode)
    } catch (error) {
      logger.error('生成角色设定卡失败:', error)
      // 降级处理：返回默认角色设定
      return this.generateDefaultCharacterProfiles(characters, mode)
    }
  }

  // ============================================================================
  // 私有辅助方法
  // ============================================================================

  /**
   * 构建世界观规则
   */
  private buildWorldRules(config: FanficConfig): string[] {
    const rules: string[] = []

    // 基础规则
    rules.push(`原作来源：《${config.sourceMaterial}》`)
    rules.push(`同人模式：${config.mode}`)

    // 模式特定的世界观规则
    switch (config.mode) {
      case 'canon':
        rules.push('世界观设定严格遵循原作，不做任何修改')
        rules.push('原作中未明确说明的设定，需合理推断并保持一致性')
        break
      case 'au':
        rules.push(`AU世界观描述：${config.auDescription || '待补充'}`)
        rules.push('角色需适应新世界观，但保留核心性格特征')
        rules.push('AU世界需有完整的规则体系，不可前后矛盾')
        break
      case 'ooc':
        rules.push('世界观可自由调整，但需内在逻辑自洽')
        rules.push('保留原作的基本设定框架，在此基础上可自由发挥')
        break
      case 'cp':
        rules.push('世界观设定服务于CP关系的发展')
        rules.push('环境和背景需为CP互动创造机会和张力')
        if (config.cpPairing) {
          rules.push(`核心CP：${config.cpPairing}`)
        }
        break
    }

    // 主题规则
    if (config.theme) {
      rules.push(`主题：${config.theme}`)
    }

    return rules
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(
    config: FanficConfig,
    modeGuidelines: ReturnType<FanficService['getModeGuidelines']>
  ): string {
    const parts: string[] = []

    parts.push(`你是一位专业的同人小说创作者，正在为《${config.sourceMaterial}》创作同人作品。`)
    parts.push('')
    parts.push('## 创作模式')
    parts.push(modeGuidelines.systemPromptAddon)
    parts.push('')

    if (config.cpPairing && config.mode === 'cp') {
      parts.push('## CP设定')
      parts.push(`核心CP：${config.cpPairing}`)
      parts.push('所有剧情和配角设定都围绕这对CP的关系展开。')
      parts.push('')
    }

    if (config.auDescription && config.mode === 'au') {
      parts.push('## AU世界观')
      parts.push(config.auDescription)
      parts.push('')
    }

    parts.push('## 创作规则')
    modeGuidelines.rules.forEach(rule => parts.push(`- ${rule}`))
    parts.push('')

    parts.push('## 禁忌事项')
    modeGuidelines.prohibitions.forEach(prohibition => parts.push(`- ${prohibition}`))

    return parts.join('\n')
  }

  /**
   * 构建写作约束
   */
  private buildWritingConstraints(
    config: FanficConfig,
    modeGuidelines: ReturnType<FanficService['getModeGuidelines']>
  ): string[] {
    const constraints: string[] = []

    // 通用约束
    constraints.push(`语言：${config.language === 'zh' ? '中文' : '英文'}`)
    constraints.push(`原作：《${config.sourceMaterial}》`)
    constraints.push(`模式：${config.mode}`)

    // 模式特定约束
    constraints.push(...modeGuidelines.prohibitions.map(p => `[禁忌] ${p}`))

    // 主题约束
    if (config.theme) {
      constraints.push(`主题方向：${config.theme}`)
    }

    return constraints
  }

  /**
   * 生成默认角色设定卡（降级处理）
   */
  private generateDefaultCharacterProfiles(
    characters: string[],
    mode: FanficMode
  ): FanficProjectInit['characterProfiles'] {
    return characters.map(name => ({
      name,
      sourceDescription: `来自原作的角色，需要根据原作内容补充具体的角色描述和性格特征。`,
      fanficGuidelines: this.getDefaultCharacterGuidelines(mode),
    }))
  }

  /**
   * 获取默认角色创作指导
   */
  private getDefaultCharacterGuidelines(mode: FanficMode): string {
    switch (mode) {
      case 'canon':
        return '严格保持角色原作性格，言行举止需符合原作设定。'
      case 'au':
        return '保留角色核心性格特征，但允许因新环境产生合理的行为调整。'
      case 'ooc':
        return '角色性格可自由发挥，但需保持内在逻辑一致，保留可辨识的角色特征。'
      case 'cp':
        return '角色描写围绕CP关系展开，展现角色在感情中的成长和变化。'
      default:
        return '请根据原作内容补充具体的创作指导。'
    }
  }

  /**
   * 生成项目标题
   */
  private generateProjectTitle(config: FanficConfig): string {
    const modeLabels: Record<FanficMode, string> = {
      canon: 'Canon',
      au: 'AU',
      ooc: 'OOC',
      cp: 'CP',
    }

    const modeLabel = modeLabels[config.mode]
    const characterStr = config.characters.slice(0, 3).join('、')
    const suffix = config.characters.length > 3 ? '等' : ''

    if (config.mode === 'cp' && config.cpPairing) {
      return `【${config.sourceMaterial}】${config.cpPairing} - ${modeLabel}`
    }

    return `【${config.sourceMaterial}】${characterStr}${suffix} - ${modeLabel}`
  }

  /**
   * 生成项目描述
   */
  private generateProjectDescription(config: FanficConfig): string {
    const modeDescriptions: Record<FanficMode, string> = {
      canon: '忠实原作设定',
      au: '平行宇宙',
      ooc: '性格自由发挥',
      cp: '以CP关系为核心',
    }

    const parts: string[] = []
    parts.push(`基于《${config.sourceMaterial}》的同人创作`)
    parts.push(`模式：${modeDescriptions[config.mode]}`)
    parts.push(`主要角色：${config.characters.join('、')}`)

    if (config.mode === 'cp' && config.cpPairing) {
      parts.push(`CP：${config.cpPairing}`)
    }

    if (config.theme) {
      parts.push(`主题：${config.theme}`)
    }

    return parts.join(' | ')
  }
}
