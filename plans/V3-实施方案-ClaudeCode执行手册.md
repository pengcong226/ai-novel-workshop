# V3 重构实施方案：Claude Code 执行手册

> **使用说明**：这是一份按顺序执行的 step-by-step 编码任务清单。每个 Task 都是独立可验证的。请按 Phase → Task 的顺序逐步执行，每个 Task 完成后确保项目能 `npm run build` 通过。
>
> **项目路径**：`e:\Projects\ai-novel-workshop`
> **技术栈**：TypeScript + Vue 3 + Tauri (Rust) + SQLite + Pinia
> **构建命令**：`npm run build`（验证 TypeScript 编译）
> **核心参考**：`plans/V3-架构审视与重构蓝图.md`（架构设计理念）

---

## Phase 1：动脉搭桥（P0 - 最小改动，最大收益）

### Task 1.1：解锁 Token 预算

**目标**：废除 `contextBuilder.ts` 中 6000 Token 的硬编码上限，改为动态适配。

**修改文件**：`src/utils/contextBuilder.ts`

**具体操作**：

1. 找到 L24-37 的 `TOKEN_BUDGET` 常量：
```typescript
const TOKEN_BUDGET = {
  TOTAL: 6000,
  // ...
}
```

2. 将其改为一个**工厂函数**，接收模型窗口大小作为参数：
```typescript
function createTokenBudget(modelContextWindow: number = 128000) {
  // 预留 30% 给生成输出，70% 用于输入上下文
  const inputBudget = Math.floor(modelContextWindow * 0.7)
  // 但设一个合理上限，避免把太多无用信息塞进去
  const effectiveBudget = Math.min(inputBudget, 60000)

  return {
    TOTAL: effectiveBudget,
    SYSTEM_PROMPT: Math.floor(effectiveBudget * 0.05),
    AUTHORS_NOTE: Math.floor(effectiveBudget * 0.03),
    WORLD_INFO: Math.floor(effectiveBudget * 0.12),
    CHARACTERS: Math.floor(effectiveBudget * 0.10),
    MEMORY_TABLES: Math.floor(effectiveBudget * 0.08),
    VECTOR_CONTEXT: Math.floor(effectiveBudget * 0.15),
    SUMMARY: Math.floor(effectiveBudget * 0.10),
    RECENT_CHAPTERS: Math.floor(effectiveBudget * 0.25),
    OUTLINE: Math.floor(effectiveBudget * 0.05),
    RESERVE: Math.floor(effectiveBudget * 0.07)
  }
}
```

3. 修改 `buildChapterContext` 函数签名，添加可选参数 `modelContextWindow?: number`，内部调用 `createTokenBudget(modelContextWindow)` 获取预算对象。

4. 全文搜索所有引用 `TOKEN_BUDGET.XXX` 的地方，改为使用局部变量 `budget.XXX`。

**验证**：`npm run build` 通过，不改变任何外部接口签名（`buildChapterContext` 新增的参数是可选的）。

---

### Task 1.2：修复 System Role

**目标**：将系统提示词从 `user` 角色中分离出来，改为 `system` 角色发送。

**修改文件**：
- `src/utils/contextBuilder.ts`
- `src/services/generation-scheduler.ts`

**具体操作**：

1. 在 `contextBuilder.ts` 中，修改 `contextToPrompt` 函数，使其返回一个对象而非单个字符串：
```typescript
export interface PromptPayload {
  systemMessage: string   // system role 的内容
  userMessage: string     // user role 的内容
}

export function contextToPrompt(
  context: BuildContext,
  chapterTitle: string,
  targetWords: number = 2000
): PromptPayload {
  // systemMessage 包含：系统提示 + 作者注释 + 刚性约束
  const systemParts: string[] = []
  systemParts.push(context.systemPrompt)
  if (context.authorsNote) systemParts.push(context.authorsNote)

  // userMessage 包含：世界观 + 人物 + 记忆 + 向量 + 摘要 + 正文 + 大纲 + 写作指令
  const userParts: string[] = []
  if (context.worldInfo) userParts.push(context.worldInfo)
  if (context.characters) userParts.push(context.characters)
  if (context.memoryTables) userParts.push(context.memoryTables)
  if (context.vectorContext) userParts.push(context.vectorContext)
  if (context.summary) userParts.push(context.summary)
  if (context.recentChapters) userParts.push(context.recentChapters)
  if (context.outline) userParts.push(context.outline)
  userParts.push(`【写作要求】`)
  userParts.push(`1. 章节标题：${chapterTitle}`)
  userParts.push(`2. 字数：约${targetWords}字`)
  userParts.push(`3. 必须严格承接前文剧情，保持连贯性`)
  userParts.push(`4. 情节紧凑，引人入胜`)
  userParts.push(`5. 直接返回章节内容文本，不要包含标题和其他说明。`)

  return {
    systemMessage: systemParts.join('\n'),
    userMessage: userParts.join('\n\n')
  }
}
```

