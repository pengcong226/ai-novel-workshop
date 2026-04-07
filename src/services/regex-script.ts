/**
 * 正则脚本服务
 * @module services/regex-script
 *
 * 提供正则脚本的导入、导出、执行功能
 * 兼容 SillyTavern Regex Scripts 格式
 */

import { v4 as uuidv4 } from 'uuid'
import {
  RegexScript,
  RegexScriptResult,
  RegexScriptExecutionOptions,
  RegexScriptImportOptions,
  RegexScriptExportOptions,
  RegexScriptExecutionReport,
  RegexScriptPlacement
} from '@/types/regex-script'
import { getLogger } from '@/utils/logger'

const logger = getLogger('regex-script')

/**
 * 正则脚本管理器
 */
export class RegexScriptManager {
  private scripts: Map<string, RegexScript> = new Map()

  /**
   * 添加正则脚本
   */
  addScript(script: RegexScript): void {
    this.scripts.set(script.id, script)
    logger.info('正则脚本已添加', { id: script.id, name: script.scriptName })
  }

  /**
   * 删除正则脚本
   */
  removeScript(id: string): boolean {
    const deleted = this.scripts.delete(id)
    if (deleted) {
      logger.info('正则脚本已删除', { id })
    }
    return deleted
  }

  /**
   * 获取正则脚本
   */
  getScript(id: string): RegexScript | undefined {
    return this.scripts.get(id)
  }

  /**
   * 获取所有脚本
   */
  getAllScripts(): RegexScript[] {
    return Array.from(this.scripts.values())
  }

  /**
   * 获取启用的脚本
   */
  getEnabledScripts(): RegexScript[] {
    return this.getAllScripts().filter(script => !script.disabled)
  }

  /**
   * 更新正则脚本
   */
  updateScript(id: string, updates: Partial<RegexScript>): RegexScript | undefined {
    const script = this.scripts.get(id)
    if (!script) return undefined

    const updated = { ...script, ...updates }
    this.scripts.set(id, updated)
    logger.info('正则脚本已更新', { id })
    return updated
  }

  /**
   * 切换脚本状态
   */
  toggleScript(id: string, disabled: boolean): RegexScript | undefined {
    return this.updateScript(id, { disabled })
  }

  /**
   * 导入正则脚本
   */
  async importScripts(
    source: File | string,
    options: RegexScriptImportOptions = {}
  ): Promise<{
    imported: RegexScript[]
    skipped: string[]
    errors: string[]
  }> {
    const {
      overwrite = false,
      skipInvalid = true,
      validateRegex = true,
      defaultDisabled = false
    } = options

    const imported: RegexScript[] = []
    const skipped: string[] = []
    const errors: string[] = []

    try {
      // 解析源数据
      let scripts: Partial<RegexScript>[]

      if (typeof source === 'string') {
        scripts = JSON.parse(source)
      } else {
        const text = await source.text()
        scripts = JSON.parse(text)
      }

      if (!Array.isArray(scripts)) {
        scripts = [scripts]
      }

      // 处理每个脚本
      for (const scriptData of scripts) {
        try {
          // 验证必需字段
          if (!scriptData.scriptName || !scriptData.findRegex) {
            if (skipInvalid) {
              skipped.push(`脚本缺少必需字段: ${scriptData.scriptName || '未命名'}`)
              continue
            }
            throw new Error('脚本缺少必需字段')
          }

          // 验证正则表达式
          if (validateRegex) {
            try {
              this.parseRegexString(scriptData.findRegex)
            } catch (e) {
              const error = `正则表达式无效: ${scriptData.scriptName} - ${e instanceof Error ? e.message : String(e)}`
              if (skipInvalid) {
                skipped.push(error)
                continue
              }
              throw new Error(error)
            }
          }

          // 生成或使用ID
          const id = scriptData.id || uuidv4()

          // 检查是否已存在
          if (!overwrite && this.scripts.has(id)) {
            skipped.push(`脚本已存在: ${scriptData.scriptName}`)
            continue
          }

          // 构建完整脚本
          const script: RegexScript = {
            id,
            scriptName: scriptData.scriptName,
            disabled: scriptData.disabled ?? defaultDisabled,
            runOnEdit: scriptData.runOnEdit ?? false,
            findRegex: scriptData.findRegex,
            trimStrings: scriptData.trimStrings || [],
            replaceString: scriptData.replaceString || '',
            placement: scriptData.placement || [RegexScriptPlacement.AI_MESSAGE_END],
            substituteRegex: scriptData.substituteRegex ?? 0,
            minDepth: scriptData.minDepth ?? null,
            maxDepth: scriptData.maxDepth ?? null,
            markdownOnly: scriptData.markdownOnly ?? false,
            promptOnly: scriptData.promptOnly ?? false,
            extensions: scriptData.extensions
          }

          this.addScript(script)
          imported.push(script)
        } catch (e) {
          const error = `导入脚本失败: ${scriptData.scriptName || '未命名'} - ${e instanceof Error ? e.message : String(e)}`
          errors.push(error)
          logger.error(error, e)
        }
      }

      logger.info('正则脚本导入完成', {
        imported: imported.length,
        skipped: skipped.length,
        errors: errors.length
      })

      return { imported, skipped, errors }
    } catch (e) {
      const error = `解析脚本文件失败: ${e instanceof Error ? e.message : String(e)}`
      errors.push(error)
      logger.error(error, e)
      return { imported, skipped, errors }
    }
  }

