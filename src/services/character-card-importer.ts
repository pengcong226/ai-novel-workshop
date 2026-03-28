/**
 * 角色卡导入服务
 * @module services/character-card-importer
 *
 * 支持导入：
 * - Character Card V1 (Legacy)
 * - Character Card V2
 * - Character Card V3
 * - SillyTavern扩展格式
 * - PNG格式角色卡
 */

import type {
  CharacterCardV1,
  CharacterCardV2,
  CharacterCardV3,
  SillyTavernCharacterCard,
  CharacterCardImportOptions,
  CharacterCardImportResult,
  CharacterBookEntry,
  RegexScript,
  PromptConfig
} from '@/types/character-card'
import { getLogger } from '@/utils/logger'
import { parsePngCard } from './png-parser'

const logger = getLogger('character-card-importer')

/**
 * 角色卡导入器
 */
export class CharacterCardImporter {
  /**
   * 导入角色卡
   */
  async importCharacterCard(
    source: File | string | any,
    options: CharacterCardImportOptions = {}
  ): Promise<CharacterCardImportResult> {
    const {
      importWorldbook = true,
      importRegexScripts = true,
      importPrompts = true,
      importAISettings = true,
      importExtensions = true
    } = options

    try {
      // 解析源数据
      let data: any

      if (typeof source === 'string') {
        // JSON字符串
        data = JSON.parse(source)
      } else if (source instanceof File) {
        // File对象
        const text = await source.text()
        data = JSON.parse(text)
      } else {
        // 已经是解析好的对象
        data = source
      }

      // 检测格式
      const format = this.detectFormat(data)
      logger.info('检测到角色卡格式', { format })

      // 解析角色卡
      const result = await this.parseCharacterCard(data, format, options)
      result.success = true

      logger.info('角色卡导入成功', {
        format,
        hasWorldbook: !!result.worldbook,
        hasRegexScripts: !!result.regexScripts,
        hasPrompts: !!result.prompts
      })

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('角色卡导入失败', error)

      return {
        success: false,
        format: 'v1',
        errors: [errorMsg]
      }
    }
  }

  /**
   * 检测角色卡格式
   */
  private detectFormat(data: any): 'v1' | 'v2' | 'v3' | 'sillytavern' {
    // V2/V3格式
    if (data.spec === 'chara_card_v2') {
      return 'v2'
    }
    if (data.spec === 'chara_card_v3') {
      return 'v3'
    }

    // SillyTavern扩展格式（包含温度、提示词等设置）
    if (
      data.temperature !== undefined ||
      data.prompts ||
      data.extensions?.regex_scripts ||
      data.extensions?.tavern_helper
    ) {
      return 'sillytavern'
    }

    // V1格式
    if (data.name || data.char_name) {
      return 'v1'
    }

    throw new Error('无法识别的角色卡格式')
  }

  /**
   * 解析角色卡
   */
  private async parseCharacterCard(
    data: any,
    format: 'v1' | 'v2' | 'v3' | 'sillytavern',
    options: CharacterCardImportOptions
  ): Promise<CharacterCardImportResult> {
    const result: CharacterCardImportResult = {
      success: false,
      format
    }

    switch (format) {
      case 'v1':
        await this.parseV1(data, result, options)
        break
      case 'v2':
        await this.parseV2(data, result, options)
        break
      case 'v3':
        await this.parseV3(data, result, options)
        break
      case 'sillytavern':
        await this.parseSillyTavern(data, result, options)
        break
    }

    return result
  }

  /**
   * 解析V1格式
   */
  private async parseV1(
    data: CharacterCardV1,
    result: CharacterCardImportResult,
    options: CharacterCardImportOptions
  ): Promise<void> {
    // 角色基本信息
    result.character = {
      name: data.name || data.char_name || 'Unknown',
      description: data.description || data.char_persona,
      personality: data.personality,
      scenario: data.scenario,
      first_mes: data.first_mes || data.char_greeting,
      mes_example: data.mes_example,
      creator_notes: data.creator_notes,
      system_prompt: data.system_prompt,
      post_history_instructions: data.post_history_instructions,
      tags: data.tags,
      creator: data.creator
    }

    // 世界书
    if (options.importWorldbook && data.character_book) {
      result.worldbook = {
        imported: true,
        entriesCount: data.character_book.entries?.length || 0,
        entries: data.character_book.entries
      }
    }
  }

