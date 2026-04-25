import { ElMessage } from "element-plus"
/**
 * 小说导入器
 * 支持多种格式的小说导入和分析
 */

import { v4 as uuidv4 } from 'uuid'
import type { Project, Character, Chapter, WorldSetting } from '@/types'
import { parseNovelText, type ParsedChapter, type ChapterPattern } from './chapterParser'
import {
  extractCharactersFromChapters,
  convertToCharacters,
  analyzeRelationships
} from './characterExtractor'
import {
  extractWorldInfo,
  convertToWorldTemplate
} from './worldExtractor'
import {
  generateOutline,
  convertToOutline
} from './outlineGenerator'
import {
  analyzeQuality
} from './qualityAnalyzer'
import {
  aiExtractCharacters,
  convertAICharactersToExtracted,
  type AIAnalysisConfig
} from './aiAnalyzer'
import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:novelImporter')

export interface ImportOptions {
  title: string
  author?: string
  detectChapters: boolean
  extractCharacters: boolean
  extractRelations: boolean
  extractWorld: boolean
  generateOutlineFromChapters: boolean
  analyzeQualityMetrics: boolean
  useAIAnalysis: boolean
  aiConfig?: AIAnalysisConfig
  customChapterPattern?: string
  minCharacterOccurrence?: number
  chapterPattern?: ChapterPattern
}

export interface ImportResult {
  project: Partial<Project>
  stats?: any
  qualityMetrics?: any
  worldInfo?: any
  outlineInfo?: any
}

export interface ImportProgress {
  stage: 'parsing' | 'extracting' | 'analyzing' | 'creating' | 'complete'
  current: number
  total: number
  message: string
}

export type ProgressCallback = (progress: ImportProgress) => void

/**
 * 获取完整的AI配置
 */
function getStoredAIConfig(): AIAnalysisConfig | null {
  try {
    const storedConfig = localStorage.getItem('ai-novel-ai-config')
    if (storedConfig) {
      const config = JSON.parse(storedConfig)
      return {
        enabled: true,
        provider: config.provider || 'claude',
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        model: config.model || 'claude-3-5-sonnet-20241022'
      }
    }
  } catch (error) {
    logger.error('读取AI配置失败:', error)
  }
  return null
}

/**
 * 支持的文件格式
 */
export const SUPPORTED_FORMATS = ['txt', 'md', 'markdown'] as const
export type SupportedFormat = typeof SUPPORTED_FORMATS[number]

/**
 * 解析文件内容
 */
async function parseFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const content = e.target?.result as string
      resolve(content)
    }

    reader.onerror = () => {
      reject(new Error('文件读取失败'))
    }

    reader.readAsText(file, 'UTF-8')
  })
}

/**
 * 导入小说文件
 */