2. **保留旧函数签名的兼容**：如果项目中其他地方也调用了 `contextToPrompt` 并期望返回 string，搜索所有调用点。如果只有 `generation-scheduler.ts` 调用，则直接修改即可。如果有其他调用点，可以添加一个 `contextToPromptString()` 包装函数保持向后兼容。

3. 在 `generation-scheduler.ts` L329，找到：
```typescript
const messages: ChatMessage[] = [{ role: 'user', content: prompt }]
```
改为：
```typescript
const promptPayload = contextToPrompt(context, chapterData.title, targetWords)
const messages: ChatMessage[] = [
  { role: 'system', content: promptPayload.systemMessage },
  { role: 'user', content: promptPayload.userMessage }
]
```

4. 同时删除此处上面的 `let prompt = contextToPrompt(...)` 那行旧调用。注意 L368 的重试追加提示词也需适配——将追加内容添加到 `userMessage` 而非 `prompt`。

**验证**：`npm run build` 通过。

---

### Task 1.3：废除硬编码推断

**目标**：删除 `inferCurrentScene` 和 `inferCharacterStates` 中的硬编码关键词碰撞。

**修改文件**：`src/utils/contextBuilder.ts`

**具体操作**：

1. 找到 `inferCurrentScene` 函数（L157-174），它当前使用 `['山谷', '城市', '森林', '山脉', '宫殿', '洞府', '战场']`。

2. 替换为从角色状态和前文中提取场景：
```typescript
function inferCurrentScene(recentChapters: Chapter[], project: Project): string {
  if (!recentChapters || recentChapters.length === 0) return '故事开始'

  // 优先从角色的 currentState 中读取位置
  const activeCharacters = project.characters.filter(c =>
    c.currentState?.location && c.currentState.location !== '未知'
  )
  if (activeCharacters.length > 0) {
    const locations = [...new Set(activeCharacters.map(c => c.currentState!.location))]
    return locations.join('、')
  }

  // 降级：提取前一章末尾 500 字作为场景概述
  const lastChapter = recentChapters[0]
  if (lastChapter?.content) {
    const tail = lastChapter.content.slice(-500)
    return `前文末尾：${tail.substring(0, 200)}...`
  }

  return '未知场景'
}
```

3. 同样修改 `inferCharacterStates`（L179-197），从 `currentState` 读取真实状态：
```typescript
function inferCharacterStates(recentChapters: Chapter[], project: Project): string {
  if (!recentChapters || recentChapters.length === 0) return ''

  const lastChapter = recentChapters[0]
  const characters = project.characters || []

  // 提取最后出场且有状态的人物
  const mentioned = characters.filter(c =>
    (lastChapter.content || '').includes(c.name)
  )

  if (mentioned.length === 0) return ''

  return mentioned.map(c => {
    const state = c.currentState
    if (state) {
      return `${c.name}（${state.status || '状态未知'}，位于${state.location || '未知'}）`
    }
    return c.name
  }).join('；')
}
```

**验证**：`npm run build` 通过。

---

### Task 1.4：接通 WorldbookInjector

**目标**：让 `contextBuilder.ts` 调用已有的 `WorldbookInjector` 来注入世界书词条。

**修改文件**：`src/utils/contextBuilder.ts`

**具体操作**：

1. 在文件顶部添加 import：
```typescript
import { WorldbookInjector } from '@/services/worldbook-injector'
```

2. 找到 `buildWorldInfo` 函数（L202 附近），在现有的世界观组装逻辑**之后**，追加世界书注入：
```typescript
// 在 buildWorldInfo 函数末尾，现有 parts 组装完毕后追加：

// 动态注入世界书词条（接通之前空转的 WorldbookInjector）
if (project.worldbook?.entries && project.worldbook.entries.length > 0) {
  try {
    const injector = new WorldbookInjector()
    // 收集最近章节的文本作为扫描上下文
    const scanText = recentChapters.map(ch => ch.content || '').join('\n')
    const injectedEntries = injector.inject(
      project.worldbook.entries,
      scanText,
      currentChapter?.outline?.chapterId ? parseInt(currentChapter.outline.chapterId) : undefined
    )
    if (injectedEntries && injectedEntries.length > 0) {
      parts.push('\n【世界书动态注入】')
      injectedEntries.forEach(entry => {
        parts.push(`- ${entry.comment || entry.key?.join('/')}: ${entry.content}`)
      })
    }
  } catch (e) {
    console.warn('[ContextBuilder] WorldbookInjector 注入失败，跳过:', e)
  }
}
```

