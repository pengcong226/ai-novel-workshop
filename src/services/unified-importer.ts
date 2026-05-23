/**
 * 统一导入服务
 * @module services/unified-importer
 *
 * 合并角色卡、世界书与会话轨迹(JSONL)导入
 */

import type {
  CharacterCardImportOptions,
  CharacterCardImportResult,
} from '@/types/character-card'
import type {
  TraceParseStats,
  TraceReviewItem,
} from '@/types/conversation-trace'
import type { WorldbookImportOptions } from '@/types/worldbook'
import { useCharacterCardStore } from '@/stores/character-card'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useProjectStore } from '@/stores/project'
import { useWorldbookStore } from '@/stores/worldbook'
import { getLogger } from '@/utils/logger'
import { applyTraceReviewItems } from './conversation-trace-apply'
import { buildTraceReviewQueue } from './conversation-trace-conflict'
import { extractTraceArtifacts } from './conversation-trace-extractor'
import { parseConversationTraceFile } from './conversation-trace-parser'
import { createCharacterCardImporter } from './character-card-importer'
import { createRegexScriptManager } from './regex-script'
import { createWorldbookImporter } from './worldbook-importer'

const logger = getLogger('unified-importer')

/**
 * 会话轨迹导入选项
 */
export interface ConversationTraceImportOptions {
  includeRoles?: Array<'user' | 'assistant' | 'system' | 'tool' | 'other'>
  includeEmptyContent?: boolean
  maxMessages?: number
  useRegexPreprocess?: boolean
  autoApplyNoConflict?: boolean
  applyReviewed?: boolean
  reviewItems?: TraceReviewItem[]
}

/**
 * 会话轨迹分析结果
 */
export interface ConversationTraceImportAnalysis {
  parseResult: Awaited<ReturnType<typeof parseConversationTraceFile>>
  extractResult: Awaited<ReturnType<typeof extractTraceArtifacts>>
  reviewResult: ReturnType<typeof buildTraceReviewQueue>
}

/**
 * 统一导入选项
 */
export interface UnifiedImportOptions {
  /** 角色卡导入选项 */
  characterCardOptions?: CharacterCardImportOptions

  /** 世界书导入选项 */
  worldbookOptions?: WorldbookImportOptions

  /** 会话轨迹导入选项 */
  conversationTraceOptions?: ConversationTraceImportOptions

  /** 是否导入角色卡数据 */
  importCharacterCard?: boolean

  /** 是否导入世界书数据 */
  importWorldbook?: boolean

  /** 是否导入正则脚本 */
  importRegexScripts?: boolean

  /** 是否导入提示词 */
  importPrompts?: boolean

  /** 是否导入AI设置 */
  importAISettings?: boolean
}

/**
 * 统一导入结果
 */
export interface UnifiedImportResult {
  success: boolean

  characterCard?: {
    imported: boolean
    name?: string
    hasWorldbook: boolean
    hasRegexScripts: boolean
    hasPrompts: boolean
    result?: CharacterCardImportResult
  }

  worldbook?: {
    imported: boolean
    entriesCount: number
  }

  conversationTrace?: {
    analyzed: boolean
    parsedMessages: number
    extractedArtifacts: number
    reviewItems: number
    applied?: {
      reviewed: number
      applied: number
      skipped: number
      merged: number
      conflicts: number
    }
    sessionId?: string
  }

  /** 会话轨迹审核项（供 UI 编辑后提交） */
  reviewItems?: TraceReviewItem[]

  regexScripts?: {
    imported: boolean
    count: number
  }

  prompts?: {
    imported: boolean
    count: number
  }

  aiSettings?: {
    imported: boolean
  }

  errors?: string[]
  warnings?: string[]
}

/**
 * 统一导入器类
 */
