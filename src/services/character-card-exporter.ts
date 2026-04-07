/**
 * 角色卡导出服务
 * @module services/character-card-exporter
 */

import type {
  CharacterCardV1,
  CharacterCardV2,
  CharacterCardV3,
  SillyTavernCharacterCard,
  CharacterCardExportOptions,
  CharacterCardExportResult,
  CharacterBookEntry,
  RegexScript,
  PromptConfig
} from '@/types/character-card'
import { createWorldbookPng, downloadPng } from './worldbook-png-writer'
import { getLogger } from '@/utils/logger'

const logger = getLogger('character-card-exporter')

/**
 * 角色卡导出器
 */
export class CharacterCardExporter {
  /**
   * 导出角色卡
   */
  async exportCharacterCard(
    data: {
      character?: {
        name: string
        description?: string
        personality?: string
        scenario?: string
        first_mes?: string
        mes_example?: string
        creator_notes?: string
        system_prompt?: string
        post_history_instructions?: string
        tags?: string[]
        creator?: string
      }
      worldbook?: {
        entries: CharacterBookEntry[]
        name?: string
        description?: string
      }
      regexScripts?: RegexScript[]
      prompts?: PromptConfig[]
      aiSettings?: {
        temperature?: number
        top_p?: number
        top_k?: number
        repetition_penalty?: number
        [key: string]: any
      }
    },
    options: CharacterCardExportOptions
  ): Promise<CharacterCardExportResult> {
    try {
      const { format } = options

      let exportData: any
      let size = 0

      switch (format as any) {
        case 'v1':
          exportData = this.createV1Format(data, options)
          break
        case 'v2':
          exportData = this.createV2Format(data, options)
          break
        case 'v3':
          exportData = this.createV3Format(data, options)
          break
        case 'sillytavern':
          exportData = this.createSillyTavernFormat(data, options)
          break
        case 'png':
          return await this.exportAsPNG(data, options)
        default:
          throw new Error(`不支持的导出格式: ${format}`)
      }

      const jsonStr = JSON.stringify(exportData, null, 2)
      size = jsonStr.length

      logger.info('角色卡导出成功', { format, size })

      return {
        success: true,
        format,
        data: jsonStr,
        size
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('角色卡导出失败', error)

      return {
        success: false,
        format: options.format,
        size: 0,
        errors: [errorMsg]
      } as any
    }
  }

  /**
   * 创建V1格式
   */
  private createV1Format(
    data: any,
    options: CharacterCardExportOptions
  ): CharacterCardV1 {
    const v1: CharacterCardV1 = {
      name: data.character?.name || 'Unknown',
      description: data.character?.description,
      personality: data.character?.personality,
      scenario: data.character?.scenario,
      first_mes: data.character?.first_mes,
      mes_example: data.character?.mes_example,
      creator_notes: data.character?.creator_notes,
      system_prompt: data.character?.system_prompt,
      post_history_instructions: data.character?.post_history_instructions,
      tags: data.character?.tags,
      creator: data.character?.creator
    }

    if (options.includeWorldbook && data.worldbook) {
      v1.character_book = {
        name: data.worldbook.name,
        description: data.worldbook.description,
        entries: data.worldbook.entries
      }
    }

    return v1
  }

  /**
   * 创建V2格式
   */
  private createV2Format(
    data: any,
    options: CharacterCardExportOptions
  ): CharacterCardV2 {
    const v2: CharacterCardV2 = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: data.character?.name || 'Unknown',
        description: data.character?.description,
        personality: data.character?.personality,
        scenario: data.character?.scenario,
        first_mes: data.character?.first_mes,
        mes_example: data.character?.mes_example,
        creator_notes: data.character?.creator_notes,
        system_prompt: data.character?.system_prompt,
        post_history_instructions: data.character?.post_history_instructions,
        tags: data.character?.tags,
        creator: data.character?.creator
      }
    }

    if (options.includeWorldbook && data.worldbook) {
      v2.data.character_book = {
        name: data.worldbook.name,
        description: data.worldbook.description,
        entries: data.worldbook.entries
      }
    }