3. **注意**：需要检查 `WorldbookInjector` 的实际 API。打开 `src/services/worldbook-injector.ts` 查看其 `inject()` 方法的签名，确保参数匹配。如果 API 不完全匹配，做相应适配。如果 `WorldbookInjector` 是单例模式或需要初始化，按其实际设计调用。

**验证**：`npm run build` 通过。在配置了世界书词条的项目中生成章节，检查日志确认 WorldbookInjector 被调用。

---

### Task 1.5：统一 JSON 解析工具

**目标**：提取一个公共的 `safeParseAIJson()` 函数，消除散落在各文件中的重复 JSON 解析逻辑。

**新建文件**：`src/utils/safeParseAIJson.ts`

```typescript
/**
 * 安全解析 AI 返回的 JSON 内容
 * 统一处理 markdown 代码块包裹、多余文本、格式偏差等常见问题
 */
export function safeParseAIJson<T = any>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null

  let cleaned = raw.trim()

  // 1. 尝试提取 ```json ... ``` 代码块
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim()
  }

  // 2. 尝试直接解析
  try {
    return JSON.parse(cleaned) as T
  } catch { /* continue */ }

  // 3. 尝试提取最外层 { ... } 或 [ ... ]
  const objectMatch = cleaned.match(/(\{[\s\S]*\})/)
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[1]) as T
    } catch { /* continue */ }
  }

  const arrayMatch = cleaned.match(/(\[[\s\S]*\])/)
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[1]) as T
    } catch { /* continue */ }
  }

  // 4. 全部失败
  console.warn('[safeParseAIJson] 无法解析 AI 返回的 JSON:', cleaned.substring(0, 200))
  return null
}
```

**然后替换以下文件中的独立 JSON 解析逻辑**：

- `src/utils/llm/antiRetconValidator.ts` — 找到 try/catch JSON.parse 的地方，替换为 `import { safeParseAIJson } from '../safeParseAIJson'`
- `src/utils/llm/outlineGenerator.ts` — 同上
- `src/utils/summarizer.ts` — 同上
- `src/services/generation-scheduler.ts` — L210 附近的 `split('\n')` 按行解析逻辑保留（它不是 JSON 解析），但后续如果有 JSON 解析也替换

**验证**：`npm run build` 通过。

---

### Task 1.6：合并双重 VectorService

**目标**：消除 `services/vector-service.ts` 和 `utils/vectorService.ts` 的重复。

**具体操作**：

1. 分析两个文件的 API：
   - `services/vector-service.ts`：基于 Tauri Rust 后端的版本
   - `utils/vectorService.ts`：独立前端版本

2. **保留** `services/vector-service.ts` 作为唯一实现（因为它对接 SQLite 后端，性能更好）。

3. 在 `utils/vectorService.ts` 中，将其改为**代理/重导出**：
```typescript
/**
 * @deprecated 请使用 @/services/vector-service
 * 此文件保留为兼容层，内部重定向到 services/vector-service
 */
export { getVectorService, type VectorService } from '@/services/vector-service'
```

4. 搜索项目中所有 `import ... from '@/utils/vectorService'` 或 `import ... from './vectorService'` 的地方，逐步改为从 `@/services/vector-service` 导入。`contextBuilder.ts` L21 就是其中之一。

**验证**：`npm run build` 通过。

---

## Phase 2：图元数据模型落地（P1 - 基础重构）

### Task 2.1：定义新类型体系

**新建文件**：`src/types/entity.ts`

将 V3 蓝图中定义的所有新接口写入此文件：

