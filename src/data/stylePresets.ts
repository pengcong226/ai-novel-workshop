import type { StyleProfile, StyleTemplate } from '@/types'

export const DEFAULT_STYLE_PRESET_ID = 'standard-balanced'

const TONES = ['轻松', '严肃', '幽默', '黑暗'] as const
const NARRATIVE_PERSPECTIVES = ['第一人称', '第三人称'] as const
const PACINGS = ['舒缓', '均衡', '紧凑'] as const
const VOCABULARIES = ['通俗', '典雅', '专业', '诗性'] as const
const SENTENCE_STYLES = ['短句利落', '长句铺陈', '长短结合'] as const
const DIALOGUE_STYLES = ['简洁', '华丽', '幽默', '严肃'] as const
const DESCRIPTION_LEVELS = ['详细', '适中', '简洁'] as const
const STYLE_SOURCES = ['preset', 'template', 'ai-extracted', 'custom'] as const

const MAX_STYLE_TEXT_LENGTH = 600
const MAX_STYLE_LABEL_LENGTH = 80
const MAX_STYLE_ARRAY_ITEMS = 12
const INSTRUCTION_CONTROL_PATTERNS = [
  /忽略(?:以上|之前|所有).{0,20}(?:提示|指令|规则)/i,
  /ignore\s+(?:previous|above|all)\s+(?:instructions|prompts|rules)/i,
  /(?:system|developer)\s+(?:prompt|message)/i,
  /泄露.{0,12}(?:提示词|系统|配置|密钥)/,
  /输出.{0,12}(?:系统提示|开发者消息|配置|密钥)/
]

type StyleProfileInput = Partial<Record<keyof StyleProfile, unknown>>