export async function importNovel(
  file: File,
  options: ImportOptions,
  onProgress?: ProgressCallback
): Promise<ImportResult> {
  const format = file.name.split('.').pop()?.toLowerCase() as SupportedFormat

  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new Error(`不支持的文件格式: ${format}`)
  }

  // 阶段1: 解析文件
  onProgress?.({
    stage: 'parsing',
    current: 0,
    total: 100,
    message: '正在解析文件...'
  })

  const text = await parseFile(file)

  // 阶段2: 章节解析
  onProgress?.({
    stage: 'parsing',
    current: 30,
    total: 100,
    message: '正在检测章节结构...'
  })

  const { chapters: parsedChapters, pattern: _pattern, stats } = parseNovelText(text)

  // 阶段3: 人物提取
  let characters: Partial<Character>[] = []
  let relations: Array<{ from: string; to: string; type: string; strength: number }> = []

  if (options.extractCharacters) {
    onProgress?.({
      stage: 'extracting',
      current: 50,
      total: 100,
      message: '正在提取人物信息...'
    })

    // 程序识别
    const extractionResult = await extractCharactersFromChapters(
      parsedChapters,
      (current, total) => {
        onProgress?.({
          stage: 'extracting',
          current: 50 + (current / total) * 10,
          total: 100,
          message: `正在提取人物信息... ${current}/${total}`
        })
      }
    )

    // 过滤低频人物
    const minOccurrence = options.minCharacterOccurrence || 3
    const filteredCharacters = extractionResult.characters.filter(c => c.occurrences >= minOccurrence)

    // 如果启用AI分析，使用AI增强
    if (options.useAIAnalysis) {
      onProgress?.({
        stage: 'extracting',
        current: 60,
        total: 100,
        message: '使用AI增强人物识别...'
      })

      try {
        // 获取AI配置：优先使用传入的配置，否则使用存储的配置
        const storedConfig = getStoredAIConfig()
        const aiConfig: AIAnalysisConfig = {
          enabled: true,
          provider: (options as any).aiProvider || storedConfig?.provider || 'claude',
          apiKey: (options as any).aiApiKey || storedConfig?.apiKey || '',
          baseURL: storedConfig?.baseURL,
          model: storedConfig?.model || 'claude-3-5-sonnet-20241022'
        }

        if (!aiConfig.apiKey) {
          throw new Error('未配置AI API密钥，请在设置中配置或使用程序识别')
        }

        const aiCharacters = await aiExtractCharacters(
          text,
          filteredCharacters,
          aiConfig,
          (progress) => {
            onProgress?.({
              stage: 'extracting',
              current: 60 + progress * 0.08,
              total: 100,
              message: `AI分析中... ${Math.round(progress)}%`
            })
          }
        )

        // 合并AI和程序识别结果
        const mergedCharacters = convertAICharactersToExtracted(aiCharacters, filteredCharacters)
        characters = convertToCharacters(mergedCharacters)

        // 使用AI识别的关系
        relations = mergedCharacters
          .filter(c => (c as any).relationships && (c as any).relationships.length > 0)
          .flatMap(c => (c as any).relationships?.map((r: any) => ({
            from: c.name,
            to: r.target,
            type: r.type,
            strength: r.strength
          })) || [])

        logger.info('[AI分析] 人物识别成功:', characters.length, '人')
      } catch (error) {
        logger.error('[AI分析] 失败，降级到程序识别:', error)
        ElMessage.warning({
          message: 'AI分析失败，已降级到程序识别。可配置AI密钥获得更准确结果',
          duration: 5000
        })
        // 失败时降级到程序识别
        characters = convertToCharacters(filteredCharacters)
        if (options.extractRelations) {
          const allText = parsedChapters.map(ch => ch.content).join('\n\n')
          relations = analyzeRelationships(allText, filteredCharacters)
        }
      }
    } else {
      // 不使用AI，直接使用程序识别
      characters = convertToCharacters(filteredCharacters)

      // 阶段4: 关系分析
      if (options.extractRelations && characters.length > 0) {
        onProgress?.({
          stage: 'analyzing',
          current: 70,
          total: 100,
          message: '正在分析人物关系...'
        })

        const allText = parsedChapters.map(ch => ch.content).join('\n\n')
        relations = analyzeRelationships(allText, filteredCharacters)
      }
    }
  }

  // 阶段5: 世界观提取
  let worldTemplate: Partial<WorldSetting> = {
    name: '导入的世界',
    era: {
      time: '',
      techLevel: '',
      socialForm: ''
    },
    powerSystem: undefined,
    rules: [],
    factions: []
  }

  if (options.extractWorld) {
    onProgress?.({
      stage: 'analyzing',
      current: 75,
      total: 100,
      message: '正在提取世界设定...'
    })

    const worldInfo = await extractWorldInfo(text, parsedChapters, (progress) => {
      onProgress?.({
        stage: 'analyzing',
        current: 75 + progress * 0.05,
        total: 100,
        message: `正在提取世界设定... ${Math.round(progress)}%`
      })
    })

    worldTemplate = convertToWorldTemplate(worldInfo, options.title || '导入的小说')
  }

  // 阶段6: 大纲生成
  let outlineData: any = {
    structure: '导入的结构',
    totalChapters: stats.totalChapters,
    description: '从导入小说中提取的大纲',
    volumes: [{
      number: 1,
      title: '第一卷',
      theme: '',
      chapterRange: { start: 1, end: stats.totalChapters },
      mainEvents: []
    }],
    chapters: [] as any[]
  }

  if (options.generateOutlineFromChapters) {
    onProgress?.({
      stage: 'analyzing',
      current: 80,
      total: 100,
      message: '正在生成大纲...'
    })

    const generatedOutline = await generateOutline(parsedChapters, (current, total) => {
      onProgress?.({
        stage: 'analyzing',
        current: 80 + (current / total) * 5,
        total: 100,
        message: `正在生成大纲... ${current}/${total}`
      })
    })

    outlineData = generatedOutline
  }

  // 阶段7: 质量分析
  let qualityMetrics = null

  if (options.analyzeQualityMetrics) {
    onProgress?.({
      stage: 'analyzing',
      current: 85,
      total: 100,
      message: '正在分析质量...'
    })

    qualityMetrics = await analyzeQuality(
      parsedChapters,
      characters.map((c, idx) => ({
        name: c.name || '',
        description: (c as any).description || '',
        occurrences: relations
          .filter(r => r.from === c.name || r.to === c.name)
          .reduce((sum, r) => sum + r.strength * 10, idx === 0 ? 100 : 10)
      })),
      (progress) => {
        onProgress?.({
          stage: 'analyzing',
          current: 85 + progress * 0.05,
          total: 100,
          message: `正在分析质量... ${Math.round(progress)}%`
        })
      }
    )
  }

  // 阶段8: 创建项目
  onProgress?.({
    stage: 'creating',
    current: 90,
    total: 100,
    message: '正在创建项目...'
  })

  const projectId = uuidv4()
  const now = new Date()

  // 创建章节数据
  const chapters: Chapter[] = parsedChapters.map((parsed) => ({
    id: uuidv4(),
    number: parsed.number,
    title: parsed.title,
    content: parsed.content,
    wordCount: parsed.wordCount,
    status: 'draft' as any,
    createdAt: now,
    updatedAt: now
  } as any))

  // 创建人物数据
  const fullCharacters: Character[] = characters.map(char => ({
    id: uuidv4(),
    name: char.name || '',
    aliases: char.aliases || [],
    description: (char as any).description || '',
    background: char.background || '',
    personality: char.personality || [],
    appearance: char.appearance || '',
    motivation: char.motivation || '',
    tags: char.tags || ['other'],
    appearances: [],
    relationships: relations
      .filter(r => r.from === char.name || r.to === char.name)
      .map(r => ({
        characterId: r.from === char.name ? r.to : r.from,
        type: r.type as any,
        description: ''
      })),
    notes: (char as any).notes || '',
    createdAt: now,
    updatedAt: now
  } as any))

  // 转换大纲数据
  const projectOutline: any = outlineData.chapters && outlineData.chapters.length > 0
    ? convertToOutline(outlineData, chapters)
    : {
        structure: '导入的结构',
        totalChapters: stats.totalChapters,
        description: '从导入小说中提取的大纲',
        volumes: outlineData.volumes,
        chapters: chapters.map(ch => ({
          chapterId: ch.id,
          title: ch.title,
          summary: '',
          goals: [],
          conflicts: [],
          resolution: '',
          location: '',
          characters: []
        }))
      }

  // 构建项目描述
  let description = `导入自文件: ${file.name}\n总字数: ${stats.totalWords}\n章节数: ${stats.totalChapters}`

  if (qualityMetrics) {
    description += `\n\n质量评分: ${qualityMetrics.overall}/100`
    description += `\n- 情节: ${qualityMetrics.dimensions.plot}/100`
    description += `\n- 人物: ${qualityMetrics.dimensions.character}/100`
    description += `\n- 节奏: ${qualityMetrics.dimensions.pacing}/100`
    description += `\n- 一致性: ${qualityMetrics.dimensions.consistency}/100`
    description += `\n- 可读性: ${qualityMetrics.dimensions.readability}/100`
  }

  // 创建项目
  const project: Partial<Project> = {
    id: projectId,
    title: options.title || file.name.replace(/\.[^/.]+$/, ''),
    description,
    genre: 'other',
    world: worldTemplate as WorldSetting,
    characters: fullCharacters,
    chapters: chapters,
    outline: projectOutline,
    createdAt: now,
    updatedAt: now
  }

  // 阶段9: 续写建议已移除 - novelImporter 创建 V1 数据，后续自动迁移到 V5，
  // 续写建议应在 V5 数据可用后由调用方按需生成

  onProgress?.({
    stage: 'complete',
    current: 100,
    total: 100,
    message: '导入完成!'
  })

  return {
    project,
    qualityMetrics,
    worldInfo: worldTemplate,
    outlineInfo: outlineData
  }
}