```typescript
// src/types/entity.ts
// 图元时序架构的核心类型定义

export interface EntityNode {
  id: string
  type: 'CHARACTER' | 'FACTION' | 'ITEM' | 'LOCATION' | 'CONCEPT'
  name: string
  aliases: string[]
  isArchived: boolean
  keywords: string[]
  createdAtChapter: number
  importance: 'critical' | 'major' | 'minor' | 'background'
}

export interface CharacterV3 extends EntityNode {
  type: 'CHARACTER'

  coreIdentity: {
    gender: 'male' | 'female' | 'other'
    birthChapter: number
    fundamentalTraits: string
    deathChapter?: number
  }

  stateTimeline: CharacterStateSlice[]
  relationships: EntityRelation[]

  narrativeProfile: string
  lastNarrativeUpdate: number
}

export interface CharacterStateSlice {
  chapterIndex: number
  vitalStatus: 'alive' | 'dead' | 'missing' | 'unknown'
  physicalState: string
  location: string
  faction: string
  powerLevel: string
  currentGoal: string
  inventory: InventoryItem[]
  abilities: AbilityRecord[]
  trigger: string
}

export interface InventoryItem {
  itemId: string
  itemName: string
  status: 'possessed' | 'lost' | 'destroyed' | 'given_away'
  sinceChapter: number
}

export interface AbilityRecord {
  name: string
  status: 'active' | 'sealed' | 'lost'
  acquiredChapter: number
}

export interface EntityRelation {
  targetId: string
  targetName: string
  type: 'family' | 'friend' | 'enemy' | 'lover' | 'rival' |
        'master' | 'subordinate' | 'ally' | 'other'
  intensity: number
  sinceChapter: number
  description: string
}

export interface WorldEntityV3 extends EntityNode {
  stateVersions: {
    validFromChapter: number
    validUntilChapter: number | null
    description: string
    trigger: string
  }[]
  relatedEntityIds: string[]
}

export interface WorldNarrative {
  id: string
  narrativeState: string
  lastUpdatedChapter: number
}

export interface PlotNarrative {
  id: string
  narrativeNotes: string
  lastUpdatedChapter: number
}

export interface PlotBeat {
  id: string
  summary: string
  povCharacterId: string
  locationId: string
  sceneType: 'action' | 'dialogue' | 'introspection' | 'exposition' | 'transition'
  tokenBudget: number
}

export interface ChapterPlanV3 {
  id: string
  title: string
  plotBeats: PlotBeat[]
  involvedEntityIds: string[]
  resolvedConflicts: string[]
  introducedEntityIds: string[]
  status: 'planned' | 'writing' | 'completed'
}
```

**然后在 `src/types/index.ts` 顶部添加重导出**：
```typescript
export * from './entity'
```

**验证**：`npm run build` 通过（新类型不会破坏任何现有代码，因为旧类型仍然存在）。

---

### Task 2.2：创建旧→新类型迁移工具

**新建文件**：`src/utils/entityMigration.ts`

```typescript
import type { Character } from '@/types'
import type { CharacterV3, CharacterStateSlice } from '@/types/entity'
import { v4 as uuidv4 } from 'uuid'

/**
 * 将旧版 Character 转换为新版 CharacterV3
 * 用于数据迁移和兼容
 */
export function migrateCharacterToV3(old: Character): CharacterV3 {
  const initialSlice: CharacterStateSlice = {
    chapterIndex: 0,
    vitalStatus: 'alive',
    physicalState: old.currentState?.status || '健康',
    location: old.currentState?.location || '未知',
    faction: old.currentState?.faction || '无',
    powerLevel: old.powerLevel || '未知',
    currentGoal: old.motivation || '',
    inventory: [],
    abilities: old.abilities.map(a => ({
      name: a.name,
      status: 'active' as const,
      acquiredChapter: 0
    })),
    trigger: '初始状态'
  }

  return {
    id: old.id,
    type: 'CHARACTER',
    name: old.name,
    aliases: old.aliases || [],
    isArchived: false,
    keywords: [old.name, ...old.aliases],
    createdAtChapter: 0,
    importance: old.tags?.includes('protagonist') ? 'critical' :
                old.tags?.includes('supporting') ? 'major' : 'minor',

    coreIdentity: {
      gender: old.gender,
      birthChapter: 0,
      fundamentalTraits: [
        old.background,
        ...(old.personality || [])
      ].filter(Boolean).join('。')
    },

    stateTimeline: [initialSlice],
    relationships: old.relationships.map(r => ({
      targetId: r.targetId,
      targetName: r.targetId, // 需后续填充真名
      type: r.type,
      intensity: 50,
      sinceChapter: r.startChapter || 0,
      description: r.description
    })),

    narrativeProfile: [
      `${old.name}，${old.gender === 'male' ? '男' : old.gender === 'female' ? '女' : ''}。`,
      old.background,
      old.personality?.length ? `性格特征：${old.personality.join('、')}` : '',
      old.motivation ? `核心动机：${old.motivation}` : ''
    ].filter(Boolean).join('\n'),

    lastNarrativeUpdate: 0
  }
}
```