export class UnifiedImporter {
  /**
   * 从文件导入（自动检测类型）
   */
  async importFromFile(
    file: File,
    options: UnifiedImportOptions = {}
  ): Promise<UnifiedImportResult> {
    const result: UnifiedImportResult = {
      success: false,
    }

    try {
      const filename = file.name.toLowerCase()
      const isPNG = file.type === 'image/png' || filename.endsWith('.png')
      const isJSON = file.type === 'application/json' || filename.endsWith('.json')
      const isJSONL =
        filename.endsWith('.jsonl') ||
        filename.endsWith('.ndjson') ||
        file.type === 'application/x-ndjson' ||
        file.type === 'application/jsonl'

      if (!isPNG && !isJSON && !isJSONL) {
        throw new Error('不支持的文件格式，仅支持 PNG、JSON 和 JSONL 文件')
      }

      if (isPNG) return this.importFromPNG(file, options)
      if (isJSONL) return this.importFromJSONL(file, options)
      return this.importFromJSON(file, options)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('统一导入失败', error)
      result.errors = [errorMsg]
      return result
    }
  }

  /**
   * 创建会话轨迹抽取使用的正则管理器（加载当前启用脚本）
   */
  private createTraceRegexManager() {
    const regexManager = createRegexScriptManager()
    const characterCardStore = useCharacterCardStore()

    for (const script of characterCardStore.regexScripts || []) {
      if (!script.disabled) {
        regexManager.addScript(script)
      }
    }

    return regexManager
  }

  /**
   * 会话轨迹分析（解析+抽取+冲突）
   */
  async analyzeConversationTrace(
    file: File,
    options: ConversationTraceImportOptions = {}
  ): Promise<ConversationTraceImportAnalysis> {
    const parseResult = await parseConversationTraceFile(file, {
      includeRoles: options.includeRoles,
      includeEmptyContent: options.includeEmptyContent,
      maxMessages: options.maxMessages,
    })

    const regexManager =
      options.useRegexPreprocess === true ? this.createTraceRegexManager() : undefined

    const extractResult = await extractTraceArtifacts(parseResult.messages, {
      regexManager,
    })

    const worldbookStore = useWorldbookStore()
    if (!worldbookStore.worldbook) {
      await worldbookStore.loadWorldbook()
    }

    const knowledgeStore = useKnowledgeStore()
    await knowledgeStore.loadKnowledge()

    const projectStore = useProjectStore()

    const reviewResult = buildTraceReviewQueue(extractResult.artifacts, {
      worldbookEntries: worldbookStore.entries as any as Array<Record<string, unknown>>,
      knowledgeEntries: knowledgeStore.entries as any as Array<Record<string, unknown>>,
      hasWorldStructure: !!projectStore.currentProject?.world,
      hasCharacterStructure: (projectStore.currentProject?.characters?.length || 0) > 0,
    })

    return {
      parseResult,
      extractResult,
      reviewResult,
    }
  }

  /**
   * 应用会话轨迹审核结果
   */
  async applyConversationTraceReview(
    fileName: string,
    parseStats: TraceParseStats,
    reviewItems: TraceReviewItem[]
  ) {
    return applyTraceReviewItems(reviewItems, {
      fileName,
      parseStats,
    })
  }