    if (options.includeExtensions && data.regexScripts) {
      v2.data.extensions = {
        regex_scripts: data.regexScripts
      }
    }

    return v2
  }

  /**
   * 创建V3格式
   */
  private createV3Format(
    data: any,
    options: CharacterCardExportOptions
  ): CharacterCardV3 {
    const v3: CharacterCardV3 = {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name: data.character?.name || 'Unknown',
        description: data.character?.description,
        personality: data.character?.personality,
        scenario: data.character?.scenario,
        first_mes: data.character?.first_mes,
        mes_example: data.character?.mes_example,
        creator_notes: data.character?.creator_notes,
        system_prompt: data.character?.system_prompt,
        post_history_instructions: data.character?.post_history_instructions,
        tags: data.character?.tags,
        creator: data.character?.creator
      }
    }

    if (options.includeWorldbook && data.worldbook) {
      v3.data.character_book = {
        name: data.worldbook.name,
        description: data.worldbook.description,
        entries: data.worldbook.entries
      }
    }

    if (options.includeExtensions && data.regexScripts) {
      v3.data.extensions = {
        regex_scripts: data.regexScripts
      }
    }

    return v3
  }

  /**
   * 创建SillyTavern扩展格式
   */
  private createSillyTavernFormat(
    data: any,
    options: CharacterCardExportOptions
  ): SillyTavernCharacterCard {
    const st: SillyTavernCharacterCard = {}

    // 角色信息
    if (data.character) {
      st.name = data.character.name
      st.description = data.character.description
      st.personality = data.character.personality
      st.scenario = data.character.scenario
      st.first_mes = data.character.first_mes
      st.mes_example = data.character.mes_example
    }

    // 世界书
    if (options.includeWorldbook && data.worldbook) {
      st.character_book = {
        name: data.worldbook.name,
        description: data.worldbook.description,
        entries: data.worldbook.entries
      }
    }

    // AI设置
    if (options.includeAISettings && data.aiSettings) {
      Object.assign(st, data.aiSettings)
    }

    // 提示词
    if (options.includePrompts && data.prompts) {
      st.prompts = data.prompts
    }

    // 扩展
    if (options.includeExtensions) {
      st.extensions = {}

      if (data.regexScripts) {
        st.extensions.regex_scripts = data.regexScripts
      }
    }

    return st
  }

  /**
   * 导出为PNG
   */
  private async exportAsPNG(
    data: any,
    options: CharacterCardExportOptions
  ): Promise<CharacterCardExportResult> {
    try {
      // 创建V2格式数据
      const v2Data = this.createV2Format(data, options)

      // 生成PNG
      const blob = await createWorldbookPng(v2Data as any, {
        width: options.imageOptions?.width || 512,
        height: options.imageOptions?.height || 512,
        backgroundColor: options.imageOptions?.backgroundColor || '#667eea',
        customImage: options.imageOptions?.customImage
      } as any)

      logger.info('PNG角色卡导出成功', { size: blob.size })

      return {
        success: true,
        format: 'png',
        data: blob,
        size: blob.size
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('PNG导出失败', error)

      return {
        success: false,
        format: 'png',
        size: 0,
        errors: [errorMsg]
      } as any
    }
  }

  /**
   * 下载角色卡
   */
  downloadCharacterCard(
    result: CharacterCardExportResult,
    filename: string
  ): void {
    if (!result.success || !result.data) {
      throw new Error('导出失败，无法下载')
    }

    if (result.format === 'png' && result.data instanceof Blob) {
      downloadPng(result.data, filename)
    } else {
      // JSON格式
      const blob = new Blob([result.data as string], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename.endsWith('.json') ? filename : `${filename}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }
}

/**
 * 创建角色卡导出器实例
 */
export function createCharacterCardExporter(): CharacterCardExporter {
  return new CharacterCardExporter()
}

/**
 * 便捷函数：导出角色卡
 */
export async function exportCharacterCard(
  data: any,
  options: CharacterCardExportOptions
): Promise<CharacterCardExportResult> {
  const exporter = new CharacterCardExporter()
  return exporter.exportCharacterCard(data, options)
}