**验证**：`npm run build` 通过。

---

### Task 2.3：创建增量更新引擎

**新建文件**：`src/services/state-updater.ts`

这是 PGVU 闭环中 Update 阶段的核心实现。

```typescript
import type { CharacterV3, CharacterStateSlice, EntityRelation } from '@/types/entity'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import { useAIStore } from '@/stores/ai'
import type { ChatMessage } from '@/types/ai'

/**
 * AI 提取的状态变更意图
 */
export interface StateShift {
  entityId: string
  entityName: string
  field: string
  oldValue: string
  newValue: string
  evidence: string  // 原文中的引文支撑
}

/**
 * 叙事档案增量变更
 */
export interface NarrativeDiff {
  entityId: string
  additions: string[]   // 需要添加到档案的内容
  removals: string[]    // 需要从档案中删除的内容
}

export interface UpdateResult {
  appliedShifts: StateShift[]
  rejectedShifts: StateShift[]
  narrativeDiffs: NarrativeDiff[]
}

/**
 * 步骤1：提取器 - 从新章节中提取状态变更
 */
export async function extractStateShifts(
  chapterContent: string,
  involvedCharacters: CharacterV3[],
  chapterIndex: number
): Promise<{ shifts: StateShift[], narrativeDiffs: NarrativeDiff[] }> {
  const aiStore = useAIStore()

  const characterSummary = involvedCharacters.map(c => {
    const latest = c.stateTimeline[c.stateTimeline.length - 1]
    return `- ${c.name}(${c.id}): 状态=${latest?.physicalState || '未知'}, 位置=${latest?.location || '未知'}, 目标=${latest?.currentGoal || '未知'}`
  }).join('\n')

  const prompt = `你是一个精确的状态追踪系统。请分析以下新章节内容，提取所有角色状态的变更。

【当前角色状态】
${characterSummary}

【新章节内容（第${chapterIndex}章）】
${chapterContent}

请输出 JSON 格式：
{
  "shifts": [
    {
      "entityId": "角色ID",
      "entityName": "角色名",
      "field": "变更的字段(physicalState/location/faction/currentGoal/vitalStatus)",
      "oldValue": "旧值",
      "newValue": "新值",
      "evidence": "原文中支撑此变更的具体引用文本(必须是原文的直接引用)"
    }
  ],
  "narrativeDiffs": [
    {
      "entityId": "角色ID",
      "additions": ["需要添加到叙事档案的新信息"],
      "removals": ["需要从叙事档案中删除的过时信息"]
    }
  ]
}