  /**
   * 从JSONL导入会话轨迹
   */
  async importFromJSONL(
    file: File,
    options: UnifiedImportOptions = {}
  ): Promise<UnifiedImportResult> {
    const traceOptions = options.conversationTraceOptions || {}

    const result: UnifiedImportResult = {
      success: false,
    }

    try {
      const analysis = await this.analyzeConversationTrace(file, traceOptions)

      result.reviewItems = traceOptions.reviewItems || analysis.reviewResult.items

      result.conversationTrace = {
        analyzed: true,
        parsedMessages: analysis.parseResult.stats.includedMessages,
        extractedArtifacts: analysis.extractResult.stats.artifacts,
        reviewItems: result.reviewItems.length,
      }

      const warnings: string[] = []
      if (analysis.parseResult.errors.length > 0) {
        warnings.push(`解析失败行数: ${analysis.parseResult.errors.length}`)
      }
      if (analysis.extractResult.warnings.length > 0) {
        warnings.push(...analysis.extractResult.warnings)
      }
      if (warnings.length > 0) {
        result.warnings = warnings
      }

      const shouldApplyReviewed = traceOptions.applyReviewed === true
      const shouldAutoApplyNoConflict = traceOptions.autoApplyNoConflict === true

      if (shouldApplyReviewed || shouldAutoApplyNoConflict) {
        const applyItems: TraceReviewItem[] = shouldApplyReviewed
          ? result.reviewItems
          : result.reviewItems.map(item => ({
              ...item,
              action: item.conflicts.length > 0 ? 'skip' : 'apply',
            }))

        const applyResult = await this.applyConversationTraceReview(
          file.name,
          analysis.parseResult.stats,
          applyItems
        )

        result.conversationTrace.applied = applyResult.stats
        result.conversationTrace.sessionId = applyResult.session.id

        if (applyResult.warnings?.length) {
          result.warnings = [...(result.warnings || []), ...applyResult.warnings]
        }
      }

      result.success = true
      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('JSONL会话轨迹导入失败', error)
      result.errors = [errorMsg]
      return result
    }
  }

  /**
   * 从PNG导入
   */
  async importFromPNG(
    file: File,
    options: UnifiedImportOptions = {}
  ): Promise<UnifiedImportResult> {
    const {
      importCharacterCard = true,
      importWorldbook = true,
      importRegexScripts = true,
      importPrompts = true,
      importAISettings = true,
      characterCardOptions = {},
      worldbookOptions = {},
    } = options

    const result: UnifiedImportResult = {
      success: false,
    }

    try {
      const characterCardImporter = createCharacterCardImporter()
      const characterCardResult = await characterCardImporter.importFromPNG(file, {
        importWorldbook,
        importRegexScripts,
        importPrompts,
        importAISettings,
        ...characterCardOptions,
      })

      if (characterCardResult.success) {
        if (importCharacterCard && characterCardResult.character) {
          const characterCardStore = useCharacterCardStore()
          characterCardStore.character = {
            name: characterCardResult.character.name,
            description: characterCardResult.character.description,
            personality: characterCardResult.character.personality,
            scenario: characterCardResult.character.scenario,
            first_mes: characterCardResult.character.first_mes,
            mes_example: characterCardResult.character.mes_example,
          }

          result.characterCard = {
            imported: true,
            name: characterCardResult.character.name,
            hasWorldbook: !!characterCardResult.worldbook,
            hasRegexScripts: !!characterCardResult.regexScripts,
            hasPrompts: !!characterCardResult.prompts,
            result: characterCardResult,
          }
        }

        if (importWorldbook && characterCardResult.worldbook?.entries) {
          const worldbookStore = useWorldbookStore()
          if (!worldbookStore.worldbook) {
            await worldbookStore.loadWorldbook()
          }

          await worldbookStore.importEntries(characterCardResult.worldbook.entries as any, {
            merge: worldbookOptions.mergeDuplicates,
            conflictResolution: worldbookOptions.conflictResolution as any,
            deduplicate: worldbookOptions.deduplicate,
            enableAllEntries: worldbookOptions.enableAllEntries,
          })

          result.worldbook = {
            imported: true,
            entriesCount: characterCardResult.worldbook.entries.length,
          }
        }

        if (importRegexScripts && characterCardResult.regexScripts?.scripts) {
          const regexManager = createRegexScriptManager()
          for (const script of characterCardResult.regexScripts.scripts) {
            regexManager.addScript(script)
          }

          result.regexScripts = {
            imported: true,
            count: characterCardResult.regexScripts.scripts.length,
          }
        }

        if (importPrompts && characterCardResult.prompts?.prompts) {
          const characterCardStore = useCharacterCardStore()
          characterCardStore.prompts = characterCardResult.prompts.prompts

          result.prompts = {
            imported: true,
            count: characterCardResult.prompts.prompts.length,
          }
        }

        if (importAISettings && characterCardResult.aiSettings) {
          const characterCardStore = useCharacterCardStore()
          characterCardStore.updateAISettings(characterCardResult.aiSettings)

          result.aiSettings = {
            imported: true,
          }
        }

        result.success = true
        return result
      }

      const worldbookImporter = createWorldbookImporter()
      const worldbookResult = await worldbookImporter.importWorldbook(file, worldbookOptions)
      const worldbookEntries = this.extractWorldbookEntries(worldbookResult)

      if (worldbookEntries.length > 0) {
        const worldbookStore = useWorldbookStore()
        if (!worldbookStore.worldbook) {
          await worldbookStore.loadWorldbook()
        }

        await worldbookStore.importEntries(worldbookEntries as any, {
          merge: worldbookOptions.mergeDuplicates,
          conflictResolution: worldbookOptions.conflictResolution as any,
          deduplicate: worldbookOptions.deduplicate,
          enableAllEntries: worldbookOptions.enableAllEntries,
        })

        result.worldbook = {
          imported: true,
          entriesCount: worldbookEntries.length,
        }
        result.success = true
        return result
      }

      throw new Error('PNG文件不包含角色卡或世界书数据')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('PNG统一导入失败', error)
      result.errors = [errorMsg]
      return result
    }
  }

