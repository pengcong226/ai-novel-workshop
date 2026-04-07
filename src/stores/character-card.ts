/**
 * 角色卡状态管理
 * @module stores/character-card
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  SillyTavernCharacterCard,
  CharacterBookEntry,
  RegexScript,
  PromptConfig,
  CharacterCardImportOptions,
  CharacterCardExportOptions
} from '@/types/character-card'
import { createCharacterCardImporter } from '@/services/character-card-importer'
import { createCharacterCardExporter } from '@/services/character-card-exporter'
import { getLogger } from '@/utils/logger'

const logger = getLogger('character-card:store')

/**
 * 角色卡Store
 */
export const useCharacterCardStore = defineStore('characterCard', () => {
  // ============ 状态 ============

  /** 角色基本信息 */
  const character = ref<SillyTavernCharacterCard>({})

  /** AI设置 */
  const aiSettings = ref({
    temperature: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    top_p: 0.9,
    top_k: 500,
    top_a: 0,
    min_p: 0,
    repetition_penalty: 1,
    stream_openai: false,
    function_calling: true
  })

  /** 提示词列表 */
  const prompts = ref<PromptConfig[]>([])

  /** 正则脚本 */
  const regexScripts = ref<RegexScript[]>([])

  /** 世界书条目 */
  const worldbookEntries = ref<CharacterBookEntry[]>([])

  /** 加载状态 */
  const loading = ref(false)

  /** 错误信息 */
  const error = ref<string | null>(null)

  /** 当前项目ID */
  const projectId = ref<string | null>(null)

  // ============ 计算属性 ============

  /** 角色名 */
  const characterName = computed(() => {
    return character.value.name || character.value.data?.name || 'Unknown'
  })

  /** 世界书条目数 */
  const worldbookCount = computed(() => worldbookEntries.value.length)

  /** 启用的世界书条目数 */
  const enabledWorldbookCount = computed(() =>
    worldbookEntries.value.filter(e => !e.disable).length
  )

  /** 常量世界书条目数 */
  const constantWorldbookCount = computed(() =>
    worldbookEntries.value.filter(e => e.constant).length
  )

  /** 正则脚本数 */
  const regexScriptCount = computed(() => regexScripts.value.length)

  /** 启用的正则脚本数 */
  const enabledRegexScriptCount = computed(() =>
    regexScripts.value.filter(s => !s.disabled).length
  )

  /** 提示词数 */
  const promptCount = computed(() => prompts.value.length)

  /** 启用的提示词数 */
  const enabledPromptCount = computed(() =>
    prompts.value.filter(p => p.enabled !== false).length
  )

  // ============ 导入方法 ============

  /**
   * 导入角色卡
   */
  async function importCharacterCard(
    source: File | string,
    options: CharacterCardImportOptions = {}
  ): Promise<void> {
    loading.value = true
    error.value = null

    try {
      const importer = createCharacterCardImporter()
      const result = await importer.importCharacterCard(source, options)

      if (!result.success) {
        throw new Error(result.errors?.join(', ') || '导入失败')
      }

      // 导入角色信息
      if (result.character) {
        character.value = {
          ...character.value,
          name: result.character.name,
          description: result.character.description,
          personality: result.character.personality,
          scenario: result.character.scenario,
          first_mes: result.character.first_mes,
          mes_example: result.character.mes_example
        }
      }

      // 导入世界书
      if (result.worldbook?.imported && result.worldbook.entries) {
        worldbookEntries.value = result.worldbook.entries
      }

      // 导入正则脚本
      if (result.regexScripts?.imported && result.regexScripts.scripts) {
        regexScripts.value = result.regexScripts.scripts
      }

      // 导入提示词
      if (result.prompts?.imported && result.prompts.prompts) {
        prompts.value = result.prompts.prompts
      }

      // 导入AI设置
      if (result.aiSettings) {
        aiSettings.value = {
          ...aiSettings.value,
          ...result.aiSettings
        }
      }

      logger.info('角色卡导入成功', {
        hasWorldbook: !!result.worldbook,
        hasRegexScripts: !!result.regexScripts,
        hasPrompts: !!result.prompts
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      error.value = errorMsg
      logger.error('角色卡导入失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 从PNG导入角色卡
   */
  async function importFromPNG(
    file: File,
    options: CharacterCardImportOptions = {}
  ): Promise<void> {
    loading.value = true
    error.value = null

    try {
      const importer = createCharacterCardImporter()
      const result = await importer.importFromPNG(file, options)

      if (!result.success) {
        throw new Error(result.errors?.join(', ') || 'PNG导入失败')
      }

      // 导入角色信息
      if (result.character) {
        character.value = {
          ...character.value,
          name: result.character.name,
          description: result.character.description,
          personality: result.character.personality,
          scenario: result.character.scenario,
          first_mes: result.character.first_mes,
          mes_example: result.character.mes_example
        }
      }

      // 导入世界书
      if (result.worldbook?.imported && result.worldbook.entries) {
        worldbookEntries.value = result.worldbook.entries
      }

      // 导入正则脚本
      if (result.regexScripts?.imported && result.regexScripts.scripts) {
        regexScripts.value = result.regexScripts.scripts
      }

      // 导入提示词
      if (result.prompts?.imported && result.prompts.prompts) {
        prompts.value = result.prompts.prompts
      }

      // 导入AI设置
      if (result.aiSettings) {
        aiSettings.value = {
          ...aiSettings.value,
          ...result.aiSettings
        }
      }

      logger.info('PNG角色卡导入成功')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      error.value = errorMsg
      logger.error('PNG导入失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  // ============ 导出方法 ============

  /**
   * 导出角色卡
   */
  async function exportCharacterCard(
    options: CharacterCardExportOptions
  ): Promise<Blob | string> {
    loading.value = true
    error.value = null

    try {
      const exporter = createCharacterCardExporter()
      const result = await exporter.exportCharacterCard(
        {
          character: {
            name: character.value.name || '',
            description: character.value.description,
            personality: character.value.personality,
            scenario: character.value.scenario,
            first_mes: character.value.first_mes,
            mes_example: character.value.mes_example
          },
          worldbook: {
            entries: worldbookEntries.value
          },
          regexScripts: regexScripts.value,
          prompts: prompts.value,
          aiSettings: aiSettings.value
        },
        options
      )

      if (!result.success) {
        throw new Error('导出失败')
      }

      logger.info('角色卡导出成功', { format: options.format })

      return result.data!
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      error.value = errorMsg
      logger.error('角色卡导出失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 下载角色卡
   */
  async function downloadCharacterCard(
    filename: string,
    options: CharacterCardExportOptions
  ): Promise<void> {
    try {
      const exporter = createCharacterCardExporter()
      const result = await exporter.exportCharacterCard(
        {
          character: {
            name: character.value.name || '',
            description: character.value.description,
            personality: character.value.personality,
            scenario: character.value.scenario,
            first_mes: character.value.first_mes,
            mes_example: character.value.mes_example
          },
          worldbook: {
            entries: worldbookEntries.value
          },
          regexScripts: regexScripts.value,
          prompts: prompts.value,
          aiSettings: aiSettings.value
        },
        options
      )

      if (!result.success) {
        throw new Error('导出失败')
      }

      exporter.downloadCharacterCard(result, filename)

      logger.info('角色卡下载成功', { filename, format: options.format })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      error.value = errorMsg
      logger.error('角色卡下载失败', err)
      throw err
    }
  }

  // ============ 管理方法 ============

  /**
   * 更新角色信息
   */
  function updateCharacter(updates: Partial<SillyTavernCharacterCard>): void {
    character.value = {
      ...character.value,
      ...updates
    }
  }

  /**
   * 更新AI设置
   */
  function updateAISettings(updates: Partial<typeof aiSettings.value>): void {
    aiSettings.value = {
      ...aiSettings.value,
      ...updates
    }
  }

  /**
   * 添加世界书条目
   */
  function addWorldbookEntry(entry: Partial<CharacterBookEntry>): void {
    const maxUid = Math.max(0, ...worldbookEntries.value.map(e => e.uid))
    worldbookEntries.value.push({
      uid: maxUid + 1,
      key: entry.key || [],
      keysecondary: entry.keysecondary || [],
      content: entry.content || '',
      comment: entry.comment,
      constant: entry.constant ?? false,
      disable: entry.disable ?? false,
      selective: entry.selective ?? false,
      order: entry.order ?? 0,
      position: entry.position ?? 0,
      depth: entry.depth ?? 4,
      probability: entry.probability,
      useProbability: entry.useProbability,
      displayIndex: entry.displayIndex,
      extensions: entry.extensions
    })
  }

  /**
   * 更新世界书条目
   */
  function updateWorldbookEntry(uid: number, updates: Partial<CharacterBookEntry>): void {
    const index = worldbookEntries.value.findIndex(e => e.uid === uid)
    if (index !== -1) {
      worldbookEntries.value[index] = {
        ...worldbookEntries.value[index],
        ...updates
      }
    }
  }

  /**
   * 删除世界书条目
   */
  function deleteWorldbookEntry(uid: number): void {
    const index = worldbookEntries.value.findIndex(e => e.uid === uid)
    if (index !== -1) {
      worldbookEntries.value.splice(index, 1)
    }
  }

  /**
   * 添加正则脚本
   */
  function addRegexScript(script: Partial<RegexScript>): void {
    regexScripts.value.push({
      id: script.id || crypto.randomUUID(),
      scriptName: script.scriptName || '新脚本',
      disabled: script.disabled ?? false,
      runOnEdit: script.runOnEdit ?? false,
      findRegex: script.findRegex || '',
      trimStrings: script.trimStrings || [],
      replaceString: script.replaceString || '',
      placement: script.placement || [2],
      substituteRegex: script.substituteRegex ?? 0,
      minDepth: script.minDepth ?? null,
      maxDepth: script.maxDepth ?? null,
      markdownOnly: script.markdownOnly ?? false,
      promptOnly: script.promptOnly ?? false
    })
  }

  /**
   * 更新正则脚本
   */
  function updateRegexScript(id: string, updates: Partial<RegexScript>): void {
    const index = regexScripts.value.findIndex(s => s.id === id)
    if (index !== -1) {
      regexScripts.value[index] = {
        ...regexScripts.value[index],
        ...updates
      }
    }
  }

  /**
   * 删除正则脚本
   */
  function deleteRegexScript(id: string): void {
    const index = regexScripts.value.findIndex(s => s.id === id)
    if (index !== -1) {
      regexScripts.value.splice(index, 1)
    }
  }

  /**
   * 清空所有数据
   */
  function clear(): void {
    character.value = {}
    aiSettings.value = {
      temperature: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      top_p: 0.9,
      top_k: 500,
      top_a: 0,
      min_p: 0,
      repetition_penalty: 1,
      stream_openai: false,
      function_calling: true
    }
    prompts.value = []
    regexScripts.value = []
    worldbookEntries.value = []
    logger.info('角色卡数据已清空')
  }

  return {
    // 状态
    character,
    aiSettings,
    prompts,
    regexScripts,
    worldbookEntries,
    loading,
    error,
    projectId,

    // 计算属性
    characterName,
    worldbookCount,
    enabledWorldbookCount,
    constantWorldbookCount,
    regexScriptCount,
    enabledRegexScriptCount,
    promptCount,
    enabledPromptCount,

    // 导入方法
    importCharacterCard,
    importFromPNG,

    // 导出方法
    exportCharacterCard,
    downloadCharacterCard,

    // 管理方法
    updateCharacter,
    updateAISettings,
    addWorldbookEntry,
    updateWorldbookEntry,
    deleteWorldbookEntry,
    addRegexScript,
    updateRegexScript,
    deleteRegexScript,
    clear
  }
})