注意：
- 只输出实际发生了变化的字段
- evidence 字段必须是章节原文中的直接引用
- 如果没有变化，返回空数组`

  const messages: ChatMessage[] = [
    { role: 'system', content: '你是一个精确的叙事状态追踪系统。只输出 JSON，不要解释。' },
    { role: 'user', content: prompt }
  ]

  const response = await aiStore.chat(messages, {
    type: 'check',
    complexity: 'medium',
    priority: 'quality'
  })

  const parsed = safeParseAIJson<{ shifts: StateShift[], narrativeDiffs: NarrativeDiff[] }>(response.content)
  return parsed || { shifts: [], narrativeDiffs: [] }
}

/**
 * 步骤2：验证器 - 验证状态变更在原文中有引文支撑
 */
export function verifyStateShifts(
  shifts: StateShift[],
  chapterContent: string
): { approved: StateShift[], rejected: StateShift[] } {
  const approved: StateShift[] = []
  const rejected: StateShift[] = []

  for (const shift of shifts) {
    // 检查 evidence 是否真的出现在原文中
    // 使用模糊匹配（去除空格和标点后比较）
    const normalizedContent = chapterContent.replace(/[\s\p{P}]/gu, '')
    const normalizedEvidence = shift.evidence.replace(/[\s\p{P}]/gu, '')

    if (normalizedEvidence.length > 5 && normalizedContent.includes(normalizedEvidence)) {
      approved.push(shift)
    } else {
      // 降级：检查是否有核心关键词匹配
      const keywords = shift.newValue.split(/[，,、\s]+/).filter(w => w.length >= 2)
      const hasKeywordSupport = keywords.some(kw => chapterContent.includes(kw))

      if (hasKeywordSupport) {
        approved.push(shift)
      } else {
        console.warn(`[StateUpdater] 拒绝幻觉变更: ${shift.entityName}.${shift.field} → ${shift.newValue}，原文无支撑`)
        rejected.push(shift)
      }
    }
  }

  return { approved, rejected }
}

/**
 * 步骤3：应用已验证的状态变更
 */
export function applyStateShifts(
  character: CharacterV3,
  approvedShifts: StateShift[],
  chapterIndex: number
): CharacterV3 {
  if (approvedShifts.length === 0) return character

  // 复制最新的状态切片
  const latest = character.stateTimeline[character.stateTimeline.length - 1]
  const newSlice: CharacterStateSlice = {
    ...JSON.parse(JSON.stringify(latest)),
    chapterIndex,
    trigger: approvedShifts.map(s => `${s.field}: ${s.oldValue} → ${s.newValue}`).join('; ')
  }

  // 应用每个变更
  for (const shift of approvedShifts) {
    switch (shift.field) {
      case 'physicalState': newSlice.physicalState = shift.newValue; break
      case 'location': newSlice.location = shift.newValue; break
      case 'faction': newSlice.faction = shift.newValue; break
      case 'currentGoal': newSlice.currentGoal = shift.newValue; break
      case 'vitalStatus':
        newSlice.vitalStatus = shift.newValue as any
        if (shift.newValue === 'dead') {
          character.coreIdentity.deathChapter = chapterIndex
        }
        break
      case 'powerLevel': newSlice.powerLevel = shift.newValue; break
    }
  }

  // 追加新切片（不覆盖旧的）
  character.stateTimeline.push(newSlice)
  return character
}

/**
 * 应用叙事档案的增量更新
 */
export function applyNarrativeDiff(
  character: CharacterV3,
  diff: NarrativeDiff,
  chapterIndex: number
): CharacterV3 {
  let profile = character.narrativeProfile

  // 添加新内容
  for (const addition of diff.additions) {
    profile += '\n' + addition
  }

  // 删除过时内容（简单的文本替换）
  for (const removal of diff.removals) {
    profile = profile.replace(removal, '')
  }

  // 清理多余空行
  profile = profile.replace(/\n{3,}/g, '\n\n').trim()

  character.narrativeProfile = profile
  character.lastNarrativeUpdate = chapterIndex
  return character
}
```

**验证**：`npm run build` 通过。

---

### Task 2.4：升级防吃书验证器

**修改文件**：`src/utils/llm/antiRetconValidator.ts`

**具体操作**：

1. 移除 L54 的 3000 字符截断：
```typescript
// 之前：${generatedContent.substring(0, 3000)}...
// 改为：传完整正文（如果超长，截断到 8000 字符以平衡成本）
${generatedContent.substring(0, 8000)}${generatedContent.length > 8000 ? '\n...(后续内容省略)' : ''}
```

2. 在 Prompt 中增加角色状态对比信息。找到构建验证 Prompt 的位置，在角色信息部分，优先读取 `currentState` 并明确列出：
```typescript
// 组装角色当前状态
const characterStates = project.characters
  .filter(c => generatedContent.includes(c.name))
  .map(c => {
    const state = c.currentState
    return `- ${c.name}: ${state ? `状态=${state.status}, 位置=${state.location}` : '状态未知'}`
  }).join('\n')
```

3. 使用 `safeParseAIJson` 替换已有的 JSON 解析逻辑：
```typescript
import { safeParseAIJson } from '../safeParseAIJson'
```

**验证**：`npm run build` 通过。

---

### Task 2.5：改造 generation-scheduler 的后处理

**修改文件**：`src/services/generation-scheduler.ts`

**目标**：在章节生成后，调用 `state-updater.ts` 执行增量状态更新（替代当前的空壳入库逻辑）。

**具体操作**：

1. 添加 import：
```typescript
import { extractStateShifts, verifyStateShifts, applyStateShifts, applyNarrativeDiff } from '@/services/state-updater'
```

