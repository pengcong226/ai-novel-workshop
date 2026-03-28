/**
 * 世界书数据迁移工具
 * @module utils/worldbook-migration
 *
 * 将现有的 Character 和 WorldSetting 数据转换为世界书格式
 */

import type {
  Character,
  WorldSetting,
  Location,
  Faction,
  WorldRule,
  PowerSystemSetting,
  Ability,
  Relationship,
  CharacterDevelopment,
  Project
} from '../types'
import type {
  Worldbook,
  WorldbookEntry,
  WorldbookCondition,
  NovelWorkshopWorldbookExtensions
} from '../types/worldbook'

// ============================================================================
// 迁移配置类型
// ============================================================================

/**
 * 迁移选项
 */
export interface MigrationOptions {
  /** 是否保留原数据 */
  preserveOriginal: boolean
  /** 是否用AI生成关键词 */
  useAIForKeywords: boolean
  /** 分类策略 */
  categoryStrategy: 'auto' | 'manual'
  /** 合并策略 */
  mergeStrategy: 'replace' | 'merge'
  /** 是否生成详细日志 */
  verboseLogging: boolean
  /** 是否验证迁移结果 */
  validateResult: boolean
  /** 起始UID */
  startUid?: number
}

/**
 * 迁移结果
 */
export interface MigrationResult {
  /** 是否成功 */
  success: boolean
  /** 迁移的世界书 */
  worldbook?: Worldbook
  /** 迁移的条目列表 */
  entries: WorldbookEntry[]
  /** 迁移统计 */
  statistics: MigrationStatistics
  /** 迁移报告 */
  report: MigrationReport
  /** 错误列表 */
  errors: MigrationError[]
  /** 警告列表 */
  warnings: MigrationWarning[]
}

/**
 * 迁移统计
 */
export interface MigrationStatistics {
  /** 总条目数 */
  totalEntries: number
  /** 角色条目数 */
  characterEntries: number
  /** 地点条目数 */
  locationEntries: number
  /** 势力条目数 */
  factionEntries: number
  /** 规则条目数 */
  ruleEntries: number
  /** 力量体系条目数 */
  powerSystemEntries: number
  /** 跳过的条目数 */
  skippedEntries: number
  /** 总关键词数 */
  totalKeywords: number
  /** 平均内容长度 */
  averageContentLength: number
}

/**
 * 迁移报告
 */
export interface MigrationReport {
  /** 迁移时间 */
  timestamp: Date
  /** 迁移耗时(毫秒) */
  duration: number
  /** 详细日志 */
  logs: MigrationLogEntry[]
  /** 数据完整性检查 */
  integrityCheck?: IntegrityCheckResult
}

/**
 * 迁移日志条目
 */
export interface MigrationLogEntry {
  /** 时间戳 */
  timestamp: Date
  /** 日志级别 */
  level: 'info' | 'warn' | 'error' | 'debug'
  /** 消息 */
  message: string
  /** 相关数据ID */
  sourceId?: string
  /** 相关数据类型 */
  sourceType?: 'character' | 'location' | 'faction' | 'rule' | 'powerSystem'
  /** 生成的条目UID */
  targetUid?: number
}

/**
 * 迁移错误
 */
export interface MigrationError {
  /** 错误类型 */
  type: 'validation' | 'conversion' | 'keyword_generation' | 'unknown'
  /** 错误消息 */
  message: string
  /** 源数据ID */
  sourceId?: string
  /** 源数据类型 */
  sourceType?: string
  /** 原始数据 */
  rawData?: unknown
}

/**
 * 迁移警告
 */
export interface MigrationWarning {
  /** 警告类型 */
  type: 'missing_field' | 'duplicate_key' | 'long_content' | 'low_confidence'
  /** 警告消息 */
  message: string
  /** 源数据ID */
  sourceId?: string
  /** 建议 */
  suggestion?: string
}

/**
 * 数据完整性检查结果
 */
export interface IntegrityCheckResult {
  /** 是否通过 */
  passed: boolean
  /** 检查项结果 */
  checks: IntegrityCheckItem[]
}

/**
 * 数据完整性检查项
 */
export interface IntegrityCheckItem {
  /** 检查项名称 */
  name: string
  /** 是否通过 */
  passed: boolean
  /** 详情 */
  details?: string
}

// ============================================================================
// 默认配置
// ============================================================================

/**
 * 默认迁移选项
 */
export const DEFAULT_MIGRATION_OPTIONS: MigrationOptions = {
  preserveOriginal: true,
  useAIForKeywords: false,
  categoryStrategy: 'auto',
  mergeStrategy: 'merge',
  verboseLogging: true,
  validateResult: true,
  startUid: 0
}

// ============================================================================
// 迁移工具类
// ============================================================================

/**
 * 世界书迁移工具
 */
export class WorldbookMigration {
  private options: MigrationOptions
  private uidCounter: number
  private logs: MigrationLogEntry[] = []
  private errors: MigrationError[] = []
  private warnings: MigrationWarning[] = []
  private startTime: number = 0

