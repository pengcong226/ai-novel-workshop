import { v4 as uuidv4 } from 'uuid'
import type { NovelTemplate, Project, WorldSetting, Character, Outline, ChapterOutline, PlotTemplate } from '@/types'
import { getBuiltInTemplates } from './builtInTemplates'

/**
 * 模板管理器
 */
export class TemplateManager {
  private static instance: TemplateManager
  private templates: Map<string, NovelTemplate> = new Map()
  private storageKey = 'ai-novel-templates'

  private constructor() {
    this.loadTemplates()
  }

  static getInstance(): TemplateManager {
    if (!TemplateManager.instance) {
      TemplateManager.instance = new TemplateManager()
    }
    return TemplateManager.instance
  }

  /**
   * 加载所有模板（内置 + 用户自定义）
   */
  private loadTemplates(): void {
    // 加载内置模板
    const builtIn = getBuiltInTemplates()
    builtIn.forEach(template => {
      this.templates.set(template.meta.id, template)
    })

    // 加载用户自定义模板
    try {
      const stored = localStorage.getItem(this.storageKey)
      if (stored) {
        const userTemplates: NovelTemplate[] = JSON.parse(stored)
        userTemplates.forEach(template => {
          this.templates.set(template.meta.id, template)
        })
      }
    } catch (error) {
      console.error('Failed to load user templates:', error)
    }
  }

  /**
   * 保存用户模板到本地存储
   */
  private saveUserTemplates(): void {
    try {
      const userTemplates = Array.from(this.templates.values()).filter(
        t => t.meta.author !== 'System'
      )
      localStorage.setItem(this.storageKey, JSON.stringify(userTemplates))
    } catch (error) {
      console.error('Failed to save user templates:', error)
    }
  }

  /**
   * 获取所有模板
   */
  getAllTemplates(): NovelTemplate[] {
    return Array.from(this.templates.values())
  }

  /**
   * 按分类获取模板
   */
  getTemplatesByCategory(category: string): NovelTemplate[] {
    return this.getAllTemplates().filter(t => t.meta.category === category)
  }

  /**
   * 搜索模板
   */
  searchTemplates(query: string): NovelTemplate[] {
    const lowerQuery = query.toLowerCase()
    return this.getAllTemplates().filter(t =>
      t.meta.name.toLowerCase().includes(lowerQuery) ||
      t.meta.description.toLowerCase().includes(lowerQuery) ||
      t.meta.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    )
  }

  /**
   * 获取模板
   */
  getTemplate(id: string): NovelTemplate | undefined {
    return this.templates.get(id)
  }

  /**
   * 从项目创建模板
   */
  createFromProject(project: Project, templateName: string, author: string): NovelTemplate {
    const template: NovelTemplate = {
      meta: {
        id: uuidv4(),
        name: templateName,
        version: '1.0.0',
        author: author,
        description: `基于项目"${project.title}"创建的模板`,
        tags: [project.genre],
        category: this.detectCategory(project.genre) as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        rating: 0,
        downloads: 0
      },
      worldTemplate: project.world,
      characterTemplates: project.characters.map((char, index) => ({
        role: index === 0 ? 'protagonist' : 'supporting',
        template: char,
        description: `${char.name}模板`
      })),
      plotTemplate: {
        structure: this.detectStructure(project.outline),
        volumes: project.outline.volumes.map(v => ({
          number: v.number,
          title: v.title,
          theme: v.theme,
          chapterRange: {
            start: v.startChapter,
            end: v.endChapter
          },
          mainEvents: v.mainEvents,
          plotPoints: []
        })),
        totalChapters: project.outline.chapters.length,
        description: project.outline.synopsis
      },
      styleTemplate: {
        tone: '严肃',
        narrativePerspective: '第三人称',
        dialogueStyle: '简洁',
        descriptionLevel: '适中'
      },
      promptTemplates: {
        worldGeneration: '',
        characterGeneration: '',
        chapterGeneration: ''
      },
      configTemplate: project.config,
      exampleChapters: project.chapters.slice(0, 3).map(ch => ({
        title: ch.title,
        content: ch.content.substring(0, 1000)
      }))
    }

    return template
  }

  /**
   * 保存模板
   */
  saveTemplate(template: NovelTemplate): void {
    template.meta.updatedAt = new Date()
    this.templates.set(template.meta.id, template)
    this.saveUserTemplates()
  }

  /**
   * 删除模板
   */
  deleteTemplate(id: string): boolean {
    const template = this.templates.get(id)
    if (template && template.meta.author !== 'System') {
      this.templates.delete(id)
      this.saveUserTemplates()
      return true
    }
    return false
  }

