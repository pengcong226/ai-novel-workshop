import { useProjectStore } from '@/stores/project'
import { useAIStore } from '@/stores/ai'
import { useTaskManager } from '@/stores/taskManager'
import { v4 as uuidv4 } from 'uuid'
import type { Chapter } from '@/types'
import { buildChapterContext, contextToPromptPayload } from '@/utils/contextBuilder'
import { extendOutlineWithLLM } from '@/utils/llm/outlineGenerator'
import { extractEntitiesWithAI, analyzeRelationships } from '@/utils/characterExtractor'
import { importMemory, exportMemory, updateMemoryFromChapter } from '@/utils/tableMemory'
import { mergeSystemPrompts } from '@/utils/systemPrompts'
import { runStateUpdatePipeline } from '@/services/state-updater'
import type { ChatMessage } from '@/types/ai'
import { ElMessage } from 'element-plus'

export interface BatchGenerationOptions {
  startChapter: number
  count: number
  autoSave: boolean
  autoUpdateSettings: boolean
}

function buildGenerationOptions(advancedSettings?: {
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

export class GenerationScheduler {
  
  private isBatchCancelled = false

  public cancelBatchGeneration() {
    this.isBatchCancelled = true
  }

  public async runExtractionInBackground(chapter: Chapter) {
    const taskManager = useTaskManager()
    const task = taskManager.createTask({
      title: `设定抽取: 第${chapter.number}章`,
      description: '正在分析事件与人物关系...',
      cancellable: false
    })

    try {
      await this.updateProjectSettings(chapter)
      
      // V3: 增量状态追踪（提取器 + 验证器 + 应用器）
      const projectStore = useProjectStore()
      const project = projectStore.currentProject
      if (project && project.characters.length > 0) {
        taskManager.updateTask(task.id, { description: '正在执行增量状态追踪与验证...' })
        try {
          const result = await runStateUpdatePipeline(
            chapter.content,
            project.characters,
            chapter.number
          )
          if (result.rejectedShifts.length > 0) {
            taskManager.addToast(
              `第${chapter.number}章：拒绝了 ${result.rejectedShifts.length} 条幻觉状态变更`,
              'warning'
            )
          }
          if (result.appliedShifts.length > 0) {
            taskManager.addToast(
              `第${chapter.number}章：已追踪 ${result.appliedShifts.length} 项状态变更`,
              'info'
            )
          }
        } catch (stateErr) {
          console.warn('[StateUpdater] 状态追踪失败，不影响主流程:', stateErr)
        }
      }
      
      await projectStore.saveCurrentProject()
      
      taskManager.completeTask(task.id, '抽取与记忆入库成功')
      taskManager.addToast(`第${chapter.number}章事件已成功载入系统记忆树 🌲`, 'success')
    } catch (err) {
      console.error('设定提取失败:', err)
      taskManager.failTask(task.id, err instanceof Error ? err.message : String(err))
    }
  }

  private async updateProjectSettings(chapter: Chapter) {
    const projectStore = useProjectStore()
    const project = projectStore.currentProject
    if (!project) return

    if (!project.config?.enableZeroTouchExtraction) return

    // 1. 全量提取实体（人物、词条、分水岭事件）
    const entities = await extractEntitiesWithAI(chapter.content)
    
    // 2. 无缝入库新角色
    if (entities && entities.characters.length > 0) {
      entities.characters.forEach(nc => {
        const existing = project.characters.find(c => c.name === nc.name)
        if (!existing) {
          project.characters.push({
            id: uuidv4(),
            name: nc.name,
            aliases: [],
            gender: 'other',
            age: 0,
            appearance: '',
            personality: [],
            values: [],
            background: nc.description,
            motivation: '',
            abilities: [],
            relationships: [],
            appearances: [],
            development: [],
            tags: [nc.role],
            stateHistory: [],
            aiGenerated: true
          })
        }
      })
      
      // 增量分析并更新关系图
      const allText = project.chapters.map(c => c.content).join('\n\n')
      const extChars = project.characters.map((c: any) => ({ name: c.name }))
      const relations = analyzeRelationships(allText, extChars as any)
      
      relations.forEach(rel => {
        const sourceChar = project.characters.find(c => c.name === rel.from)
        const targetChar = project.characters.find(c => c.name === rel.to)
        if (sourceChar && targetChar) {
          const existingRel = sourceChar.relationships.find(r => r.targetId === targetChar.id)
          if (!existingRel) {
            sourceChar.relationships.push({
              targetId: targetChar.id,
              type: 'other',
              description: '共现关系',
              evolution: []
            })
          }
        }
      })
    }

    // 3. 零触感录入世界体系 (Worldbook)
    if (entities && entities.worldbook.length > 0) {
      if (!project.worldbook) {
        project.worldbook = { entries: [] }
      }
      entities.worldbook.forEach(wb => {
        const existing = project.worldbook!.entries.find(e => e.key.includes(wb.keyword))
        if (!existing) {
          project.worldbook!.entries.push({
            uid: Date.now() + Math.floor(Math.random() * 1000), // ST规范使用数字uid
            key: [wb.keyword],
            content: wb.content,
            novelWorkshop: {
              category: wb.category
            }
          })
        }
      })
    }

    // 4. 重大历史转折点打标 (记录到章节关键事件中)
    if (entities && entities.events.length > 0) {
      const highImpactEvents = entities.events.filter(e => e.importance >= 4).map(e => `[影响力 ${e.importance}/10] ` + e.description)
      if (highImpactEvents.length > 0) {
        if (!chapter.summaryData) {
          chapter.summaryData = {
            id: uuidv4(),
            chapterNumber: chapter.number,
            title: chapter.title,
            summary: chapter.title,
            keyEvents: [],
            characters: [],
            locations: [],
            plotProgression: '',
            wordCount: chapter.wordCount,
            summaryWordCount: 0,
            tokenCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            detail: 'minimal' as any
          }
        }
        chapter.summaryData.keyEvents = [
          ...(chapter.summaryData.keyEvents || []),
          ...highImpactEvents
        ]
      }
    }

    // 2. 提取表格记忆指令并更新
    if (project.memory) {
      let memorySystem = importMemory(project.memory)
      
      const aiExtractFunction = async (content: string, memory: any) => {
        const aiStore = useAIStore()
        if (!aiStore.checkInitialized()) return []
        
        const prompts = mergeSystemPrompts(project.config?.systemPrompts)
        
        const tablesText = memory.sheets.filter((s: any) => s.enable && s.tochat).map((s: any) => {
          return `表名: ${s.name}\n列: ${s.hashSheet[0].map((id: string) => s.cells.get(id)?.value || '').join(',')}`
        }).join('\n\n')
        
        if (!tablesText) return []

        const prompt = `分析以下小说章节内容，如果有需要更新到表格的状态变化、新物品、新人物等，请输出更新命令。
【严格输出格式】
每行必须是一条独立的命令，且必须以 "表名:" 开头！不要输出任何其他废话和Markdown标记！
正确示例：
角色状态:updateRow(1, "林风", "剑修", "山洞", "重伤", "铁剑")

当前存在的表格结构：
${tablesText}

章节内容：
${content}`
        
        const messages: ChatMessage[] = [
          { role: 'system', content: prompts.memory },
          { role: 'user', content: prompt }
        ]
        
        try {
          const res = await aiStore.chat(messages, { type: 'check', complexity: 'low', priority: 'speed' }, { maxTokens: 1000 })
          return res.content.split('\n').filter(line => line.trim().length > 0)
        } catch (err) {
          console.warn('提取记忆表更新命令失败', err)
          return []
        }
      }

      memorySystem = await updateMemoryFromChapter(memorySystem, chapter, aiExtractFunction)
      project.memory = exportMemory(memorySystem)
    }
  }

  public async executeBatchGeneration(options: BatchGenerationOptions) {
    const projectStore = useProjectStore()
    const aiStore = useAIStore()
    const taskManager = useTaskManager()

    const currentProject = projectStore.currentProject
    if (!currentProject || !aiStore.checkInitialized()) {
      throw new Error('系统未初始化或项目未加载')
    }

    this.isBatchCancelled = false

    const batchTask = taskManager.createTask({
      title: '批量章节生成',
      description: '初始化生成环境...',
      cancellable: true,
      onCancel: () => this.cancelBatchGeneration()
    })

    try {
      for (let i = 0; i < options.count; i++) {
        if (this.isBatchCancelled) {
          taskManager.failTask(batchTask.id, '已被用户手动终止')
          break
        }

        const chapterNumber = options.startChapter + i
        const progress = Math.round((i / options.count) * 100)
        
        taskManager.updateTask(batchTask.id, { 
          progress, 
          description: `正在处理第 ${chapterNumber} 章 (${i+1}/${options.count})`
        })

        // ================= 滚动大纲生成检测 =================
        const currentOutlineLength = currentProject.outline.chapters.length
        if (currentOutlineLength > 0 && chapterNumber >= currentOutlineLength - 4) {
          taskManager.updateTask(batchTask.id, { description: `即将耗尽大纲, AI 正在续写 ${currentOutlineLength + 1} 到 ${currentOutlineLength + 20} 段大纲` })
          try {
            const newOutlines = await extendOutlineWithLLM(currentProject, currentOutlineLength + 1, 20)
            if (newOutlines && newOutlines.length > 0) {
              currentProject.outline.chapters.push(...newOutlines)
              const lastVolume = currentProject.outline.volumes[currentProject.outline.volumes.length - 1]
              if (lastVolume) lastVolume.endChapter += newOutlines.length
              await projectStore.saveCurrentProject()
              taskManager.addToast(`大纲自动翻页成功！扩展了 ${newOutlines.length} 章路线`, 'success')
            }
          } catch (err) {
            console.error('[批量生成] 大纲续写失败:', err)
            taskManager.addToast('大纲自动翻页失败，将强行生成', 'warning')
          }
        }
        // ===================================================

        // 获取或构建当前章结构
        let existingChapter = currentProject.chapters.find(c => c.number === chapterNumber)
        const chapterData: Chapter = existingChapter ? {
          ...existingChapter,
          content: '',
          wordCount: 0,
          generatedBy: 'ai' as const,
          generationTime: new Date()
        } : {
          id: uuidv4(),
          number: chapterNumber,
          title: `第${chapterNumber}章`,
          content: '',
          wordCount: 0,
          summary: '',
          outline: {
            chapterId: uuidv4(),
            title: `第${chapterNumber}章`,
            scenes: [],
            characters: [],
            location: '',
            goals: [],
            conflicts: [],
            resolutions: [],
            foreshadowingToPlant: [],
            foreshadowingToResolve: [],
            status: 'planned'
          },
          status: 'draft',
          generatedBy: 'ai' as const,
          generationTime: new Date(),
          checkpoints: [],
          aiSuggestions: []
        }

        // 构建上下文
        taskManager.updateTask(batchTask.id, { description: `正在编织第 ${chapterNumber} 章记忆矩阵...` })
        const context = await buildChapterContext(currentProject, chapterData)
        
        const targetWords = currentProject.config?.advancedSettings?.targetWordCount || 2000
        const promptPayload = contextToPromptPayload(context, chapterData.title, targetWords)
        
        if (context.warnings.length > 0) {
          taskManager.addToast(`第 ${chapterNumber} 章上下文截断: ${context.warnings[0]}`, 'warning')
        }

        const aiContext = { type: 'chapter' as const, complexity: 'high' as const, priority: 'quality' as const }
        const generationOptions = buildGenerationOptions(currentProject.config?.advancedSettings)
        
        let finalContent = ''
        const maxRetries = 3

        // V3-fix: messages 放在循环外，让重试时的对话修复上下文不被丢弃
        const messages: ChatMessage[] = [
          { role: 'system', content: promptPayload.systemMessage },
          { role: 'user', content: promptPayload.userMessage }
        ]

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          taskManager.updateTask(batchTask.id, { description: `[${context.totalTokens} Tokens] 核心推理中${attempt > 1 ? ` (第${attempt}次修正重试)` : ''}...` })
          
          chapterData.content = ''
          let response
          try {
            response = await aiStore.chatStream(
              messages,
              (event) => {
                if (event.type === 'chunk' && event.chunk) {
                  chapterData.content += event.chunk
                }
              },
              aiContext,
              generationOptions
            )
          } catch (streamError) {
            console.warn(`[批量生成] 第 ${chapterNumber} 章流式失败，回退普通模式:`, streamError)
            taskManager.updateTask(batchTask.id, { description: `流式被降级，重连执行后备通道...` })
            response = await aiStore.chat(messages, aiContext, generationOptions)
          }
          
          finalContent = response.content.trim()

          // ================= 吃书预警与修复拦截层 =================
          if (currentProject.config?.enableLogicValidator) {
            const { validateChapterLogic } = await import('@/utils/llm/antiRetconValidator')
            taskManager.updateTask(batchTask.id, { description: `正在启动哨兵模型，侦测吃书与逻辑矛盾...` })
            
            const vResult = await validateChapterLogic(currentProject, chapterData.outline, finalContent)
            
            if (!vResult.passed) {
              const warnMsg = `第 ${chapterNumber} 章触发吃书警告: ${vResult.reason}`
              taskManager.addToast(warnMsg, 'warning')
              console.warn(warnMsg)
              
              if (attempt < maxRetries) {
                // V3：不重写全文，发送对话式反馈让模型局部修补
                messages.push(
                  { role: 'assistant', content: finalContent },
                  { role: 'user', content: `【校验系统检测到一致性错误】\n驳回理由：${vResult.reason}\n\n修复指令：${vResult.suggestedFixPrompt}\n\n请仅修正上述错误，输出修正后的完整章节正文。保留无问题的部分不变。` }
                )
                continue
              } else {
                taskManager.addToast(`第 ${chapterNumber} 章反复冲突，已达到容错上限，强制放行`, 'error')
              }
            }
          }
          
          break
        }
        
        chapterData.content = finalContent
        chapterData.wordCount = chapterData.content.length

        // Plugins and Post Processing
        const { usePluginStore } = await import('@/stores/plugin')
        const pluginStore = usePluginStore()
        const processorRegistry = pluginStore.getRegistries().processor
        try {
          const postResult = await processorRegistry.processPipeline(
            'post-generation',
            { chapter: chapterData, project: currentProject },
            { project: currentProject, chapter: chapterData, config: currentProject.config }
          )
          if (postResult && postResult.chapter && postResult.chapter.content) {
            chapterData.content = postResult.chapter.content
            chapterData.wordCount = chapterData.content.length
          }
        } catch (err) { console.error(err) }

        // Quality Check
        if (currentProject.config?.enableQualityCheck) {
          try {
            const { createQualityChecker } = await import('@/utils/qualityChecker')
            const checker = createQualityChecker(currentProject.world, currentProject.characters, currentProject.outline, currentProject.config)
            const report = await checker.checkChapter(chapterData)
            chapterData.qualityScore = report.overallScore
          } catch(e) {}
        }

        // 保存更新 (调用单章代理保存接口以释放内存并实时落盘)
        if (options.autoSave) {
          await projectStore.saveChapter(chapterData)
        } else {
          // 如果没有开启 autoSave，就只是放在内存里骨架里（这里需要当心内容丢失）
          // 但是如果是批量生成通常都会存的，保险起见我们还是走持久化防泄漏
          await projectStore.saveChapter(chapterData)
        }

        if (options.autoUpdateSettings) {
          // 不 await，直接抛到背景队列里由 TaskManager 消化
          this.runExtractionInBackground(chapterData)
        }

        // Delay between chunks to respect API limits
        if (i < options.count - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      if (!this.isBatchCancelled) {
        taskManager.completeTask(batchTask.id, `成功生成 ${options.count} 个章节`)
        ElMessage.success(`批量生成游历完成！产出 ${options.count} 章纯度百分百的内容。`)
      }
    } catch (error) {
      console.error('[批量生成] 失败:', error)
      taskManager.failTask(batchTask.id, error instanceof Error ? error.message : String(error))
    }
  }
}

export const generationScheduler = new GenerationScheduler()