  /**
   * 导出正则脚本
   */
  exportScripts(options: RegexScriptExportOptions = {}): string {
    const {
      enabledOnly = false,
      includeExtensions = true,
      _format = 'json',
      pretty = true
    } = options as any

    let scripts = this.getAllScripts()

    if (enabledOnly) {
      scripts = scripts.filter(s => !s.disabled)
    }

    if (!includeExtensions) {
      scripts = scripts.map(({ extensions, ...script }) => script) as RegexScript[]
    }

    const data = scripts.length === 1 ? scripts[0] : scripts

    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  }

  /**
   * 执行正则脚本
   */
  execute(
    text: string,
    options: RegexScriptExecutionOptions = {}
  ): RegexScriptExecutionReport {
    const startTime = Date.now()
    const results: RegexScriptResult[] = []
    let currentText = text

    // 获取要执行的脚本
    let scripts = options.onlyRunIds
      ? options.onlyRunIds.map(id => this.scripts.get(id)).filter(Boolean) as RegexScript[]
      : this.getEnabledScripts()

    if (options.skipIds) {
      scripts = scripts.filter(s => !options.skipIds?.includes(s.id))
    }

    // 过滤脚本
    scripts = scripts.filter(script => {
      // 检查禁用状态
      if (script.disabled) return false

      // 检查应用位置
      if (options.placement !== undefined) {
        if (!script.placement.includes(options.placement)) return false
      }

      // 检查深度
      if (options.depth !== undefined) {
        if (script.minDepth !== null && options.depth < script.minDepth) return false
        if (script.maxDepth !== null && options.depth > script.maxDepth) return false
      }

      // 检查环境
      if (script.markdownOnly && !options.isMarkdown) return false
      if (script.promptOnly && !options.isPrompt) return false

      // 检查编辑模式
      if (!script.runOnEdit && options.isEdit) return false

      return true
    })

    // 按优先级排序
    scripts.sort((a, b) => {
      const aPriority = a.extensions?.priority ?? 0
      const bPriority = b.extensions?.priority ?? 0
      return bPriority - aPriority
    })

    // 执行每个脚本
    for (const script of scripts) {
      const result = this.executeScript(script, currentText)
      results.push(result)

      if (result.matched) {
        currentText = result.replacedText
      }
    }

    const endTime = Date.now()
    const totalTime = endTime - startTime

    // 计算性能统计
    const matchedResults = results.filter(r => r.matched)
    const errorResults = results.filter(r => r.error)
    const executionTimes = results.map(r => r.executionTime)

    return {
      totalTime,
      executedCount: results.length,
      matchedCount: matchedResults.length,
      errorCount: errorResults.length,
      results,
      performance: {
        averageTime: executionTimes.length > 0
          ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
          : 0,
        maxTime: Math.max(...executionTimes, 0),
        minTime: Math.min(...executionTimes, 0),
        totalMatches: results.reduce((sum, r) => sum + r.matchCount, 0)
      }
    }
  }

  /**
   * 执行单个正则脚本
   */
  private executeScript(script: RegexScript, text: string): RegexScriptResult {
    const startTime = Date.now()
    const result: RegexScriptResult = {
      matched: false,
      scriptId: script.id,
      scriptName: script.scriptName,
      originalText: text,
      replacedText: text,
      matchCount: 0,
      executionTime: 0
    }

    try {
      // 解析正则表达式
      const regex = this.parseRegexString(script.findRegex)

      // 执行替换
      let replacedText = text
      let matchCount = 0

      // 处理 trimStrings
      if (script.trimStrings && script.trimStrings.length > 0) {
        for (const trimStr of script.trimStrings) {
          replacedText = replacedText.split(trimStr).join('')
        }
      }

      // 执行正则替换
      if (script.replaceString !== undefined) {
        replacedText = replacedText.replace(regex, (_match, ...groups) => {
          matchCount++
          // 替换捕获组引用 ($1, $2, etc.)
          return script.replaceString.replace(/\$(\d+)/g, (_str, num) => {
            return groups[num - 1] || ''
          })
        })
      }

      result.replacedText = replacedText
      result.matched = matchCount > 0
      result.matchCount = matchCount
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e)
      logger.error('正则脚本执行失败', { scriptId: script.id, error: result.error })
    }

    result.executionTime = Date.now() - startTime
    return result
  }

  /**
   * 解析正则表达式字符串
   * 格式: /pattern/flags
   */
  private parseRegexString(regexString: string): RegExp {
    // 检查是否是 /pattern/flags 格式
    const match = regexString.match(/^\/(.*)\/([gimsuy]*)$/)

    if (match) {
      const pattern = match[1]
      const flags = match[2]
      return new RegExp(pattern, flags)
    }

    // 否则直接作为模式
    return new RegExp(regexString)
  }

  /**
   * 清空所有脚本
   */
  clear(): void {
    this.scripts.clear()
    logger.info('所有正则脚本已清空')
  }

  /**
   * 获取脚本数量
   */
  get count(): number {
    return this.scripts.size
  }
}

/**
 * 创建正则脚本管理器实例
 */
export function createRegexScriptManager(): RegexScriptManager {
  return new RegexScriptManager()
}