export const STYLE_PRESETS: readonly StyleProfile[] = [
  {
    id: DEFAULT_STYLE_PRESET_ID,
    name: '标准网文',
    description: '节奏均衡、表达清晰，适合大多数长篇类型小说。',
    genre: '通用',
    tone: '严肃',
    narrativePerspective: '第三人称',
    pacing: '均衡',
    vocabulary: '通俗',
    sentenceStyle: '长短结合',
    dialogueStyle: '简洁',
    descriptionLevel: '适中',
    avoidList: ['过度堆砌形容词', '频繁跳视角'],
    examplePhrases: ['他停下脚步，终于意识到事情并不简单。'],
    customInstructions: '保持叙事清楚、情节推进稳定，兼顾画面感与可读性。',
    metadata: { presetId: DEFAULT_STYLE_PRESET_ID, source: 'preset' }
  },
  {
    id: 'xuanhuan-epic',
    name: '玄幻史诗',
    description: '气势宏大、设定厚重，突出境界、传承与命运感。',
    genre: '玄幻',
    tone: '严肃',
    narrativePerspective: '第三人称',
    pacing: '均衡',
    vocabulary: '典雅',
    sentenceStyle: '长短结合',
    dialogueStyle: '严肃',
    descriptionLevel: '详细',
    avoidList: ['现代口语过多', '战力体系前后矛盾'],
    examplePhrases: ['天地灵息如潮汐般涌来，在他经脉间奔流不息。'],
    customInstructions: '突出修炼体系、宗门秩序和强者压迫感，战斗描写要有层次。',
    metadata: { presetId: 'xuanhuan-epic', source: 'preset' }
  },
  {
    id: 'wuxia-classic',
    name: '古典武侠',
    description: '江湖气浓、语言凝练，强调侠义、恩怨和留白。',
    genre: '武侠',
    tone: '严肃',
    narrativePerspective: '第三人称',
    pacing: '舒缓',
    vocabulary: '典雅',
    sentenceStyle: '长短结合',
    dialogueStyle: '简洁',
    descriptionLevel: '适中',
    avoidList: ['网络流行语', '解释过满'],
    examplePhrases: ['风过长街，酒旗微动，他的刀却一动未动。'],
    customInstructions: '多用动作、环境和对白表现人物，不直接替读者解释情绪。',
    metadata: { presetId: 'wuxia-classic', source: 'preset' }
  },
  {
    id: 'urban-light',
    name: '都市轻松',
    description: '语言轻快、节奏明朗，适合都市日常和轻喜剧。',
    genre: '都市',
    tone: '轻松',
    narrativePerspective: '第三人称',
    pacing: '紧凑',
    vocabulary: '通俗',
    sentenceStyle: '短句利落',
    dialogueStyle: '幽默',
    descriptionLevel: '简洁',
    avoidList: ['沉重说教', '长篇设定解释'],
    examplePhrases: ['他愣了三秒，决定先把这口锅甩出去。'],
    customInstructions: '对白自然有梗，场景切换利落，保持轻松但不要破坏剧情可信度。',
    metadata: { presetId: 'urban-light', source: 'preset' }
  },
  {
    id: 'scifi-hard',
    name: '硬科幻',
    description: '逻辑严谨、技术感强，注重系统、因果与现实约束。',
    genre: '科幻',
    tone: '严肃',
    narrativePerspective: '第三人称',
    pacing: '均衡',
    vocabulary: '专业',
    sentenceStyle: '长短结合',
    dialogueStyle: '简洁',
    descriptionLevel: '详细',
    avoidList: ['魔法式科技', '无解释的 deus ex machina'],
    examplePhrases: ['舱壁上的霜线缓慢退去，反应堆功率终于回到安全阈值。'],
    customInstructions: '关键技术设定要自洽，危机解决必须来自已铺垫的规则。',
    metadata: { presetId: 'scifi-hard', source: 'preset' }
  },
  {
    id: 'suspense-dark',
    name: '悬疑暗黑',
    description: '氛围压抑、细节可疑，适合悬疑、惊悚和黑暗题材。',
    genre: '悬疑',
    tone: '黑暗',
    narrativePerspective: '第三人称',
    pacing: '紧凑',
    vocabulary: '通俗',
    sentenceStyle: '短句利落',
    dialogueStyle: '简洁',
    descriptionLevel: '适中',
    avoidList: ['提前揭示谜底', '用巧合推进关键线索'],
    examplePhrases: ['门缝里没有光，只有一阵像呼吸般起伏的冷意。'],
    customInstructions: '保持信息克制，用异常细节制造不安，线索要公平但不直白。',
    metadata: { presetId: 'suspense-dark', source: 'preset' }
  },
  {
    id: 'romance-delicate',
    name: '细腻言情',
    description: '情绪细腻、互动含蓄，强调心理变化和关系张力。',
    genre: '言情',
    tone: '轻松',
    narrativePerspective: '第三人称',
    pacing: '舒缓',
    vocabulary: '诗性',
    sentenceStyle: '长短结合',
    dialogueStyle: '简洁',
    descriptionLevel: '详细',
    avoidList: ['情绪直白喊口号', '误会拖延过久'],
    examplePhrases: ['她没有回头，却听见自己的心跳在雨声里乱了半拍。'],
    customInstructions: '用动作、停顿和环境映照情绪，关系推进要有细小但明确的变化。',
    metadata: { presetId: 'romance-delicate', source: 'preset' }
  },
  {
    id: 'historical-elegant',
    name: '历史雅正',
    description: '措辞克制、时代感强，适合历史、权谋和朝堂叙事。',
    genre: '历史',
    tone: '严肃',
    narrativePerspective: '第三人称',
    pacing: '均衡',
    vocabulary: '典雅',
    sentenceStyle: '长句铺陈',
    dialogueStyle: '严肃',
    descriptionLevel: '适中',
    avoidList: ['现代网络词', '制度称谓混乱'],
    examplePhrases: ['殿中烛火微摇，群臣垂首，谁也不肯先开这个口。'],
    customInstructions: '注意礼制、身份和称谓，权谋推进依赖利益与信息差。',
    metadata: { presetId: 'historical-elegant', source: 'preset' }
  },
  {
    id: 'comedy-fast',
    name: '快节奏喜剧',
    description: '短句密集、反应快速，依靠反差和节奏制造笑点。',
    genre: '喜剧',
    tone: '幽默',
    narrativePerspective: '第三人称',
    pacing: '紧凑',
    vocabulary: '通俗',
    sentenceStyle: '短句利落',
    dialogueStyle: '幽默',
    descriptionLevel: '简洁',
    avoidList: ['解释笑点', '牺牲人物智商'],
    examplePhrases: ['他刚想装作无事发生，身后的墙非常不给面子地塌了。'],
    customInstructions: '笑点来自人物目标和现实反差，保持剧情推进，不写段子合集。',
    metadata: { presetId: 'comedy-fast', source: 'preset' }
  },
  {
    id: 'literary-poetic',
    name: '文学诗性',
    description: '语言富有象征和节奏感，重视意象、内心与余韵。',
    genre: '文学',
    tone: '严肃',
    narrativePerspective: '第一人称',
    pacing: '舒缓',
    vocabulary: '诗性',
    sentenceStyle: '长句铺陈',
    dialogueStyle: '简洁',
    descriptionLevel: '详细',
    avoidList: ['情节停滞过久', '意象堆叠无指向'],
    examplePhrases: ['那年冬天很长，长到我以为春天只是别人发明的词。'],
    customInstructions: '语言要有节奏和象征，但每段都应服务人物状态或主题推进。',
    metadata: { presetId: 'literary-poetic', source: 'preset' }
  },
  {
    id: 'military-crisp',
    name: '军事硬朗',
    description: '表达利落、行动导向，强调战术、压力和团队协作。',
    genre: '军事',
    tone: '严肃',
    narrativePerspective: '第三人称',
    pacing: '紧凑',
    vocabulary: '专业',
    sentenceStyle: '短句利落',
    dialogueStyle: '简洁',
    descriptionLevel: '适中',
    avoidList: ['无意义煽情', '战术细节自相矛盾'],
    examplePhrases: ['耳机里只剩电流声。他压低枪口，等最后三秒。'],
    customInstructions: '动作和决策要清楚，战斗压力来自目标、地形、资源和时间限制。',
    metadata: { presetId: 'military-crisp', source: 'preset' }
  }
]

