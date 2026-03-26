import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type {
  Suggestion,
  SuggestionStatus,
  SuggestionType,
  SuggestionCategory,
  SuggestionPriority,
  SuggestionFilter,
  SuggestionStatistics,
  SuggestionQueueConfig,
  SuggestionQueueItem,
  SuggestionTriggerEvent,
  SuggestionRule,
  DEFAULT_QUEUE_CONFIG
} from '@/types/suggestions'

const STORAGE_KEY = 'ai-novel-suggestions'

const chapterDetailPattern = /^\/chapters\/\d+$/
const characterDetailPattern = /^\/characters\/[^/]+$/

function normalizeNavigateTarget(target?: string): string | undefined {
  if (!target) return target

  const trimmedTarget = target.trim().replace(/^#/, '')

  if (trimmedTarget === '/chapters') {
    return '/chapters'
  }

  if (chapterDetailPattern.test(trimmedTarget)) {
    return trimmedTarget
  }

  if (characterDetailPattern.test(trimmedTarget)) {
    return trimmedTarget
  }

  if (trimmedTarget === 'chapters') {
    return '/chapters'
  }

  if (/^chapters\/\d+$/.test(trimmedTarget)) {
    return `/${trimmedTarget}`
  }

  if (/^characters\/[^/]+$/.test(trimmedTarget)) {
    return `/${trimmedTarget}`
  }

  return target
}

function normalizeSuggestionActions(actions?: Suggestion['actions']): Suggestion['actions'] {
  if (!actions) return actions

  return actions.map(action => {
    if (action.type !== 'navigate') {
      return action
    }

    return {
      ...action,
      navigateTarget: normalizeNavigateTarget(action.navigateTarget)
    }
  })
}

export const useSuggestionsStore = defineStore('suggestions', () => {
  // 状态
  const suggestions = ref<Suggestion[]>([])
  const queue = ref<SuggestionQueueItem[]>([])
  const config = ref<SuggestionQueueConfig>({
    maxLength: 50,
    similarityThreshold: 0.8,
    autoExpireTime: 7 * 24 * 60 * 60 * 1000,
    highPriorityInterval: 5 * 60 * 1000,
    mediumPriorityInterval: 30 * 60 * 1000,
    lowPriorityInterval: 2 * 60 * 60 * 1000,
    idleThreshold: 30 * 60 * 1000
  })
  const rules = ref<SuggestionRule[]>([
    {
      id: 'chapter_complete_check',
      name: '章节完成检查',
      trigger: 'chapter_save',
      enabled: true,
      cooldown: 10 * 60 * 1000 // 10分钟
    },
    {
      id: 'character_conflict_check',
      name: '人物冲突检查',
      trigger: 'character_update',
      enabled: true,
      cooldown: 15 * 60 * 1000 // 15分钟
    },
    {
      id: 'idle_reminder',
      name: '空闲提醒',
      trigger: 'idle',
      enabled: true,
      cooldown: 60 * 60 * 1000 // 1小时
    }
  ])

  const lastActivity = ref<Date>(new Date())
  const isInitialized = ref(false)

  // 计算属性
  const unreadCount = computed(() =>
    suggestions.value.filter(s => s.status === 'unread').length
  )

  const highPriorityCount = computed(() =>
    suggestions.value.filter(s => s.priority === 'high' && s.status === 'unread').length
  )

  const pendingQueue = computed(() => {
    const now = new Date()
    return queue.value
      .filter(item => item.nextPushTime <= now)
      .sort((a, b) => b.score - a.score)
  })

  const statistics = computed((): SuggestionStatistics => {
    const stats: SuggestionStatistics = {
      total: suggestions.value.length,
      byStatus: {
        unread: 0,
        read: 0,
        adopted: 0,
        ignored: 0
      },
      byType: {
        improvement: 0,
        issue: 0,
        question: 0
      },
      byCategory: {
        consistency: 0,
        quality: 0,
        optimization: 0,
        problem: 0,
        reminder: 0
      },
      byPriority: {
        low: 0,
        medium: 0,
        high: 0
      },
      adoptionRate: 0,
      adoptionTrend: [],
      avgResponseTime: 0
    }

    let totalProcessed = 0
    let totalAdopted = 0
    let totalResponseTime = 0

    suggestions.value.forEach(s => {
      stats.byStatus[s.status]++
      stats.byType[s.type]++
      stats.byCategory[s.category]++
      stats.byPriority[s.priority]++

      if (s.status === 'adopted' || s.status === 'ignored') {
        totalProcessed++
        if (s.status === 'adopted') {
          totalAdopted++
        }
        // 计算响应时间
        const responseTime = s.updatedAt.getTime() - s.createdAt.getTime()
        totalResponseTime += responseTime
      }
    })

    stats.adoptionRate = totalProcessed > 0
      ? Math.round((totalAdopted / totalProcessed) * 100)
      : 0
    stats.avgResponseTime = totalProcessed > 0
      ? Math.round(totalResponseTime / totalProcessed)
      : 0

    // 计算近7天采纳趋势
    const now = new Date()
    stats.adoptionTrend = Array.from({ length: 7 }, (_, i) => {
      const dayStart = new Date(now)
      dayStart.setDate(dayStart.getDate() - (6 - i))
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setHours(23, 59, 59, 999)

      return suggestions.value.filter(s =>
        s.status === 'adopted' &&
        s.updatedAt >= dayStart &&
        s.updatedAt <= dayEnd
      ).length
    })

    return stats
  })

  // 初始化
  function init() {
    if (isInitialized.value) return
    loadFromStorage()
    startPeriodicCheck()
    isInitialized.value = true
  }

  // 从存储加载
  function loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (data) {
        const parsed = JSON.parse(data)
        suggestions.value = (parsed.suggestions || []).map((s: Suggestion) => ({
          ...s,
          actions: normalizeSuggestionActions(s.actions),
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
          expiresAt: s.expiresAt ? new Date(s.expiresAt) : undefined
        }))
        if (parsed.config) {
          config.value = parsed.config
        }
        if (parsed.rules) {
          rules.value = parsed.rules.map((r: SuggestionRule) => ({
            ...r,
            lastTriggered: r.lastTriggered ? new Date(r.lastTriggered) : undefined
          }))
        }
      }
    } catch (e) {
      console.error('[SuggestionsStore] 加载存储失败:', e)
    }
  }

  // 保存到存储
  function saveToStorage() {
    try {
      const data = {
        suggestions: suggestions.value,
        config: config.value,
        rules: rules.value
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.error('[SuggestionsStore] 保存存储失败:', e)
    }
  }

  // 启动定期检查
  function startPeriodicCheck() {
    // 每分钟检查一次过期建议和空闲提醒
    setInterval(() => {
      cleanExpiredSuggestions()
      checkIdleReminder()
    }, 60 * 1000)
  }

  // 清理过期建议
  function cleanExpiredSuggestions() {
    const now = new Date()
    const before = suggestions.value.length
    suggestions.value = suggestions.value.filter(s =>
      !s.expiresAt || s.expiresAt > now
    )
    if (suggestions.value.length < before) {
      saveToStorage()
    }
  }

  // 检查空闲提醒
  function checkIdleReminder() {
    const idleRule = rules.value.find(r => r.id === 'idle_reminder' && r.enabled)
    if (!idleRule) return

    const now = new Date()
    const idleTime = now.getTime() - lastActivity.value.getTime()

    if (idleTime >= config.value.idleThreshold) {
      // 检查冷却时间
      if (idleRule.lastTriggered) {
        const timeSinceLastTrigger = now.getTime() - idleRule.lastTriggered.getTime()
        if (timeSinceLastTrigger < idleRule.cooldown) return
      }

      // 触发空闲提醒
      addSuggestion({
        type: 'question',
        category: 'reminder',
        priority: 'low',
        title: '创作提醒',
        message: `距离上次创作已过去${Math.round(idleTime / 60000)}分钟，继续加油吧！`,
        location: {},
        actions: [
          { type: 'navigate', label: '开始创作', navigateTarget: '/chapters' }
        ]
      })

      idleRule.lastTriggered = now
      saveToStorage()
    }
  }

  // 添加建议
  function addSuggestion(params: {
    type: SuggestionType
    category: SuggestionCategory
    priority: SuggestionPriority
    title: string
    message: string
    details?: string
    location: {
      chapter?: number
      field?: string
      characterId?: string
      locationId?: string
      targetId?: string
    }
    actions?: Suggestion['actions']
    metadata?: Record<string, unknown>
  }): Suggestion | null {
    // 检查相似建议
    const similar = findSimilarSuggestion(params.message)
    if (similar) {
      // 合并到相似建议
      if (!similar.relatedSuggestions) {
        similar.relatedSuggestions = []
      }
      return similar
    }

    const now = new Date()
    const suggestion: Suggestion = {
      id: uuidv4(),
      type: params.type,
      category: params.category,
      priority: params.priority,
      title: params.title,
      message: params.message,
      details: params.details,
      location: params.location,
      status: 'unread',
      actions: normalizeSuggestionActions(params.actions),
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + config.value.autoExpireTime),
      pushed: false,
      metadata: params.metadata
    }

    suggestions.value.unshift(suggestion)

    // 限制最大数量
    if (suggestions.value.length > config.value.maxLength) {
      suggestions.value = suggestions.value.slice(0, config.value.maxLength)
    }

    // 添加到队列
    addToQueue(suggestion)

    saveToStorage()
    return suggestion
  }

  // 查找相似建议
  function findSimilarSuggestion(message: string): Suggestion | null {
    const words = message.toLowerCase().split(/\s+/)
    let bestMatch: Suggestion | null = null
    let bestScore = 0

    for (const s of suggestions.value) {
      if (s.status === 'ignored') continue

      const sWords = s.message.toLowerCase().split(/\s+/)
      const commonWords = words.filter(w => sWords.includes(w))
      const score = commonWords.length / Math.max(words.length, sWords.length)

      if (score >= config.value.similarityThreshold && score > bestScore) {
        bestScore = score
        bestMatch = s
      }
    }

    return bestMatch
  }

  // 添加到队列
  function addToQueue(suggestion: Suggestion) {
    const now = new Date()
    const score = calculatePriorityScore(suggestion)
    let nextPushTime = new Date(now)

    switch (suggestion.priority) {
      case 'high':
        nextPushTime = new Date(now.getTime() + config.value.highPriorityInterval)
        break
      case 'medium':
        nextPushTime = new Date(now.getTime() + config.value.mediumPriorityInterval)
        break
      case 'low':
        nextPushTime = new Date(now.getTime() + config.value.lowPriorityInterval)
        break
    }

    queue.value.push({
      id: suggestion.id,
      score,
      queuedAt: now,
      nextPushTime,
      pushCount: 0
    })
  }

  // 计算优先级分数
  function calculatePriorityScore(suggestion: Suggestion): number {
    let score = 0

    // 基础分数
    switch (suggestion.priority) {
      case 'high': score += 100; break
      case 'medium': score += 50; break
      case 'low': score += 20; break
    }

    // 类型加分
    switch (suggestion.type) {
      case 'issue': score += 30; break
      case 'question': score += 10; break
    }

    // 子类型加分
    switch (suggestion.category) {
      case 'consistency': score += 25; break
      case 'problem': score += 20; break
      case 'quality': score += 15; break
      case 'optimization': score += 5; break
    }

    // 时间衰减（每小时衰减5分）
    const hoursSinceCreation =
      (Date.now() - suggestion.createdAt.getTime()) / (1000 * 60 * 60)
    score -= Math.min(hoursSinceCreation * 5, 40)

    return Math.max(0, score)
  }

  // 更新建议状态
  function updateStatus(id: string, status: SuggestionStatus) {
    const suggestion = suggestions.value.find(s => s.id === id)
    if (suggestion) {
      suggestion.status = status
      suggestion.updatedAt = new Date()
      updateActivity()
      saveToStorage()
    }
  }

  // 标记为已读
  function markAsRead(id: string) {
    updateStatus(id, 'read')
  }

  // 标记为已采纳
  function markAsAdopted(id: string) {
    updateStatus(id, 'adopted')
    // 从队列中移除
    queue.value = queue.value.filter(item => item.id !== id)
  }

  // 标记为已忽略
  function markAsIgnored(id: string) {
    updateStatus(id, 'ignored')
    // 从队列中移除
    queue.value = queue.value.filter(item => item.id !== id)
  }

  // 批量更新状态
  function batchUpdateStatus(ids: string[], status: SuggestionStatus) {
    ids.forEach(id => updateStatus(id, status))
  }

  // 删除建议
  function deleteSuggestion(id: string) {
    suggestions.value = suggestions.value.filter(s => s.id !== id)
    queue.value = queue.value.filter(item => item.id !== id)
    saveToStorage()
  }

  // 清空已处理的建议
  function clearProcessed() {
    suggestions.value = suggestions.value.filter(s =>
      s.status === 'unread' || s.status === 'read'
    )
    saveToStorage()
  }

  // 过滤建议
  function filterSuggestions(filter: SuggestionFilter): Suggestion[] {
    return suggestions.value.filter(s => {
      // 状态过滤
      if (filter.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
        if (!statuses.includes(s.status)) return false
      }

      // 类型过滤
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type]
        if (!types.includes(s.type)) return false
      }

      // 子类型过滤
      if (filter.category) {
        const categories = Array.isArray(filter.category) ? filter.category : [filter.category]
        if (!categories.includes(s.category)) return false
      }

      // 优先级过滤
      if (filter.priority) {
        const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority]
        if (!priorities.includes(s.priority)) return false
      }

      // 章节过滤
      if (filter.chapter !== undefined && s.location.chapter !== filter.chapter) {
        return false
      }

      // 关键词搜索
      if (filter.keyword) {
        const keyword = filter.keyword.toLowerCase()
        return s.title.toLowerCase().includes(keyword) ||
          s.message.toLowerCase().includes(keyword)
      }

      // 时间范围过滤
      if (filter.dateRange) {
        if (s.createdAt < filter.dateRange.start || s.createdAt > filter.dateRange.end) {
          return false
        }
      }

      return true
    })
  }

  // 获取下一个待推送的建议
  function getNextPendingSuggestion(): Suggestion | null {
    const item = pendingQueue.value[0]
    if (!item) return null

    const suggestion = suggestions.value.find(s => s.id === item.id)
    if (!suggestion || suggestion.status !== 'unread') {
      // 从队列移除无效项
      queue.value = queue.value.filter(q => q.id !== item.id)
      return getNextPendingSuggestion()
    }

    return suggestion
  }

  // 标记建议为已推送
  function markAsPushed(id: string) {
    const suggestion = suggestions.value.find(s => s.id === id)
    if (suggestion) {
      suggestion.pushed = true
    }

    const queueItem = queue.value.find(item => item.id === id)
    if (queueItem) {
      queueItem.pushCount++
      // 更新下次推送时间
      const now = new Date()
      switch (suggestion?.priority) {
        case 'high':
          queueItem.nextPushTime = new Date(now.getTime() + config.value.highPriorityInterval)
          break
        case 'medium':
          queueItem.nextPushTime = new Date(now.getTime() + config.value.mediumPriorityInterval)
          break
        case 'low':
          queueItem.nextPushTime = new Date(now.getTime() + config.value.lowPriorityInterval)
          break
      }
    }

    saveToStorage()
  }

  // 更新活动时间
  function updateActivity() {
    lastActivity.value = new Date()
  }

  // 触发事件检查
  async function triggerCheck(event: SuggestionTriggerEvent, data?: Record<string, unknown>) {
    updateActivity()

    const matchingRules = rules.value.filter(r =>
      r.enabled &&
      (Array.isArray(r.trigger) ? r.trigger.includes(event) : r.trigger === event)
    )

    for (const rule of matchingRules) {
      // 检查冷却时间
      if (rule.lastTriggered) {
        const now = new Date()
        const timeSinceLastTrigger = now.getTime() - rule.lastTriggered.getTime()
        if (timeSinceLastTrigger < rule.cooldown) continue
      }

      // 执行规则检查
      await executeRuleCheck(rule, data)

      // 更新最后触发时间
      rule.lastTriggered = new Date()
    }

    saveToStorage()
  }

  // 执行规则检查
  async function executeRuleCheck(rule: SuggestionRule, data?: Record<string, unknown>) {
    // 根据规则ID执行不同的检查逻辑
    switch (rule.id) {
      case 'chapter_complete_check':
        await checkChapterComplete(data)
        break
      case 'character_conflict_check':
        await checkCharacterConflict(data)
        break
      // 可以添加更多规则检查
    }
  }

  // 章节完成检查
  async function checkChapterComplete(data?: Record<string, unknown>) {
    if (!data || !data.chapter) return

    const chapter = data.chapter as { number: number; wordCount: number; qualityScore?: number }

    // 质量分数检查
    if (chapter.qualityScore && chapter.qualityScore < 7) {
      addSuggestion({
        type: 'improvement',
        category: 'quality',
        priority: chapter.qualityScore < 5 ? 'high' : 'medium',
        title: '章节质量待提升',
        message: `第${chapter.number}章质量评分为${chapter.qualityScore.toFixed(1)}，建议优化内容。`,
        location: { chapter: chapter.number },
        actions: [
          { type: 'navigate', label: '查看章节', navigateTarget: `/chapters/${chapter.number}` }
        ]
      })
    }
  }

  // 人物冲突检查
  async function checkCharacterConflict(data?: Record<string, unknown>) {
    if (!data || !data.character) return

    const character = data.character as { id: string; name: string }

    // 检查人物名字一致性（示例）
    if (character.name && character.name !== character.name.trim()) {
      addSuggestion({
        type: 'issue',
        category: 'consistency',
        priority: 'medium',
        title: '人物名字格式问题',
        message: `人物"${character.name}"名字包含多余空格，建议修正。`,
        location: { characterId: character.id, field: 'name' },
        actions: [
          { type: 'navigate', label: '编辑人物', navigateTarget: `/characters/${character.id}` }
        ]
      })
    }
  }

  // 更新配置
  function updateConfig(newConfig: Partial<SuggestionQueueConfig>) {
    config.value = { ...config.value, ...newConfig }
    saveToStorage()
  }

  // 更新规则
  function updateRule(ruleId: string, updates: Partial<SuggestionRule>) {
    const rule = rules.value.find(r => r.id === ruleId)
    if (rule) {
      Object.assign(rule, updates)
      saveToStorage()
    }
  }

  // 获取建议
  function getSuggestion(id: string): Suggestion | undefined {
    return suggestions.value.find(s => s.id === id)
  }

  // 获取指定章节的建议
  function getSuggestionsByChapter(chapter: number): Suggestion[] {
    return suggestions.value.filter(s => s.location.chapter === chapter)
  }

  // 获取指定人物的建议
  function getSuggestionsByCharacter(characterId: string): Suggestion[] {
    return suggestions.value.filter(s => s.location.characterId === characterId)
  }

  return {
    // 状态
    suggestions,
    queue,
    config,
    rules,
    lastActivity,
    isInitialized,

    // 计算属性
    unreadCount,
    highPriorityCount,
    pendingQueue,
    statistics,

    // 方法
    init,
    addSuggestion,
    updateStatus,
    markAsRead,
    markAsAdopted,
    markAsIgnored,
    batchUpdateStatus,
    deleteSuggestion,
    clearProcessed,
    filterSuggestions,
    getNextPendingSuggestion,
    markAsPushed,
    updateActivity,
    triggerCheck,
    updateConfig,
    updateRule,
    getSuggestion,
    getSuggestionsByChapter,
    getSuggestionsByCharacter,
    loadFromStorage,
    saveToStorage
  }
})