2. 修改 `runExtractionInBackground` 方法（L45 附近），在现有提取逻辑之后，追加增量更新流程：
```typescript
public async runExtractionInBackground(chapter: Chapter) {
  const projectStore = useProjectStore()
  const taskManager = useTaskManager()
  const project = projectStore.currentProject
  if (!project) return

  const task = taskManager.addTask('设定提取', `第${chapter.number}章自动状态追踪`)

  try {
    // 保留现有的 entity extraction（识别新角色）
    // ... 现有代码 ...

    // === 新增：增量状态更新 ===
    taskManager.updateTask(task.id, { description: '正在执行增量状态追踪与验证...' })

    const involvedCharacters = project.characters.filter(c =>
      chapter.content.includes(c.name)
    )

    if (involvedCharacters.length > 0) {
      // 提取器
      const { shifts, narrativeDiffs } = await extractStateShifts(
        chapter.content,
        involvedCharacters as any, // 兼容旧类型
        chapter.number
      )

      // 验证器
      const { approved, rejected } = verifyStateShifts(shifts, chapter.content)

      if (rejected.length > 0) {
        taskManager.addToast(
          `第${chapter.number}章：拒绝了 ${rejected.length} 条幻觉状态变更`,
          'warning'
        )
      }

      // 应用已验证的变更（这里需要更新 project 中的角色状态）
      // 注意：当前旧类型的 Character 只有 currentState，我们更新它
      for (const shift of approved) {
        const char = project.characters.find(c => c.name === shift.entityName || c.id === shift.entityId)
        if (char) {
          if (!char.currentState) {
            char.currentState = { location: '', status: '', faction: '', updatedAt: Date.now() }
          }
          if (shift.field === 'location') char.currentState.location = shift.newValue
          if (shift.field === 'physicalState') char.currentState.status = shift.newValue
          if (shift.field === 'faction') char.currentState.faction = shift.newValue
          char.currentState.updatedAt = Date.now()
        }
      }

      // 保存
      await projectStore.saveCurrentProject()
    }

    taskManager.completeTask(task.id, `第${chapter.number}章状态追踪完成`)
  } catch (error) {
    console.error('[Extraction] 失败:', error)
    taskManager.failTask(task.id, String(error))
  }
}
```

**验证**：`npm run build` 通过。

---

## Phase 3：上下文编排与闭环（P2 - 核心进化）

### Task 3.1：重构 contextBuilder 为沙漏布局

**修改文件**：`src/utils/contextBuilder.ts`

**目标**：重构 `contextToPrompt`（已在 Task 1.2 中改为返回 PromptPayload），使用沙漏式布局。

**具体操作**：

将 `contextToPrompt` 中的 `systemMessage` 和 `userMessage` 按沙漏布局重新组织：

```typescript
export function contextToPrompt(
  context: BuildContext,
  chapterTitle: string,
  targetWords: number = 2000
): PromptPayload {
  // === System Message: 头部 (15%) — 最高注意力区 ===
  const systemParts: string[] = []
  systemParts.push(context.systemPrompt)
  if (context.authorsNote) systemParts.push(context.authorsNote)
  // 角色的刚性事实约束也放在 system 中
  if (context.characters) {
    // 提取刚性约束部分（生死状态、位置等）单独放system
    systemParts.push('【角色刚性约束 - 绝对不可违反】')
    systemParts.push(context.characters)
  }

  // === User Message: 中段 (60%) + 尾部 (25%) ===
  const userParts: string[] = []

  // 中段：计划 + 叙事参考 + RAG 召回
  if (context.outline) {
    userParts.push('【本章大纲】')
    userParts.push(context.outline)
  }
  if (context.worldInfo) {
    userParts.push('【世界观设定】')
    userParts.push(context.worldInfo)
  }
  if (context.memoryTables) {
    userParts.push('【记忆追踪】')
    userParts.push(context.memoryTables)
  }
  if (context.vectorContext) {
    userParts.push('【历史相关片段（按时间顺序）】')
    userParts.push(context.vectorContext)
  }
  if (context.summary) {
    userParts.push('【历史摘要】')
    userParts.push(context.summary)
  }

  // 尾部：最近正文 + 执行指令（最高注意力区）
  if (context.recentChapters) {
    userParts.push('【最近章节正文】')
    userParts.push(context.recentChapters)
  }

  userParts.push(`【写作执行指令 - 请严格遵循】`)
  userParts.push(`章节标题：${chapterTitle}`)
  userParts.push(`目标字数：约${targetWords}字`)
  userParts.push(`必须严格承接前文剧情，保持连贯性。`)
  userParts.push(`情节紧凑，场景描写生动，对话自然流畅。`)
  userParts.push(`直接返回章节内容文本，不要包含标题和其他说明。`)

  return {
    systemMessage: systemParts.join('\n\n'),
    userMessage: userParts.join('\n\n')
  }
}
```

**验证**：`npm run build` 通过。

---

### Task 3.2：实现 OP-RAG 保序检索

**修改文件**：`src/utils/contextBuilder.ts`（向量检索部分）

**目标**：确保向量检索返回的片段按原文时间顺序排列。

找到 `contextBuilder.ts` 中调用向量服务的位置，在获取检索结果后添加排序：