export function cloneStyleProfile(profile: StyleProfile): StyleProfile {
  return {
    ...profile,
    avoidList: [...profile.avoidList],
    examplePhrases: [...profile.examplePhrases],
    metadata: profile.metadata ? { ...profile.metadata } : undefined
  }
}

export function getStylePreset(id: string | undefined = DEFAULT_STYLE_PRESET_ID): StyleProfile {
  const preset = STYLE_PRESETS.find(item => item.id === id) ?? STYLE_PRESETS[0]
  return cloneStyleProfile(preset)
}

export function createStyleProfileFromPreset(id: string = DEFAULT_STYLE_PRESET_ID): StyleProfile {
  const preset = getStylePreset(id)
  return {
    ...preset,
    id: globalThis.crypto?.randomUUID?.() ?? `${preset.id}-${Date.now()}`,
    metadata: {
      ...preset.metadata,
      presetId: preset.metadata?.presetId ?? preset.id,
      source: 'preset',
      updatedAt: Date.now()
    }
  }
}

export function createStyleProfileFromTemplate(template: StyleTemplate): StyleProfile {
  const base = getStylePreset(DEFAULT_STYLE_PRESET_ID)
  return {
    ...base,
    id: globalThis.crypto?.randomUUID?.() ?? `template-style-${Date.now()}`,
    name: '模板风格',
    description: template.writingStyle || '从小说模板转换的项目风格。',
    tone: template.tone,
    narrativePerspective: template.narrativePerspective,
    dialogueStyle: template.dialogueStyle,
    descriptionLevel: template.descriptionLevel,
    customInstructions: template.writingStyle || base.customInstructions,
    metadata: {
      presetId: DEFAULT_STYLE_PRESET_ID,
      source: 'template',
      updatedAt: Date.now()
    }
  }
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

function sanitizeStyleText(value: string, maxLength: number): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return null
  if (INSTRUCTION_CONTROL_PATTERNS.some(pattern => pattern.test(normalized))) return null
  return normalized.slice(0, maxLength)
}

function mergeString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  return sanitizeStyleText(value, MAX_STYLE_TEXT_LENGTH) ?? fallback
}

function mergeOptionalString(value: unknown, fallback: string | undefined): string | undefined {
  if (typeof value !== 'string') return fallback
  return sanitizeStyleText(value, MAX_STYLE_LABEL_LENGTH) ?? fallback
}

function mergeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback]
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => sanitizeStyleText(item, MAX_STYLE_LABEL_LENGTH))
    .filter((item): item is string => Boolean(item))
  return items.slice(0, MAX_STYLE_ARRAY_ITEMS)
}

function mergeStyleMetadata(value: unknown, fallback: StyleProfile['metadata']): StyleProfile['metadata'] {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    ...fallback,
    presetId: mergeOptionalString(source.presetId, fallback?.presetId),
    source: isOneOf(source.source, STYLE_SOURCES) ? source.source : fallback?.source,
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : fallback?.updatedAt
  }
}

export function mergeStyleProfile(input: Partial<StyleProfile> | null | undefined, fallback: StyleProfile = getStylePreset(DEFAULT_STYLE_PRESET_ID)): StyleProfile {
  const source = input && typeof input === 'object' ? input as StyleProfileInput : {}
  return {
    ...fallback,
    id: mergeString(source.id, fallback.id),
    name: mergeString(source.name, fallback.name),
    description: mergeString(source.description, fallback.description),
    genre: mergeOptionalString(source.genre, fallback.genre),
    tone: isOneOf(source.tone, TONES) ? source.tone : fallback.tone,
    narrativePerspective: isOneOf(source.narrativePerspective, NARRATIVE_PERSPECTIVES) ? source.narrativePerspective : fallback.narrativePerspective,
    pacing: isOneOf(source.pacing, PACINGS) ? source.pacing : fallback.pacing,
    vocabulary: isOneOf(source.vocabulary, VOCABULARIES) ? source.vocabulary : fallback.vocabulary,
    sentenceStyle: isOneOf(source.sentenceStyle, SENTENCE_STYLES) ? source.sentenceStyle : fallback.sentenceStyle,
    dialogueStyle: isOneOf(source.dialogueStyle, DIALOGUE_STYLES) ? source.dialogueStyle : fallback.dialogueStyle,
    descriptionLevel: isOneOf(source.descriptionLevel, DESCRIPTION_LEVELS) ? source.descriptionLevel : fallback.descriptionLevel,
    avoidList: mergeStringArray(source.avoidList, fallback.avoidList),
    examplePhrases: mergeStringArray(source.examplePhrases, fallback.examplePhrases),
    customInstructions: mergeString(source.customInstructions, fallback.customInstructions),
    metadata: mergeStyleMetadata(source.metadata, fallback.metadata)
  }
}