  /**
   * 解析V2格式
   */
  private async parseV2(
    data: CharacterCardV2,
    result: CharacterCardImportResult,
    options: CharacterCardImportOptions
  ): Promise<void> {
    const char = data.data

    // 角色基本信息
    result.character = {
      name: char.name || 'Unknown',
      description: char.description,
      personality: char.personality,
      scenario: char.scenario,
      first_mes: char.first_mes,
      mes_example: char.mes_example,
      creator_notes: char.creator_notes,
      system_prompt: char.system_prompt,
      post_history_instructions: char.post_history_instructions,
      tags: char.tags,
      creator: char.creator
    }

    // 世界书
    if (options.importWorldbook && char.character_book) {
      result.worldbook = {
        imported: true,
        entriesCount: char.character_book.entries?.length || 0,
        entries: char.character_book.entries
      }
    }

    // 扩展
    if (options.importExtensions && char.extensions) {
      // 正则脚本
      if (char.extensions.regex_scripts) {
        result.regexScripts = {
          imported: true,
          count: char.extensions.regex_scripts.length,
          scripts: char.extensions.regex_scripts
        }
      }
    }
  }

  /**
   * 解析V3格式
   */
  private async parseV3(
    data: CharacterCardV3,
    result: CharacterCardImportResult,
    options: CharacterCardImportOptions
  ): Promise<void> {
    const char = data.data

    logger.info('parseV3 - 原始数据', {
      角色名: char.name,
      是否有character_book: !!char.character_book,
      character_book类型: typeof char.character_book,
      character_book_entries类型: typeof char.character_book?.entries,
      character_book_entries长度: char.character_book?.entries?.length
    })

    // 角色基本信息
    result.character = {
      name: char.name || 'Unknown',
      description: char.description,
      personality: char.personality,
      scenario: char.scenario,
      first_mes: char.first_mes,
      mes_example: char.mes_example,
      creator_notes: char.creator_notes,
      system_prompt: char.system_prompt,
      post_history_instructions: char.post_history_instructions,
      tags: char.tags,
      creator: char.creator
    }

    // 世界书
    if (options.importWorldbook && char.character_book) {
      logger.info('parseV3 - 提取世界书', {
        条目数: char.character_book.entries?.length || 0,
        前3个条目: char.character_book.entries?.slice(0, 3).map((e: any, i: number) => ({
          index: i,
          keys长度: (e.keys || e.key || []).length,
          content长度: e.content?.length,
          content前50字符: e.content?.substring(0, 50)
        }))
      })

      result.worldbook = {
        imported: true,
        entriesCount: char.character_book.entries?.length || 0,
        entries: char.character_book.entries
      }
    }

    // 扩展
    if (options.importExtensions && char.extensions) {
      // 正则脚本
      if (char.extensions.regex_scripts) {
        result.regexScripts = {
          imported: true,
          count: char.extensions.regex_scripts.length,
          scripts: char.extensions.regex_scripts
        }
      }
    }
  }

  /**
   * 解析SillyTavern扩展格式
   */
  private async parseSillyTavern(
    data: SillyTavernCharacterCard,
    result: CharacterCardImportResult,
    options: CharacterCardImportOptions
  ): Promise<void> {
    // 角色基本信息
    if (data.data) {
      // V2/V3 格式在 data 字段中
      const char = data.data as any
      result.character = {
        name: char.name || 'Unknown',
        description: char.description,
        personality: char.personality,
        scenario: char.scenario,
        first_mes: char.first_mes,
        mes_example: char.mes_example,
        creator_notes: char.creator_notes,
        system_prompt: char.system_prompt,
        post_history_instructions: char.post_history_instructions,
        tags: char.tags,
        creator: char.creator
      }

      // 世界书
      if (options.importWorldbook && char.character_book) {
        result.worldbook = {
          imported: true,
          entriesCount: char.character_book.entries?.length || 0,
          entries: char.character_book.entries
        }
      }

      // 扩展
      if (options.importExtensions && char.extensions) {
        if (char.extensions.regex_scripts) {
          result.regexScripts = {
            imported: true,
            count: char.extensions.regex_scripts.length,
            scripts: char.extensions.regex_scripts
          }
        }
      }
    } else {
      // V1 格式的直接字段
      result.character = {
        name: data.name || 'Unknown',
        description: data.description,
        personality: data.personality,
        scenario: data.scenario,
        first_mes: data.first_mes,
        mes_example: data.mes_example
      }

      // 世界书
      if (options.importWorldbook && data.character_book) {
        result.worldbook = {
          imported: true,
          entriesCount: data.character_book.entries?.length || 0,
          entries: data.character_book.entries
        }
      }
    }

    // AI设置
    if (options.importAISettings) {
      result.aiSettings = {
        temperature: data.temperature,
        frequency_penalty: data.frequency_penalty,
        presence_penalty: data.presence_penalty,
        top_p: data.top_p,
        top_k: data.top_k,
        top_a: data.top_a,
        min_p: data.min_p,
        repetition_penalty: data.repetition_penalty,
        stream_openai: data.stream_openai,
        function_calling: data.function_calling
      }
    }

    // 提示词
    if (options.importPrompts && data.prompts) {
      result.prompts = {
        imported: true,
        count: data.prompts.length,
        prompts: data.prompts
      }
    }

    // 扩展中的正则脚本
    if (options.importRegexScripts && data.extensions?.regex_scripts) {
      result.regexScripts = {
        imported: true,
        count: data.extensions.regex_scripts.length,
        scripts: data.extensions.regex_scripts
      }
    }
  }