  /**
   * 应用模板到项目
   */
  applyTemplate(templateId: string, projectTitle: string, projectDescription: string): Partial<Project> {
    const template = this.templates.get(templateId)
    if (!template) {
      throw new Error(`Template not found: ${templateId}`)
    }

    const now = new Date()

    // 生成世界观
    const world: WorldSetting = {
      id: uuidv4(),
      name: template.worldTemplate.name || '未命名世界',
      era: template.worldTemplate.era || {
        time: '未知时代',
        techLevel: '未知',
        socialForm: '未知'
      },
      geography: template.worldTemplate.geography || {
        locations: []
      },
      powerSystem: template.worldTemplate.powerSystem,
      factions: template.worldTemplate.factions || [],
      rules: template.worldTemplate.rules || [],
      aiGenerated: false
    }

    // 生成人物
    const characters: Character[] = template.characterTemplates.map((ct, index) => ({
      id: uuidv4(),
      name: ct.template.name || `角色${index + 1}`,
      aliases: ct.template.aliases || [],
      gender: ct.template.gender || 'other',
      age: ct.template.age || 0,
      appearance: ct.template.appearance || '',
      personality: ct.template.personality || [],
      values: ct.template.values || [],
      background: ct.template.background || '',
      motivation: ct.template.motivation || '',
      abilities: ct.template.abilities || [],
      tags: ct.template.tags || [],
      stateHistory: [],
      powerLevel: ct.template.powerLevel,
      relationships: [],
      appearances: [],
      development: [],
      aiGenerated: false
    }))

    // 生成大纲
    const outline: Outline = {
      id: uuidv4(),
      synopsis: template.plotTemplate.description,
      theme: '',
      mainPlot: {
        id: uuidv4(),
        name: '主线',
        description: template.plotTemplate.description
      },
      subPlots: [],
      volumes: template.plotTemplate.volumes.map(vt => ({
        id: uuidv4(),
        number: vt.number,
        title: vt.title,
        theme: vt.theme,
        startChapter: vt.chapterRange.start,
        endChapter: vt.chapterRange.end,
        mainEvents: vt.mainEvents
      })),
      chapters: this.generateChapterOutlines(template.plotTemplate),
      foreshadowings: []
    }

    return {
      title: projectTitle,
      description: projectDescription,
      genre: template.meta.tags[0] || 'other',
      targetWords: template.plotTemplate.totalChapters * 3000, // 假设每章3000字
      currentWords: 0,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      world,
      characters,
      outline,
      chapters: [],
      config: {
        preset: template.configTemplate?.preset || 'standard',
        providers: template.configTemplate?.providers || [],
        plannerModel: template.configTemplate?.plannerModel || '',
        writerModel: template.configTemplate?.writerModel || '',
        sentinelModel: template.configTemplate?.sentinelModel || '',
        extractorModel: template.configTemplate?.extractorModel || '',
        systemPrompts: template.configTemplate?.systemPrompts,
        planningDepth: template.configTemplate?.planningDepth || 'medium',
        writingDepth: template.configTemplate?.writingDepth || 'standard',
        enableQualityCheck: template.configTemplate?.enableQualityCheck ?? true,
        qualityThreshold: template.configTemplate?.qualityThreshold || 7,
        maxCostPerChapter: template.configTemplate?.maxCostPerChapter || 0.1,
        enableAISuggestions: template.configTemplate?.enableAISuggestions ?? true,
        enableVectorRetrieval: true
      }
    }
  }

  /**
   * 生成章节大纲
   */
  private generateChapterOutlines(plotTemplate: PlotTemplate): ChapterOutline[] {
    const chapters: ChapterOutline[] = []
    let chapterNumber = 1

    for (const volume of plotTemplate.volumes) {
      for (let i = volume.chapterRange.start; i <= volume.chapterRange.end; i++) {
        chapters.push({
          chapterId: uuidv4(),
          title: `第${chapterNumber}章`,
          scenes: [],
          characters: [],
          location: '',
          goals: [],
          conflicts: [],
          resolutions: [],
          status: 'planned'
        })
        chapterNumber++
      }
    }

    return chapters
  }

  /**
   * 检测小说类型
   */
  private detectCategory(genre: string): string {
    const categoryMap: Record<string, string> = {
      '玄幻': 'fantasy',
      '都市': 'urban',
      '科幻': 'scifi',
      '武侠': 'wuxia',
      '历史': 'history'
    }
    return categoryMap[genre] || 'other'
  }

  /**
   * 检测故事结构
   */
  private detectStructure(outline: Outline): string {
    if (outline.volumes.length === 0) return '三幕结构'
    if (outline.volumes.length === 3) return '三幕结构'
    if (outline.volumes.length === 4) return '起承转合'
    return '英雄之旅'
  }

  /**
   * 导出模板为JSON
   */
  exportTemplate(templateId: string): string | null {
    const template = this.templates.get(templateId)
    if (!template) return null

    return JSON.stringify(template, null, 2)
  }

  /**
   * 导入模板从JSON
   */
  importTemplate(json: string): boolean {
    try {
      const template: NovelTemplate = JSON.parse(json)

      // 验证模板结构
      if (!template.meta || !template.worldTemplate || !template.plotTemplate) {
        throw new Error('Invalid template structure')
      }

      // 生成新ID避免冲突
      template.meta.id = uuidv4()
      template.meta.createdAt = new Date()
      template.meta.updatedAt = new Date()

      this.saveTemplate(template)
      return true
    } catch (error) {
      console.error('Failed to import template:', error)
      return false
    }
  }

  /**
   * 获取模板统计信息
   */
  getTemplateStats(templateId: string): {
    worldSettingCount: number
    characterCount: number
    chapterCount: number
    volumeCount: number
  } | null {
    const template = this.templates.get(templateId)
    if (!template) return null

    return {
      worldSettingCount: template.worldTemplate.factions?.length || 0,
      characterCount: template.characterTemplates.length,
      chapterCount: template.plotTemplate.totalChapters,
      volumeCount: template.plotTemplate.volumes.length
    }
  }
}

// 导出单例
export const templateManager = TemplateManager.getInstance()