  /**
   * 从JSON导入
   */
  async importFromJSON(
    file: File,
    options: UnifiedImportOptions = {}
  ): Promise<UnifiedImportResult> {
    const {
      importCharacterCard = true,
      importWorldbook = true,
      importRegexScripts = true,
      importPrompts = true,
      importAISettings = true,
      characterCardOptions = {},
      worldbookOptions = {},
    } = options

    const result: UnifiedImportResult = {
      success: false,
    }

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const isCharacterCard = this.isCharacterCardFormat(data)

      if (isCharacterCard && importCharacterCard) {
        const characterCardImporter = createCharacterCardImporter()
        const characterCardResult = await characterCardImporter.importCharacterCard(text, {
          importWorldbook,
          importRegexScripts,
          importPrompts,
          importAISettings,
          ...characterCardOptions,
        })

        if (characterCardResult.success) {
          if (characterCardResult.character) {
            const characterCardStore = useCharacterCardStore()
            characterCardStore.character = {
              name: characterCardResult.character.name,
              description: characterCardResult.character.description,
              personality: characterCardResult.character.personality,
              scenario: characterCardResult.character.scenario,
              first_mes: characterCardResult.character.first_mes,
              mes_example: characterCardResult.character.mes_example,
            }

            result.characterCard = {
              imported: true,
              name: characterCardResult.character.name,
              hasWorldbook: !!characterCardResult.worldbook,
              hasRegexScripts: !!characterCardResult.regexScripts,
              hasPrompts: !!characterCardResult.prompts,
              result: characterCardResult,
            }
          }

          if (importWorldbook && characterCardResult.worldbook?.entries) {
            const worldbookStore = useWorldbookStore()
            if (!worldbookStore.worldbook) {
              await worldbookStore.loadWorldbook()
            }

            await worldbookStore.importEntries(characterCardResult.worldbook.entries as any, {
              merge: worldbookOptions.mergeDuplicates,
              conflictResolution: worldbookOptions.conflictResolution as any,
              deduplicate: worldbookOptions.deduplicate,
              enableAllEntries: worldbookOptions.enableAllEntries,
            })

            result.worldbook = {
              imported: true,
              entriesCount: characterCardResult.worldbook.entries.length,
            }
          }

          if (importRegexScripts && characterCardResult.regexScripts?.scripts) {
            const regexManager = createRegexScriptManager()
            for (const script of characterCardResult.regexScripts.scripts) {
              regexManager.addScript(script)
            }

            result.regexScripts = {
              imported: true,
              count: characterCardResult.regexScripts.scripts.length,
            }
          }

          if (importPrompts && characterCardResult.prompts?.prompts) {
            const characterCardStore = useCharacterCardStore()
            characterCardStore.prompts = characterCardResult.prompts.prompts

            result.prompts = {
              imported: true,
              count: characterCardResult.prompts.prompts.length,
            }
          }

          if (importAISettings && characterCardResult.aiSettings) {
            const characterCardStore = useCharacterCardStore()
            characterCardStore.updateAISettings(characterCardResult.aiSettings)

            result.aiSettings = {
              imported: true,
            }
          }

          result.success = true
          return result
        }

        result.errors = characterCardResult.errors
        return result
      }

      const worldbookImporter = createWorldbookImporter()
      const worldbookResult = await worldbookImporter.importWorldbook(file, worldbookOptions)
      const worldbookEntries = this.extractWorldbookEntries(worldbookResult)

      if (worldbookEntries.length > 0) {
        const worldbookStore = useWorldbookStore()
        if (!worldbookStore.worldbook) {
          await worldbookStore.loadWorldbook()
        }

        await worldbookStore.importEntries(worldbookEntries as any, {
          merge: worldbookOptions.mergeDuplicates,
          conflictResolution: worldbookOptions.conflictResolution as any,
          deduplicate: worldbookOptions.deduplicate,
          enableAllEntries: worldbookOptions.enableAllEntries,
        })

        result.worldbook = {
          imported: true,
          entriesCount: worldbookEntries.length,
        }
        result.success = true
        return result
      }

      result.errors = this.extractWorldbookErrors(worldbookResult) || ['世界书导入失败']
      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('JSON统一导入失败', error)
      result.errors = [errorMsg]
      return result
    }
  }

  /**
   * 从 worldbook 导入结果提取条目
   */
  private extractWorldbookEntries(worldbookResult: any): any[] {
    if (!worldbookResult || typeof worldbookResult !== 'object') {
      return []
    }

    const directEntries = (worldbookResult as { entries?: any[] }).entries
    if (Array.isArray(directEntries)) {
      return directEntries
    }

    const nested = (worldbookResult as { worldbook?: { entries?: any[] } }).worldbook
    if (nested && Array.isArray(nested.entries)) {
      return nested.entries
    }

    return []
  }

  /**
   * 从 worldbook 导入结果提取错误消息
   */
  private extractWorldbookErrors(worldbookResult: any): string[] | undefined {
    if (!worldbookResult || typeof worldbookResult !== 'object') {
      return undefined
    }

    const maybeErrors = (worldbookResult as { errors?: any }).errors
    if (!Array.isArray(maybeErrors)) {
      return undefined
    }

    const mapped = maybeErrors
      .map(error => {
        if (typeof error === 'string') return error
        if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
          return (error as any).message as string
        }
        return ''
      })
      .filter(Boolean)

    return mapped.length > 0 ? mapped : undefined
  }

  /**
   * 检测是否为角色卡格式
   */
  private isCharacterCardFormat(data: any): boolean {
    if (data.spec === 'chara_card_v2' || data.spec === 'chara_card_v3') {
      return true
    }

    if (
      data.temperature !== undefined ||
      data.prompts ||
      data.extensions?.regex_scripts ||
      data.extensions?.tavern_helper
    ) {
      return true
    }

    if (data.name || data.char_name) {
      if (
        data.first_mes ||
        data.mes_example ||
        data.scenario ||
        data.personality ||
        data.description
      ) {
        return true
      }
    }

    if (data.entries && Array.isArray(data.entries)) {
      return false
    }

    return false
  }
}

/**
 * 创建统一导入器实例
 */
export function createUnifiedImporter(): UnifiedImporter {
  return new UnifiedImporter()
}

/**
 * 便捷函数：从文件导入
 */
export async function importFromFile(
  file: File,
  options?: UnifiedImportOptions
): Promise<UnifiedImportResult> {
  const importer = new UnifiedImporter()
  return importer.importFromFile(file, options)
}
