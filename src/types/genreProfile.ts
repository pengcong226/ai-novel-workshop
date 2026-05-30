/**
 * 题材Profile数据结构
 * 每种题材定义专属的创作规则、审计维度、节奏模板、角色类型和禁忌列表
 */

export interface GenreAuditDimension {
  id: string
  name: string
  severity: 'critical' | 'warning' | 'info'
  weight: number            // 0-10, 题材特定权重
  checkInstruction: string  // 题材特定审计指引
}

export interface GenrePacingTemplate {
  phase: string             // 阶段名 (e.g., '开局', '升级', '高潮')
  description: string
  wordCountRatio: number    // 该阶段占总字数的比例 (0-1)
  tensionLevel: 'low' | 'medium' | 'high' | 'climax'
}

export interface GenreCharacterType {
  type: string              // 角色类型 (e.g., '主角', '反派', '师父')
  description: string
  requiredTraits: string[]  // 必须具备的特质
  avoidTraits: string[]     // 应避免的特质
}

export interface GenreProfile {
  id: string                // 唯一标识 (e.g., 'xuanhuan', 'urban')
  name: string              // 显示名 (e.g., '玄幻修仙')
  description: string       // 题材描述

  // 创作规则
  writingRules: string[]    // 通用创作规则 (10-25条)
  genreRules: string[]      // 题材专属规则 (5-15条)

  // 禁忌列表
  prohibitions: string[]    // 绝对不能出现的内容

  // 审计维度（覆盖默认16维度的权重和检查指引）
  auditDimensions: GenreAuditDimension[]

  // 节奏模板
  pacingTemplate: GenrePacingTemplate[]

  // 角色类型规范
  characterTypes: GenreCharacterType[]

  // 文风约束
  styleConstraints: {
    tone: string[]              // 推荐基调
    vocabulary: string[]        // 推荐词汇风格
    sentenceStyle: string[]     // 推荐句式
    forbiddenWords: string[]    // 禁用词汇
  }

  // 元数据
  metadata: {
    author?: string
    version: string
    updatedAt: number
  }
}

// 预定义题材ID列表
export type GenreId =
  | 'xuanhuan'    // 玄幻
  | 'xianxia'     // 仙侠
  | 'urban'       // 都市
  | 'history'     // 历史
  | 'mystery'     // 悬疑
  | 'scifi'       // 科幻
  | 'wuxia'       // 武侠
  | 'romance'     // 言情
  | 'game'        // 游戏
  | 'lightnovel'  // 轻小说

export const GENRE_IDS: GenreId[] = [
  'xuanhuan', 'xianxia', 'urban', 'history', 'mystery',
  'scifi', 'wuxia', 'romance', 'game', 'lightnovel'
]

export const GENRE_LABELS: Record<GenreId, string> = {
  xuanhuan: '玄幻修仙',
  xianxia: '仙侠',
  urban: '都市现实',
  history: '历史军事',
  mystery: '悬疑推理',
  scifi: '科幻未来',
  wuxia: '武侠江湖',
  romance: '言情',
  game: '游戏竞技',
  lightnovel: '轻小说',
}

// 题材注册表
const genreRegistry = new Map<string, GenreProfile>()

/**
 * 获取题材Profile
 * @param genreId 题材ID
 * @returns 预材Profile或undefined
 */
export function getGenreProfile(genreId: string): GenreProfile | undefined {
  return genreRegistry.get(genreId)
}

/**
 * 注册题材Profile
 * @param profile 预材Profile
 */
export function registerGenreProfile(profile: GenreProfile): void {
  genreRegistry.set(profile.id, profile)
}

/**
 * 获取所有已注册的题材Profile
 * @returns 所有题材Profile列表
 */
export function getAllGenreProfiles(): GenreProfile[] {
  return Array.from(genreRegistry.values())
}

/**
 * 从文本匹配题材ID
 * @param genre 题材字符串
 * @returns 匹配的题材ID或undefined
 */
export function matchGenreFromText(genre: string): GenreId | undefined {
  const normalized = genre.toLowerCase().trim()

  // 直接匹配ID
  if (GENRE_IDS.includes(normalized as GenreId)) {
    return normalized as GenreId
  }

  // 匹配标签
  const labelMap: Record<string, GenreId> = {
    '玄幻': 'xuanhuan',
    '玄幻修仙': 'xuanhuan',
    '修仙': 'xuanhuan',
    '仙侠': 'xianxia',
    '都市': 'urban',
    '都市现实': 'urban',
    '现实': 'urban',
    '历史': 'history',
    '历史军事': 'history',
    '军事': 'history',
    '悬疑': 'mystery',
    '悬疑推理': 'mystery',
    '推理': 'mystery',
    '科幻': 'scifi',
    '科幻未来': 'scifi',
    '未来': 'scifi',
    '武侠': 'wuxia',
    '武侠江湖': 'wuxia',
    '江湖': 'wuxia',
    '言情': 'romance',
    '游戏': 'game',
    '游戏竞技': 'game',
    '竞技': 'game',
    '轻小说': 'lightnovel',
  }

  return labelMap[normalized]
}

// 从data/genres加载所有预定义题材
export async function loadAllGenreProfiles(): Promise<void> {
  try {
    const genreModules = await import('@/data/genres/')
    if (genreModules.registerAllGenres) {
      genreModules.registerAllGenres()
    }
  } catch (error) {
    console.warn('Failed to load genre profiles from @/data/genres/:', error)
  }
}