  constructor(options: Partial<MigrationOptions> = {}) {
    this.options = { ...DEFAULT_MIGRATION_OPTIONS, ...options }
    this.uidCounter = this.options.startUid ?? 0
  }

  // ============ 公共方法 ============

  /**
   * 迁移整个项目到世界书
   */
  async migrateProjectToWorkbook(
    project: Project,
    options?: Partial<MigrationOptions>
  ): Promise<MigrationResult> {
    if (options) {
      this.options = { ...this.options, ...options }
    }

    this.startTime = Date.now()
    this.logs = []
    this.errors = []
    this.warnings = []

    this.log('info', '开始迁移项目到世界书格式', undefined, undefined)

    try {
      const allEntries: WorldbookEntry[] = []

      // 迁移角色数据
      if (project.characters && project.characters.length > 0) {
        this.log('info', `开始迁移 ${project.characters.length} 个角色`, undefined, undefined)
        for (const character of project.characters) {
          const entries = await this.migrateCharacterToEntry(character)
          allEntries.push(...entries)
        }
      }

      // 迁移世界观数据
      if (project.world) {
        this.log('info', '开始迁移世界观数据', undefined, undefined)
        const worldEntries = await this.migrateWorldSettingToEntries(project.world)
        allEntries.push(...worldEntries)
      }

      // 构建世界书
      const worldbook: Worldbook = {
        name: `${project.title} - 世界书`,
        entries: allEntries,
        metadata: {
          source: 'novel_workshop',
          format: 'v3',
          createdAt: new Date(),
          updatedAt: new Date(),
          totalEntries: allEntries.length,
          description: `从项目 "${project.title}" 迁移生成的世界书`
        }
      }

      // 验证结果
      let integrityCheck: IntegrityCheckResult | undefined
      if (this.options.validateResult) {
        integrityCheck = this.validateMigrationResult(allEntries)
      }

      const duration = Date.now() - this.startTime
      const statistics = this.calculateStatistics(allEntries)

      this.log('info', `迁移完成，共生成 ${allEntries.length} 个条目，耗时 ${duration}ms`)

      return {
        success: this.errors.length === 0,
        worldbook,
        entries: allEntries,
        statistics,
        report: {
          timestamp: new Date(),
          duration,
          logs: this.logs,
          integrityCheck
        },
        errors: this.errors,
        warnings: this.warnings
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.log('error', `迁移失败: ${errorMessage}`)
      this.errors.push({
        type: 'unknown',
        message: errorMessage
      })

      return {
        success: false,
        entries: [],
        statistics: this.calculateStatistics([]),
        report: {
          timestamp: new Date(),
          duration: Date.now() - this.startTime,
          logs: this.logs
        },
        errors: this.errors,
        warnings: this.warnings
      }
    }
  }

  /**
   * 迁移角色数据到世界书条目
   */
  async migrateCharacterToEntry(character: Character): Promise<WorldbookEntry[]> {
    const entries: WorldbookEntry[] = []
    const baseUid = this.getNextUid()

    this.log('debug', `迁移角色: ${character.name}`, character.id, 'character')

    try {
      // 1. 主条目 - 角色基本信息
      const mainEntry = this.createCharacterMainEntry(character, baseUid)
      entries.push(mainEntry)

      // 2. 背景故事条目
      if (character.background) {
        const backgroundEntry = this.createCharacterBackgroundEntry(character, this.getNextUid())
        entries.push(backgroundEntry)
      }

      // 3. 能力条目
      if (character.abilities && character.abilities.length > 0) {
        const abilitiesEntries = this.createCharacterAbilitiesEntries(character)
        entries.push(...abilitiesEntries)
      }

      // 4. 关系条目
      if (character.relationships && character.relationships.length > 0) {
        const relationshipEntries = await this.createCharacterRelationshipEntries(character)
        entries.push(...relationshipEntries)
      }

      // 5. 成长轨迹条目
      if (character.development && character.development.length > 0) {
        const developmentEntries = this.createCharacterDevelopmentEntries(character)
        entries.push(...developmentEntries)
      }

      this.log(
        'info',
        `角色 "${character.name}" 迁移完成，生成 ${entries.length} 个条目`,
        character.id,
        'character'
      )

      return entries
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.log('error', `迁移角色 "${character.name}" 失败: ${errorMessage}`, character.id, 'character')
      this.errors.push({
        type: 'conversion',
        message: `角色迁移失败: ${errorMessage}`,
        sourceId: character.id,
        sourceType: 'character',
        rawData: character
      })
      return []
    }
  }

  /**
   * 迁移世界观数据到世界书条目
   */
  async migrateWorldSettingToEntries(world: WorldSetting): Promise<WorldbookEntry[]> {
    const entries: WorldbookEntry[] = []

    this.log('debug', `迁移世界观: ${world.name}`, world.id, undefined)

    try {
      // 1. 地点条目
      if (world.geography && world.geography.locations) {
        for (const location of world.geography.locations) {
          const locationEntry = this.createLocationEntry(location)
          entries.push(locationEntry)
        }
      }

      // 2. 势力条目
      if (world.factions) {
        for (const faction of world.factions) {
          const factionEntry = this.createFactionEntry(faction)
          entries.push(factionEntry)
        }
      }

      // 3. 规则条目
      if (world.rules) {
        for (const rule of world.rules) {
          const ruleEntry = this.createRuleEntry(rule)
          entries.push(ruleEntry)
        }
      }

      // 4. 力量体系条目
      if (world.powerSystem) {
        const powerSystemEntries = this.createPowerSystemEntries(world.powerSystem)
        entries.push(...powerSystemEntries)
      }

      this.log('info', `世界观 "${world.name}" 迁移完成，生成 ${entries.length} 个条目`)

      return entries
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.log('error', `迁移世界观 "${world.name}" 失败: ${errorMessage}`, world.id, undefined)
      this.errors.push({
        type: 'conversion',
        message: `世界观迁移失败: ${errorMessage}`,
        sourceId: world.id,
        sourceType: 'worldSetting',
        rawData: world
      })
      return []
    }
  }

  // ============ 角色迁移方法 ============

  /**
   * 创建角色主条目
   */
  private createCharacterMainEntry(character: Character, uid: number): WorldbookEntry {
    const content = this.formatCharacterMainContent(character)
    const keys = this.extractCharacterKeywords(character)

    return {
      uid,
      key: keys.primary,
      keysecondary: keys.secondary,
      content,
      comment: `角色: ${character.name}`,
      constant: character.tags?.includes('protagonist') ?? false,
      order: character.tags?.includes('protagonist') ? 100 : 50,
      position: 'before_char',
      disable: false,
      novelWorkshop: this.createCharacterExtensions(character, 'main')
    }
  }

  /**
   * 创建角色背景条目
   */
  private createCharacterBackgroundEntry(character: Character, uid: number): WorldbookEntry {
    const content = this.formatCharacterBackgroundContent(character)

    return {
      uid,
      key: [character.name, ...(character.aliases || [])],
      keysecondary: ['背景', '过去', '经历'],
      content,
      comment: `${character.name} - 背景故事`,
      order: 40,
      position: 'before_char',
      novelWorkshop: this.createCharacterExtensions(character, 'background')
    }
  }

  /**
   * 创建角色能力条目
   */
  private createCharacterAbilitiesEntries(character: Character): WorldbookEntry[] {
    const entries: WorldbookEntry[] = []

    // 创建能力汇总条目
    const abilitiesContent = this.formatCharacterAbilitiesContent(character.abilities)
    const abilitiesEntry: WorldbookEntry = {
      uid: this.getNextUid(),
      key: [character.name],
      keysecondary: ['能力', '技能', '实力'],
      content: abilitiesContent,
      comment: `${character.name} - 能力列表`,
      order: 35,
      position: 'before_char',
      novelWorkshop: this.createCharacterExtensions(character, 'abilities')
    }
    entries.push(abilitiesEntry)

    // 为每个重要能力创建单独条目
    for (const ability of character.abilities) {
      if (ability.description && ability.description.length > 50) {
        const abilityEntry = this.createAbilityEntry(character, ability)
        entries.push(abilityEntry)
      }
    }

    return entries
  }

  /**
   * 创建单个能力条目
   */
  private createAbilityEntry(character: Character, ability: Ability): WorldbookEntry {
    return {
      uid: this.getNextUid(),
      key: [ability.name, `${character.name}的${ability.name}`],
      keysecondary: [character.name, '能力', '技能'],
      content: `【${ability.name}】\n等级: ${ability.level}\n\n${ability.description}`,
      comment: `${character.name} - ${ability.name}`,
      order: 30,
      position: 'before_char',
      novelWorkshop: {
        category: '能力',
        tags: ['角色能力', character.name],
        relatedCharacters: [character.id],
        sourceType: 'imported'
      }
    }
  }

  /**
   * 创建角色关系条目
   */
  private async createCharacterRelationshipEntries(
    character: Character
  ): Promise<WorldbookEntry[]> {
    const entries: WorldbookEntry[] = []

    // 创建关系汇总条目
    const relationshipContent = this.formatCharacterRelationshipsContent(character.relationships)
    const relationshipEntry: WorldbookEntry = {
      uid: this.getNextUid(),
      key: [character.name],
      keysecondary: ['关系', '人际', '亲友'],
      content: relationshipContent,
      comment: `${character.name} - 人际关系`,
      order: 35,
      position: 'before_char',
      novelWorkshop: this.createCharacterExtensions(character, 'relationships')
    }
    entries.push(relationshipEntry)

    return entries
  }

  /**
   * 创建角色成长轨迹条目
   */
  private createCharacterDevelopmentEntries(character: Character): WorldbookEntry[] {
    const entries: WorldbookEntry[] = []

    // 创建成长轨迹汇总条目
    const developmentContent = this.formatCharacterDevelopmentContent(character.development)
    const developmentEntry: WorldbookEntry = {
      uid: this.getNextUid(),
      key: [character.name],
      keysecondary: ['成长', '变化', '经历'],
      content: developmentContent,
      comment: `${character.name} - 成长轨迹`,
      order: 30,
      position: 'before_char',
      novelWorkshop: {
        ...this.createCharacterExtensions(character, 'development'),
        conditions: [
          {
            type: 'character',
            value: character.id,
            operator: 'eq'
          }
        ]
      }
    }
    entries.push(developmentEntry)

    return entries
  }

  // ============ 世界观迁移方法 ============

  /**
   * 创建地点条目
   */
  private createLocationEntry(location: Location): WorldbookEntry {
    const keys = this.extractLocationKeywords(location)
    const content = this.formatLocationContent(location)

    return {
      uid: this.getNextUid(),
      key: keys.primary,
      keysecondary: keys.secondary,
      content,
      comment: `地点: ${location.name}`,
      constant: location.importance === 'high',
      order: location.importance === 'high' ? 60 : location.importance === 'medium' ? 40 : 20,
      position: 'before_char',
      novelWorkshop: {
        category: '地点',
        tags: ['地点', location.type || '其他'],
        relatedLocations: [location.id],
        sourceType: 'imported',
        visualData: location.position
          ? {
              mapPosition: location.position,
              icon: location.icon,
              color: location.color
            }
          : undefined
      }
    }
  }

  /**
   * 创建势力条目
   */
  private createFactionEntry(faction: Faction): WorldbookEntry {
    const keys = this.extractFactionKeywords(faction)
    const content = this.formatFactionContent(faction)

    return {
      uid: this.getNextUid(),
      key: keys.primary,
      keysecondary: keys.secondary,
      content,
      comment: `势力: ${faction.name}`,
      order: 45,
      position: 'before_char',
      novelWorkshop: {
        category: '势力',
        tags: ['势力', faction.type],
        sourceType: 'imported'
      }
    }
  }

  /**
   * 创建规则条目
   */
  private createRuleEntry(rule: WorldRule): WorldbookEntry {
    return {
      uid: this.getNextUid(),
      key: [rule.name],
      keysecondary: ['规则', '定律', '原理'],
      content: `【${rule.name}】\n\n${rule.description}`,
      comment: `规则: ${rule.name}`,
      constant: true,
      order: 70,
      position: 'before_char',
      novelWorkshop: {
        category: '规则',
        tags: ['规则', '世界观'],
        sourceType: 'imported'
      }
    }
  }

  /**
   * 创建力量体系条目
   */
  private createPowerSystemEntries(powerSystem: PowerSystemSetting): WorldbookEntry[] {
    const entries: WorldbookEntry[] = []

    // 主条目
    const mainContent = this.formatPowerSystemContent(powerSystem)
    const mainEntry: WorldbookEntry = {
      uid: this.getNextUid(),
      key: [powerSystem.name],
      keysecondary: ['力量体系', '修炼体系', '等级体系'],
      content: mainContent,
      comment: `力量体系: ${powerSystem.name}`,
      constant: true,
      order: 80,
      position: 'before_char',
      novelWorkshop: {
        category: '力量体系',
        tags: ['力量体系', '修炼'],
        sourceType: 'imported'
      }
    }
    entries.push(mainEntry)

    // 等级条目
    if (powerSystem.levels && powerSystem.levels.length > 0) {
      const levelsContent = this.formatPowerLevelsContent(powerSystem.levels)
      const levelsEntry: WorldbookEntry = {
        uid: this.getNextUid(),
        key: [`${powerSystem.name}等级`, '等级体系'],
        keysecondary: [powerSystem.name],
        content: levelsContent,
        comment: `${powerSystem.name} - 等级体系`,
        order: 75,
        position: 'before_char',
        novelWorkshop: {
          category: '力量体系',
          tags: ['等级', powerSystem.name],
          sourceType: 'imported'
        }
      }
      entries.push(levelsEntry)
    }

    // 技能条目
    if (powerSystem.skills && powerSystem.skills.length > 0) {
      for (const skill of powerSystem.skills) {
        const skillEntry: WorldbookEntry = {
          uid: this.getNextUid(),
          key: [skill.name],
          keysecondary: ['技能', powerSystem.name],
          content: `【${skill.name}】\n\n${skill.description}`,
          comment: `技能: ${skill.name}`,
          order: 25,
          position: 'before_char',
          novelWorkshop: {
            category: '技能',
            tags: ['技能', powerSystem.name],
            sourceType: 'imported'
          }
        }
        entries.push(skillEntry)
      }
    }

    return entries
  }

  // ============ 内容格式化方法 ============

  /**
   * 格式化角色主内容
   */
  private formatCharacterMainContent(character: Character): string {
    const parts: string[] = []

    parts.push(`【${character.name}】\n`)

    // 基本信息
    parts.push(`性别: ${this.formatGender(character.gender)}`)
    parts.push(`年龄: ${character.age}岁`)
    parts.push(`外貌: ${character.appearance}`)

    // 性格
    if (character.personality && character.personality.length > 0) {
      parts.push(`\n性格特点: ${character.personality.join('、')}`)
    }

    // 价值观
    if (character.values && character.values.length > 0) {
      parts.push(`价值观: ${character.values.join('、')}`)
    }

    // 动机
    if (character.motivation) {
      parts.push(`\n核心动机: ${character.motivation}`)
    }

    // 当前状态
    if (character.currentState) {
      parts.push(`\n当前状态:`)
      parts.push(`  位置: ${character.currentState.location}`)
      parts.push(`  状态: ${character.currentState.status}`)
      parts.push(`  势力: ${character.currentState.faction}`)
    }

    // 标签
    if (character.tags && character.tags.length > 0) {
      parts.push(`\n角色定位: ${this.formatTags(character.tags)}`)
    }

    return parts.join('\n')
  }

  /**
   * 格式化角色背景内容
   */
  private formatCharacterBackgroundContent(character: Character): string {
    const parts: string[] = []

    parts.push(`【${character.name} - 背景故事】\n`)
    parts.push(character.background)

    if (character.motivation) {
      parts.push(`\n\n核心动机:\n${character.motivation}`)
    }

    return parts.join('\n')
  }

  /**
   * 格式化角色能力内容
   */
  private formatCharacterAbilitiesContent(abilities: Ability[]): string {
    const parts: string[] = []
    parts.push('【能力列表】\n')

    for (const ability of abilities) {
      parts.push(`\n${ability.name} (${ability.level})`)
      parts.push(`  ${ability.description}`)
    }

    return parts.join('\n')
  }

  /**
   * 格式化角色关系内容
   */
  private formatCharacterRelationshipsContent(relationships: Relationship[]): string {
    const parts: string[] = []
    parts.push('【人际关系】\n')

    for (const rel of relationships) {
      const typeStr = this.formatRelationshipType(rel.type)
      parts.push(`\n${typeStr}: 目标ID ${rel.targetId}`)
      parts.push(`  ${rel.description}`)
      if (rel.startChapter) {
        parts.push(`  始于第${rel.startChapter}章`)
      }
    }

    return parts.join('\n')
  }

  /**
   * 格式化角色成长内容
   */
  private formatCharacterDevelopmentContent(developments: CharacterDevelopment[]): string {
    const parts: string[] = []
    parts.push('【成长轨迹】\n')

    for (const dev of developments) {
      parts.push(`\n第${dev.chapter}章: ${dev.event}`)
      parts.push(`  成长: ${dev.growth}`)

      if (dev.abilityChanges && dev.abilityChanges.length > 0) {
        parts.push('  能力变化:')
        for (const change of dev.abilityChanges) {
          parts.push(`    - ${change.abilityName}: ${change.type}`)
        }
      }

      if (dev.relationshipChanges && dev.relationshipChanges.length > 0) {
        parts.push('  关系变化:')
        for (const change of dev.relationshipChanges) {
          parts.push(`    - 与目标${change.targetId}的关系变为: ${change.newType}`)
        }
      }
    }

    return parts.join('\n')
  }

  /**
   * 格式化地点内容
   */
  private formatLocationContent(location: Location): string {
    const parts: string[] = []

    parts.push(`【${location.name}】\n`)
    parts.push(`重要性: ${this.formatImportance(location.importance)}`)

    if (location.type) {
      parts.push(`类型: ${this.formatLocationType(location.type)}`)
    }

    parts.push(`\n${location.description}`)

    if (location.factionId) {
      parts.push(`\n所属势力: ${location.factionId}`)
    }

    if (location.connections && location.connections.length > 0) {
      parts.push(`\n关联地点: ${location.connections.join(', ')}`)
    }

    return parts.join('\n')
  }

  /**
   * 格式化势力内容
   */
  private formatFactionContent(faction: Faction): string {
    const parts: string[] = []

    parts.push(`【${faction.name}】\n`)
    parts.push(`类型: ${faction.type}`)
    parts.push(`\n${faction.description}`)

    if (faction.relationships && faction.relationships.length > 0) {
      parts.push(`\n关系: ${faction.relationships.join(', ')}`)
    }

    return parts.join('\n')
  }

  /**
   * 格式化力量体系内容
   */
  private formatPowerSystemContent(powerSystem: PowerSystemSetting): string {
    const parts: string[] = []

    parts.push(`【${powerSystem.name}】\n`)
    parts.push(`\n这是世界观的核心力量体系，定义了角色的实力等级和成长路径。`)

    if (powerSystem.levels && powerSystem.levels.length > 0) {
      parts.push(`\n等级体系共${powerSystem.levels.length}个层级。`)
    }

    if (powerSystem.skills && powerSystem.skills.length > 0) {
      parts.push(`\n包含${powerSystem.skills.length}种技能。`)
    }

    if (powerSystem.items && powerSystem.items.length > 0) {
      parts.push(`\n涉及${powerSystem.items.length}种特殊物品。`)
    }

    return parts.join('\n')
  }

  /**
   * 格式化等级内容
   */
  private formatPowerLevelsContent(
    levels: Array<{ name: string; description: string }>
  ): string {
    const parts: string[] = []
    parts.push('【等级体系】\n')

    for (let i = 0; i < levels.length; i++) {
      const level = levels[i]
      parts.push(`\n第${i + 1}阶: ${level.name}`)
      parts.push(`  ${level.description}`)
    }

    return parts.join('\n')
  }

  // ============ 关键词提取方法 ============

  /**
   * 提取角色关键词
   */
  private extractCharacterKeywords(character: Character): {
    primary: string[]
    secondary: string[]
  } {
    const primary: string[] = [character.name]
    const secondary: string[] = []

    // 添加别名
    if (character.aliases && character.aliases.length > 0) {
      primary.push(...character.aliases)
    }

    // 添加标签
    if (character.tags && character.tags.length > 0) {
      secondary.push(...character.tags.map(tag => this.formatTag(tag)))
    }

    // 从背景中提取关键词
    if (character.background) {
      const bgKeywords = this.extractKeywordsFromText(character.background, 3)
      secondary.push(...bgKeywords)
    }

    // 添加能力名称
    if (character.abilities && character.abilities.length > 0) {
      secondary.push(...character.abilities.map(a => a.name).slice(0, 3))
    }

    return {
      primary,
      secondary
    }
  }

  /**
   * 提取地点关键词
   */
  private extractLocationKeywords(location: Location): {
    primary: string[]
    secondary: string[]
  } {
    const primary: string[] = [location.name]
    const secondary: string[] = ['地点']

    if (location.type) {
      secondary.push(this.formatLocationType(location.type))
    }

    if (location.factionId) {
      secondary.push(location.factionId)
    }

    // 从描述中提取关键词
    if (location.description) {
      const descKeywords = this.extractKeywordsFromText(location.description, 2)
      secondary.push(...descKeywords)
    }

    return { primary, secondary }
  }

  /**
   * 提取势力关键词
   */
  private extractFactionKeywords(faction: Faction): {
    primary: string[]
    secondary: string[]
  } {
    const primary: string[] = [faction.name]
    const secondary: string[] = ['势力', faction.type]

    // 从描述中提取关键词
    if (faction.description) {
      const descKeywords = this.extractKeywordsFromText(faction.description, 2)
      secondary.push(...descKeywords)
    }

    return { primary, secondary }
  }

  /**
   * 从文本中提取关键词
   */
  private extractKeywordsFromText(text: string, maxKeywords: number): string[] {
    // 简单的关键词提取：提取长度大于2的词汇
    // 在实际应用中，可以使用更复杂的NLP算法或AI提取
    const keywords: string[] = []

    // 移除标点符号
    const cleaned = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')

    // 分词（简单按空格分割）
    const words = cleaned.split(/\s+/).filter(w => w.length >= 2 && w.length <= 10)

    // 去重
    const uniqueWords = [...new Set(words)]

    // 返回前N个
    return uniqueWords.slice(0, maxKeywords)
  }

  // ============ 辅助方法 ============

  /**
   * 创建角色扩展字段
   */
  private createCharacterExtensions(
    character: Character,
    entryType: string
  ): NovelWorkshopWorldbookExtensions {
    return {
      category: '角色',
      tags: ['角色', character.name, entryType],
      relatedCharacters: [character.id],
      sourceType: 'imported',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  /**
   * 格式化性别
   */
  private formatGender(gender: string): string {
    const genderMap: Record<string, string> = {
      male: '男',
      female: '女',
      other: '其他'
    }
    return genderMap[gender] || gender
  }

  /**
   * 格式化标签
   */
  private formatTags(tags: string[]): string {
    const tagMap: Record<string, string> = {
      protagonist: '主角',
      supporting: '配角',
      antagonist: '反派',
      minor: '次要角色',
      other: '其他'
    }
    return tags.map(tag => tagMap[tag] || tag).join('、')
  }

  /**
   * 格式化标签
   */
  private formatTag(tag: string): string {
    const tagMap: Record<string, string> = {
      protagonist: '主角',
      supporting: '配角',
      antagonist: '反派',
      minor: '次要角色',
      other: '其他'
    }
    return tagMap[tag] || tag
  }

  /**
   * 格式化关系类型
   */
  private formatRelationshipType(type: string): string {
    const typeMap: Record<string, string> = {
      family: '家人',
      friend: '朋友',
      enemy: '敌人',
      lover: '恋人',
      rival: '对手',
      other: '其他'
    }
    return typeMap[type] || type
  }

  /**
   * 格式化重要性
   */
  private formatImportance(importance: string): string {
    const importanceMap: Record<string, string> = {
      high: '高',
      medium: '中',
      low: '低'
    }
    return importanceMap[importance] || importance
  }

  /**
   * 格式化地点类型
   */
  private formatLocationType(type: string): string {
    const typeMap: Record<string, string> = {
      city: '城市',
      town: '城镇',
      village: '村庄',
      mountain: '山脉',
      river: '河流',
      lake: '湖泊',
      forest: '森林',
      desert: '沙漠',
      ocean: '海洋',
      island: '岛屿',
      ruins: '遗迹',
      dungeon: '地下城',
      castle: '城堡',
      temple: '神庙',
      other: '其他'
    }
    return typeMap[type] || type
  }

  /**
   * 获取下一个UID
   */
  private getNextUid(): number {
    return this.uidCounter++
  }

  /**
   * 记录日志
   */
  private log(
    level: MigrationLogEntry['level'],
    message: string,
    sourceId?: string,
    sourceType?: MigrationLogEntry['sourceType'],
    targetUid?: number
  ): void {
    if (!this.options.verboseLogging && level === 'debug') {
      return
    }

    this.logs.push({
      timestamp: new Date(),
      level,
      message,
      sourceId,
      sourceType,
      targetUid
    })
  }

  /**
   * 计算统计信息
   */
  private calculateStatistics(entries: WorldbookEntry[]): MigrationStatistics {
    const stats: MigrationStatistics = {
      totalEntries: entries.length,
      characterEntries: 0,
      locationEntries: 0,
      factionEntries: 0,
      ruleEntries: 0,
      powerSystemEntries: 0,
      skippedEntries: 0,
      totalKeywords: 0,
      averageContentLength: 0
    }

    if (entries.length === 0) {
      return stats
    }

    let totalContentLength = 0

    for (const entry of entries) {
      // 统计分类
      const category = entry.novelWorkshop?.category
      if (category === '角色') stats.characterEntries++
      else if (category === '地点') stats.locationEntries++
      else if (category === '势力') stats.factionEntries++
      else if (category === '规则') stats.ruleEntries++
      else if (category === '力量体系' || category === '技能') stats.powerSystemEntries++

      // 统计关键词
      stats.totalKeywords += entry.key.length
      if (entry.keysecondary) {
        stats.totalKeywords += entry.keysecondary.length
      }

      // 统计内容长度
      totalContentLength += entry.content.length
    }

    stats.averageContentLength = Math.round(totalContentLength / entries.length)

    return stats
  }

  /**
   * 验证迁移结果
   */
  private validateMigrationResult(entries: WorldbookEntry[]): IntegrityCheckResult {
    const checks: IntegrityCheckItem[] = []

    // 检查1: 条目数量
    checks.push({
      name: '条目数量检查',
      passed: entries.length > 0,
      details: entries.length > 0 ? `共${entries.length}个条目` : '没有生成任何条目'
    })

    // 检查2: 必填字段
    let missingFields = 0
    for (const entry of entries) {
      if (!entry.uid && entry.uid !== 0) missingFields++
      if (!entry.key || entry.key.length === 0) missingFields++
      if (!entry.content) missingFields++
    }
    checks.push({
      name: '必填字段检查',
      passed: missingFields === 0,
      details: missingFields === 0 ? '所有必填字段完整' : `${missingFields}个条目缺少必填字段`
    })

    // 检查3: UID唯一性
    const uids = entries.map(e => e.uid)
    const uniqueUids = new Set(uids)
    checks.push({
      name: 'UID唯一性检查',
      passed: uids.length === uniqueUids.size,
      details: uids.length === uniqueUids.size ? '所有UID唯一' : '存在重复UID'
    })

    // 检查4: 关键词有效性
    let emptyKeyCount = 0
    for (const entry of entries) {
      if (!entry.key || entry.key.length === 0 || entry.key.every(k => !k || k.trim() === '')) {
        emptyKeyCount++
      }
    }
    checks.push({
      name: '关键词有效性检查',
      passed: emptyKeyCount === 0,
      details: emptyKeyCount === 0 ? '所有关键词有效' : `${emptyKeyCount}个条目缺少有效关键词`
    })

    // 检查5: 内容长度
    let shortContentCount = 0
    for (const entry of entries) {
      if (entry.content.length < 10) {
        shortContentCount++
      }
    }
    checks.push({
      name: '内容长度检查',
      passed: shortContentCount === 0,
      details: shortContentCount === 0 ? '所有条目内容充足' : `${shortContentCount}个条目内容过短`
    })

    const passed = checks.every(c => c.passed)

    return {
      passed,
      checks
    }
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 迁移角色到世界书条目（便捷函数）
 */
export async function migrateCharacterToEntry(
  character: Character,
  options?: Partial<MigrationOptions>
): Promise<WorldbookEntry[]> {
  const migration = new WorldbookMigration(options)
  return migration.migrateCharacterToEntry(character)
}

/**
 * 迁移世界观数据到世界书条目（便捷函数）
 */
export async function migrateWorldSettingToEntries(
  world: WorldSetting,
  options?: Partial<MigrationOptions>
): Promise<WorldbookEntry[]> {
  const migration = new WorldbookMigration(options)
  return migration.migrateWorldSettingToEntries(world)
}

/**
 * 迁移项目到世界书（便捷函数）
 */
export async function migrateProjectToWorkbook(
  project: Project,
  options?: Partial<MigrationOptions>
): Promise<MigrationResult> {
  const migration = new WorldbookMigration(options)
  return migration.migrateProjectToWorkbook(project)
}

/**
 * 创建空的世界书
 */
export function createEmptyWorldbook(name?: string): Worldbook {
  return {
    name: name || '新世界书',
    entries: [],
    metadata: {
      source: 'novel_workshop',
      format: 'v3',
      createdAt: new Date(),
      updatedAt: new Date(),
      totalEntries: 0
    }
  }
}

/**
 * 合并多个世界书
 */
export function mergeWorldbooks(
  worldbooks: Worldbook[],
  options: {
    conflictResolution?: 'skip' | 'overwrite' | 'merge'
    updateTimestamps?: boolean
  } = {}
): Worldbook {
  const { conflictResolution = 'merge', updateTimestamps = true } = options

  const allEntries: WorldbookEntry[] = []
  const uidMap = new Map<number, WorldbookEntry>()

  let maxUid = 0

  for (const worldbook of worldbooks) {
    for (const entry of worldbook.entries) {
      if (uidMap.has(entry.uid)) {
        // 冲突处理
        if (conflictResolution === 'skip') {
          continue
        } else if (conflictResolution === 'overwrite') {
          uidMap.set(entry.uid, entry)
        } else {
          // merge: 合并内容
          const existing = uidMap.get(entry.uid)!
          existing.content = `${existing.content}\n\n${entry.content}`
          existing.key = [...new Set([...existing.key, ...entry.key])]
          if (entry.keysecondary) {
            existing.keysecondary = [
              ...new Set([...(existing.keysecondary || []), ...entry.keysecondary])
            ]
          }
        }
      } else {
        uidMap.set(entry.uid, { ...entry })
      }

      maxUid = Math.max(maxUid, entry.uid)
    }
  }

  const mergedWorldbook: Worldbook = {
    name: '合并的世界书',
    entries: Array.from(uidMap.values()),
    metadata: {
      source: 'novel_workshop',
      format: 'v3',
      createdAt: new Date(),
      updatedAt: updateTimestamps ? new Date() : undefined,
      totalEntries: uidMap.size,
      description: '由多个世界书合并而成'
    }
  }

  return mergedWorldbook
}

/**
 * 导出迁移报告为文本
 */
export function exportMigrationReportAsText(result: MigrationResult): string {
  const lines: string[] = []

  lines.push('=== 世界书迁移报告 ===\n')

  // 基本信息
  lines.push(`迁移时间: ${result.report.timestamp.toLocaleString()}`)
  lines.push(`耗时: ${result.report.duration}ms`)
  lines.push(`状态: ${result.success ? '成功' : '失败'}\n`)

  // 统计信息
  lines.push('--- 统计信息 ---')
  lines.push(`总条目数: ${result.statistics.totalEntries}`)
  lines.push(`角色条目: ${result.statistics.characterEntries}`)
  lines.push(`地点条目: ${result.statistics.locationEntries}`)
  lines.push(`势力条目: ${result.statistics.factionEntries}`)
  lines.push(`规则条目: ${result.statistics.ruleEntries}`)
  lines.push(`力量体系条目: ${result.statistics.powerSystemEntries}`)
  lines.push(`总关键词数: ${result.statistics.totalKeywords}`)
  lines.push(`平均内容长度: ${result.statistics.averageContentLength}字符\n`)

  // 错误
  if (result.errors.length > 0) {
    lines.push('--- 错误 ---')
    for (const error of result.errors) {
      lines.push(`[${error.type}] ${error.message}`)
      if (error.sourceId) {
        lines.push(`  源ID: ${error.sourceId}`)
      }
    }
    lines.push('')
  }

  // 警告
  if (result.warnings.length > 0) {
    lines.push('--- 警告 ---')
    for (const warning of result.warnings) {
      lines.push(`[${warning.type}] ${warning.message}`)
      if (warning.suggestion) {
        lines.push(`  建议: ${warning.suggestion}`)
      }
    }
    lines.push('')
  }

  // 完整性检查
  if (result.report.integrityCheck) {
    lines.push('--- 完整性检查 ---')
    lines.push(`状态: ${result.report.integrityCheck.passed ? '通过' : '未通过'}`)
    for (const check of result.report.integrityCheck.checks) {
      lines.push(`  ${check.passed ? '✓' : '✗'} ${check.name}: ${check.details || ''}`)
    }
    lines.push('')
  }

  // 日志
  if (result.report.logs.length > 0) {
    lines.push('--- 详细日志 ---')
    for (const log of result.report.logs) {
      const time = log.timestamp.toLocaleTimeString()
      lines.push(`[${time}] [${log.level.toUpperCase()}] ${log.message}`)
    }
  }

  return lines.join('\n')
}
