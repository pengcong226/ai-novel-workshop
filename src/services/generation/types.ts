export const HIGH_IMPACT_KEYWORDS = [
  '死', '伤', '去', '到', '回', '破', '境', '阶',
  '层', '宗', '门', '帮', '派', '遇', '得', '失',
  '战', '斗', '杀', '救', '突破', '晋升', '陨落',
  '死亡', '觉醒', '背叛', '加入', '离开', '获得',
  '失去', '重伤', '痊愈', '结盟', '决裂', '封印', '解封'
]

const HIGH_IMPACT_REGEX = new RegExp(HIGH_IMPACT_KEYWORDS.join('|'))

export function hasHighImpactContent(text: string): boolean {
  return HIGH_IMPACT_REGEX.test(text)
}

export interface BatchGenerationOptions {
  startChapter: number
  count: number
  autoSave: boolean
  autoUpdateSettings: boolean
  enableCheckpoint?: boolean
  checkpointInterval?: number
  extraction?: {
    extractPlotEvents?: boolean
    enableAntiRetcon?: boolean
  }
  rewrite?: {
    directionPrompt?: string
  }
  callbacks?: {
    onCheckpointConfirm?: (chaptersGenerated: number) => Promise<boolean>
    onBatchComplete?: (chaptersGenerated: number) => void
  }
}

export function buildGenerationOptions(advancedSettings?: {
  maxTokens?: number
  temperature?: number
  stopSequences?: string[]
}) {
  const maxTokens = advancedSettings?.maxTokens ?? 4000
  const temperature = advancedSettings?.temperature ?? 0.7
  const stopSequences = (advancedSettings?.stopSequences || []).filter(Boolean)

  return {
    maxTokens,
    temperature,
    ...(stopSequences.length > 0 ? { stopSequences } : {})
  }
}