  /**
   * 从PNG导入角色卡
   */
  async importFromPNG(
    file: File,
    options: CharacterCardImportOptions = {}
  ): Promise<CharacterCardImportResult> {
    try {
      // 大小检查
      const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`文件过大（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）`)
      }

      // 使用增强的PNG解析器
      const buffer = await file.arrayBuffer()
      const parsed = await parsePngCard(buffer)

      // 根据解析结果格式化
      if (parsed.kind === 'character') {
        // 角色卡格式 - 即使没有世界书也可以导入
        return this.importCharacterCard(parsed.raw, options)
      } else if (parsed.kind === 'worldbook') {
        // 纯世界书格式
        const result: CharacterCardImportResult = {
          success: true,
          format: 'v1'
        }

        if (options.importWorldbook) {
          result.worldbook = {
            imported: true,
            entriesCount: parsed.data?.entries?.length || 0,
            entries: parsed.data?.entries
          }
        }

        return result
      }

      throw new Error('PNG文件不包含角色卡或世界书数据')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('PNG导入失败', error)

      return {
        success: false,
        format: 'v1',
        errors: [errorMsg]
      }
    }
  }

  /**
   * 验证角色卡数据
   */
  validateCharacterCard(data: any): {
    valid: boolean
    errors: string[]
    warnings: string[]
  } {
    const errors: string[] = []
    const warnings: string[] = []

    // 检查必需字段
    const name = data.name || data.data?.name || data.char_name
    if (!name) {
      errors.push('缺少角色名称')
    }

    // 检查V2/V3格式
    if (data.spec === 'chara_card_v2' && data.spec_version !== '2.0') {
      warnings.push('V2格式版本号不匹配')
    }
    if (data.spec === 'chara_card_v3' && !data.spec_version?.startsWith('3.')) {
      warnings.push('V3格式版本号不匹配')
    }

    // 检查世界书条目
    const entries = data.character_book?.entries || data.data?.character_book?.entries || []
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry.content) {
        warnings.push(`条目 ${entry.uid || i} 缺少内容`)
      }
      if (!entry.uid) {
        warnings.push(`条目 ${i} 缺少UID`)
      }
    }

    // 检查正则脚本
    const scripts = data.extensions?.regex_scripts || data.data?.extensions?.regex_scripts || []
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i]
      if (!script.findRegex) {
        errors.push(`正则脚本 ${script.scriptName || i} 缺少正则表达式`)
      }
      try {
        // 验证正则表达式
        const regexStr = script.findRegex
        if (regexStr.startsWith('/') && regexStr.match(/\/[gimsuy]*$/)) {
          // /pattern/flags 格式
          const match = regexStr.match(/^\/(.*)\/([gimsuy]*)$/)
          if (match) {
            new RegExp(match[1], match[2])
          }
        } else {
          // 纯pattern格式
          new RegExp(regexStr)
        }
      } catch (e) {
        errors.push(`正则脚本 ${script.scriptName || i} 的正则表达式无效: ${e}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }
}

/**
 * 创建角色卡导入器实例
 */
export function createCharacterCardImporter(): CharacterCardImporter {
  return new CharacterCardImporter()
}

/**
 * 便捷函数：导入角色卡
 */
export async function importCharacterCard(
  source: File | string,
  options?: CharacterCardImportOptions
): Promise<CharacterCardImportResult> {
  const importer = new CharacterCardImporter()
  return importer.importCharacterCard(source, options)
}
