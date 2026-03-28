/**
 * 统一导入服务
 * @module services/unified-importer
 *
 * 合并角色卡和世界书的导入，支持PNG图片同时包含两种数据的情况
 */

import type {
  CharacterCardImportOptions,
  CharacterCardImportResult
} from '@/types/character-card'
import type { WorldbookImportOptions } from '@/types/worldbook'
import { createCharacterCardImporter } from './character-card-importer'
import { createWorldbookImporter } from './worldbook-importer'
import { useCharacterCardStore } from '@/stores/character-card'
import { useWorldbookStore } from '@/stores/worldbook'
import { createRegexScriptManager } from './regex-script'
import { getLogger } from '@/utils/logger'

const logger = getLogger('unified-importer')

/**
 * 统一导入选项
 */
export interface UnifiedImportOptions {
  /** 角色卡导入选项 */
  characterCardOptions?: CharacterCardImportOptions

  /** 世界书导入选项 */
  worldbookOptions?: WorldbookImportOptions

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
    const {
      importCharacterCard = true,
      importWorldbook = true,
      importRegexScripts = true,
      importPrompts = true,
      importAISettings = true,
      characterCardOptions = {},
      worldbookOptions = {}
    } = options

    const result: UnifiedImportResult = {
      success: false
    }

    try {
      // 检测文件类型
      const isPNG = file.type === 'image/png' || file.name.endsWith('.png')
      const isJSON = file.type === 'application/json' || file.name.endsWith('.json')

      if (!isPNG && !isJSON) {
        throw new Error('不支持的文件格式，仅支持 PNG 和 JSON 文件')
      }

      if (isPNG) {
        return await this.importFromPNG(file, options)
      } else {
        return await this.importFromJSON(file, options)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('统一导入失败', error)
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
      worldbookOptions = {}
    } = options

    const result: UnifiedImportResult = {
      success: false
    }

    try {
      // 直接使用角色卡导入器（它会正确处理PNG）
      const characterCardImporter = createCharacterCardImporter()
      const characterCardResult = await characterCardImporter.importFromPNG(file, {
        importWorldbook: importWorldbook,
        importRegexScripts: importRegexScripts,
        importPrompts: importPrompts,
        importAISettings: importAISettings,
        ...characterCardOptions
      })

      // 如果角色卡导入成功（即使没有世界书）
      if (characterCardResult.success) {
        // 保存角色卡数据
        if (importCharacterCard && characterCardResult.character) {
          const characterCardStore = useCharacterCardStore()
          characterCardStore.character = {
            name: characterCardResult.character.name,
            description: characterCardResult.character.description,
            personality: characterCardResult.character.personality,
            scenario: characterCardResult.character.scenario,
            first_mes: characterCardResult.character.first_mes,
            mes_example: characterCardResult.character.mes_example
          }

          result.characterCard = {
            imported: true,
            name: characterCardResult.character.name,
            hasWorldbook: !!characterCardResult.worldbook,
            hasRegexScripts: !!characterCardResult.regexScripts,
            hasPrompts: !!characterCardResult.prompts,
            result: characterCardResult
          }
        }

        // 保存世界书数据（如果有）
        if (importWorldbook && characterCardResult.worldbook?.entries) {
          const worldbookStore = useWorldbookStore()

          logger.info('准备导入世界书', {
            条目总数: characterCardResult.worldbook.entries.length,
            前5个条目: characterCardResult.worldbook.entries.slice(0, 5).map((e: any, i: number) => ({
              index: i,
              uid: e.uid,
              keys长度: (e.keys || e.key || []).length,
              content长度: e.content?.length
            }))
          })

          // 确保世界书已初始化
          if (!worldbookStore.worldbook) {
            await worldbookStore.loadWorldbook()
          }

          await worldbookStore.importEntries(characterCardResult.worldbook.entries, {
            merge: worldbookOptions.mergeDuplicates,
            conflictResolution: worldbookOptions.conflictResolution,
            deduplicate: worldbookOptions.deduplicate,
            enableAllEntries: worldbookOptions.enableAllEntries
          })

          result.worldbook = {
            imported: true,
            entriesCount: characterCardResult.worldbook.entries.length
          }
        }

        // 保存正则脚本（如果有）
        if (importRegexScripts && characterCardResult.regexScripts?.scripts) {
          const regexManager = createRegexScriptManager()
          for (const script of characterCardResult.regexScripts.scripts) {
            regexManager.addScript(script)
          }

          result.regexScripts = {
            imported: true,
            count: characterCardResult.regexScripts.scripts.length
          }
        }

        // 保存提示词（如果有）
        if (importPrompts && characterCardResult.prompts?.prompts) {
          const characterCardStore = useCharacterCardStore()
          characterCardStore.prompts = characterCardResult.prompts.prompts

          result.prompts = {
            imported: true,
            count: characterCardResult.prompts.prompts.length
          }
        }

        // 保存AI设置（如果有）
        if (importAISettings && characterCardResult.aiSettings) {
          const characterCardStore = useCharacterCardStore()
          characterCardStore.updateAISettings(characterCardResult.aiSettings)

          result.aiSettings = {
            imported: true
          }
        }

        result.success = true

        logger.info('PNG统一导入成功', {
          hasCharacterCard: !!result.characterCard?.imported,
          hasWorldbook: !!result.worldbook?.imported,
          hasRegexScripts: !!result.regexScripts?.imported,
          hasPrompts: !!result.prompts?.imported,
          hasAISettings: !!result.aiSettings?.imported
        })
      } else {
        // 角色卡导入失败，可能是纯世界书PNG
        logger.info('PNG不是角色卡格式，尝试作为纯世界书解析')

        const worldbookImporter = createWorldbookImporter()
        const worldbookResult = await worldbookImporter.importWorldbook(file, worldbookOptions)

        if (worldbookResult.success && worldbookResult.entries) {
          const worldbookStore = useWorldbookStore()
          await worldbookStore.importEntries(worldbookResult.entries, {
            merge: worldbookOptions.mergeDuplicates,
            conflictResolution: worldbookOptions.conflictResolution,
            deduplicate: worldbookOptions.deduplicate,
            enableAllEntries: worldbookOptions.enableAllEntries
          })

          result.worldbook = {
            imported: true,
            entriesCount: worldbookResult.entries.length
          }
          result.success = true

          logger.info('PNG作为纯世界书导入成功', {
            entriesCount: worldbookResult.entries.length
          })
        } else {
          throw new Error('PNG文件不包含角色卡或世界书数据')
        }
      }

      return result
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
      worldbookOptions = {}
    } = options

    const result: UnifiedImportResult = {
      success: false
    }

    try {
      // 读取JSON内容
      const text = await file.text()
      const data = JSON.parse(text)

      // 检测JSON格式
      const isCharacterCard = this.isCharacterCardFormat(data)

      if (isCharacterCard && importCharacterCard) {
        // 作为角色卡导入
        const characterCardImporter = createCharacterCardImporter()
        const characterCardResult = await characterCardImporter.importCharacterCard(text, {
          importWorldbook: importWorldbook,
          importRegexScripts: importRegexScripts,
          importPrompts: importPrompts,
          importAISettings: importAISettings,
          ...characterCardOptions
        })

        if (characterCardResult.success) {
          // 保存角色卡数据
          if (characterCardResult.character) {
            const characterCardStore = useCharacterCardStore()
            characterCardStore.character = {
              name: characterCardResult.character.name,
              description: characterCardResult.character.description,
              personality: characterCardResult.character.personality,
              scenario: characterCardResult.character.scenario,
              first_mes: characterCardResult.character.first_mes,
              mes_example: characterCardResult.character.mes_example
            }

            result.characterCard = {
              imported: true,
              name: characterCardResult.character.name,
              hasWorldbook: !!characterCardResult.worldbook,
              hasRegexScripts: !!characterCardResult.regexScripts,
              hasPrompts: !!characterCardResult.prompts,
              result: characterCardResult
            }
          }

          // 保存世界书数据
          if (importWorldbook && characterCardResult.worldbook?.entries) {
            const worldbookStore = useWorldbookStore()
            await worldbookStore.importEntries(characterCardResult.worldbook.entries, {
              merge: worldbookOptions.mergeDuplicates,
              conflictResolution: worldbookOptions.conflictResolution,
              deduplicate: worldbookOptions.deduplicate,
              enableAllEntries: worldbookOptions.enableAllEntries
            })

            result.worldbook = {
              imported: true,
              entriesCount: characterCardResult.worldbook.entries.length
            }
          }

          // 保存正则脚本
          if (importRegexScripts && characterCardResult.regexScripts?.scripts) {
            const regexManager = createRegexScriptManager()
            for (const script of characterCardResult.regexScripts.scripts) {
              regexManager.addScript(script)
            }

            result.regexScripts = {
              imported: true,
              count: characterCardResult.regexScripts.scripts.length
            }
          }

          // 保存提示词
          if (importPrompts && characterCardResult.prompts?.prompts) {
            const characterCardStore = useCharacterCardStore()
            characterCardStore.prompts = characterCardResult.prompts.prompts

            result.prompts = {
              imported: true,
              count: characterCardResult.prompts.prompts.length
            }
          }

          // 保存AI设置
          if (importAISettings && characterCardResult.aiSettings) {
            const characterCardStore = useCharacterCardStore()
            characterCardStore.updateAISettings(characterCardResult.aiSettings)

            result.aiSettings = {
              imported: true
            }
          }

          result.success = true

          logger.info('JSON角色卡统一导入成功', {
            hasCharacterCard: !!result.characterCard?.imported,
            hasWorldbook: !!result.worldbook?.imported
          })
        } else {
          result.errors = characterCardResult.errors
        }
      } else {
        // 作为世界书导入
        const worldbookImporter = createWorldbookImporter()
        const worldbookResult = await worldbookImporter.importWorldbook(file, worldbookOptions)

        if (worldbookResult.success && worldbookResult.entries) {
          const worldbookStore = useWorldbookStore()
          await worldbookStore.importEntries(worldbookResult.entries, {
            merge: worldbookOptions.mergeDuplicates,
            conflictResolution: worldbookOptions.conflictResolution,
            deduplicate: worldbookOptions.deduplicate,
            enableAllEntries: worldbookOptions.enableAllEntries
          })

          result.worldbook = {
            imported: true,
            entriesCount: worldbookResult.entries.length
          }
          result.success = true

          logger.info('JSON世界书统一导入成功', {
            entriesCount: worldbookResult.entries.length
          })
        } else {
          result.errors = worldbookResult.errors
        }
      }

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('JSON统一导入失败', error)
      result.errors = [errorMsg]
      return result
    }
  }

  /**
   * 检测是否为角色卡格式
   */
  private isCharacterCardFormat(data: any): boolean {
    // V2/V3格式
    if (data.spec === 'chara_card_v2' || data.spec === 'chara_card_v3') {
      return true
    }

    // SillyTavern扩展格式
    if (
      data.temperature !== undefined ||
      data.prompts ||
      data.extensions?.regex_scripts ||
      data.extensions?.tavern_helper
    ) {
      return true
    }

    // V1格式
    if (data.name || data.char_name) {
      // 检查是否有角色卡特有字段
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

    // 如果只有entries字段，则认为是世界书
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