```typescript
// 在获取向量检索结果后，按章节号排序（OP-RAG）
if (vectorResults && vectorResults.length > 0) {
  // 按原始章节顺序排列，而非相似度分数
  vectorResults.sort((a, b) => {
    const chapterA = a.metadata?.chapterNumber || 0
    const chapterB = b.metadata?.chapterNumber || 0
    return chapterA - chapterB  // 升序：从早到晚
  })
}
```

**验证**：`npm run build` 通过。

---

### Task 3.3：实现 PGVU 闭环中的反馈重试

**修改文件**：`src/services/generation-scheduler.ts`

**目标**：改进验证失败后的重试逻辑——不重写全文，而是发送具体诊断要求局部修补。

找到 L354-374 的防吃书重试代码块，改为：

```typescript
if (!vResult.passed) {
  const warnMsg = `第 ${chapterNumber} 章触发吃书警告: ${vResult.reason}`
  taskManager.addToast(warnMsg, 'warning')

  if (attempt < maxRetries) {
    // 构建局部修补指令（而非重写全文）
    const fixMessages: ChatMessage[] = [
      { role: 'system', content: promptPayload.systemMessage },
      { role: 'user', content: `你刚才生成的第${chapterNumber}章正文如下：\n\n${finalContent}` },
      { role: 'user', content: `该正文被校验系统检测到以下一致性错误：\n\n${vResult.reason}\n\n修复建议：${vResult.suggestedFixPrompt}\n\n请输出修正后的完整章节正文。仅修正上述问题，保留其余内容不变。` }
    ]

    taskManager.updateTask(batchTask.id, { description: `正在执行局部修补（第${attempt}次）...` })
    const fixResponse = await aiStore.chat(fixMessages, aiContext, generationOptions)
    finalContent = fixResponse.content.trim()
    continue
  }
}
```

**验证**：`npm run build` 通过。

---

## Phase 4：外围治理（P3 - 清理）

### Task 4.1：修复 AI Store 模型路由

**修改文件**：`src/stores/ai.ts`

1. 找到 L117-182 的 `forEach` 循环中 `custom` 类型覆盖 `openai` 的问题。将每个 provider 分配到独立的 key：
```typescript
// 之前：aiConfig.providers.openai = { ... }（被后续覆盖）
// 改为：使用 provider 的实际名称或 ID 作为 key
const providerKey = provider.name || provider.type || `provider_${index}`
aiConfig.providers[providerKey] = { ... }
```

2. 提取 `chat` 和 `chatStream` 中重复的模型选择代码为共享函数：
```typescript
function resolvePreferredModel(
  config: ProjectConfig | null,
  contextType?: string,
  configuredModel?: string | null
): string | null {
  let preferredModel = configuredModel || null
  if (config) {
    if (contextType === 'outline' || contextType === 'worldbuilding' || contextType === 'character') {
      preferredModel = config.planningModel || preferredModel
    } else if (contextType === 'chapter') {
      preferredModel = config.writingModel || preferredModel
    } else if (contextType === 'check') {
      preferredModel = config.checkingModel || preferredModel
    }
  }
  return preferredModel
}
```

**验证**：`npm run build` 通过。

### Task 4.2：修复存储层竞态

**修改文件**：`src/stores/project.ts`

1. 在 `saveChapter` 中，移除对 `saveCurrentProject()` 的级联调用。章节保存应该是独立的，不触发全量项目序列化。

2. 修复 `beforeunload` 中的异步保存——改为 `navigator.sendBeacon` 或同步操作。

### Task 4.3：清除死代码

- 删除 `src/utils/test-conflict-detector.ts`（测试文件不该在 utils/）
- 删除 `src/utils/test-vector.ts`
- 删除 `src/utils/vectorStore.ts`（第三套向量存储，已被合并）
- 检查 `src/composables/useContextRadar.ts`（只有 46 行的简单 includes 检查），如功能已被 contextBuilder 覆盖则删除

---

## 执行总结

| Phase | 任务数 | 预估时间 | 核心收益 |
|:---:|:---:|:---:|:---|
| Phase 1 | 6个Task | ~1天 | 解锁95%上下文空间、修复System Role、接通世界书 |
| Phase 2 | 5个Task | ~2天 | 图元类型体系、增量更新引擎、防吃书加固 |
| Phase 3 | 3个Task | ~1天 | 沙漏布局、OP-RAG保序、PGVU闭环反馈 |
| Phase 4 | 3个Task | ~0.5天 | 路由修复、竞态修复、死代码清理 |

**每个 Task 完成后请执行 `npm run build` 验证 TypeScript 编译通过。**