/**
 * 批量导入（支持多个文件合并为一本书）
 */
export async function importMultipleFiles(
  files: File[],
  options: ImportOptions,
  onProgress?: ProgressCallback
): Promise<ImportResult> {
  if (files.length === 1) {
    return importNovel(files[0], options, onProgress)
  }

  // 多文件合并
  const allChapters: ParsedChapter[] = []
  let chapterNumber = 1

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const text = await parseFile(file)
    const { chapters } = parseNovelText(text)

    for (const chapter of chapters) {
      allChapters.push({
        ...chapter,
        number: chapterNumber++
      })
    }

    onProgress?.({
      stage: 'parsing',
      current: ((i + 1) / files.length) * 50,
      total: 100,
      message: `正在解析文件 ${i + 1}/${files.length}...`
    })
  }

  // 继续提取人物和创建项目...
  return importNovel(
    new File([''], 'combined.txt'),
    { ...options, title: options.title || '合并小说' },
    (progress) => {
      onProgress?.({
        ...progress,
        current: 50 + progress.current * 0.5
      })
    }
  )
}

/**
 * 导出项目到文件
 */
export function exportProject(project: Project, format: 'txt' | 'md' = 'md'): void {
  let content = ''

  if (format === 'md') {
    content = `# ${project.title}\n\n`
    content += `作者: ${(project as any).author}\n\n`
    content += `简介:\n${project.description}\n\n---\n\n`

    for (const chapter of project.chapters) {
      content += `## ${chapter.title}\n\n`
      content += `${chapter.content}\n\n---\n\n`
    }
  } else {
    for (const chapter of project.chapters) {
      content += `${chapter.title}\n\n`
      content += `${chapter.content}\n\n\n`
    }
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.title}.${format}`
  a.click()
  URL.revokeObjectURL(url)
}
