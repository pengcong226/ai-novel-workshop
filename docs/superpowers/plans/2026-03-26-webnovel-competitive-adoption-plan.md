# Webnovel Competitive Adoption Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 2 周内落地 3 个可见能力：命令化创作入口、通用 AI 动作执行总线、多角色审校工作流。

**Architecture:** 复用现有 Vue + Pinia + 插件注册表架构，不新增后端服务。将“命令解析”“动作解析/执行”“审校配置”拆成可单测的 TypeScript 模块，再把 AIAssistant.vue 作为编排层接线。先补测试再改实现，确保每个里程碑可独立回归。

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest, Element Plus

---

## File Structure

### Create
- `src/assistant/commands/types.ts`
- `src/assistant/commands/registry.ts`
- `src/assistant/commands/builtinCommands.ts`
- `src/assistant/commands/inputRouter.ts`
- `src/assistant/commands/__tests__/registry.test.ts`
- `src/assistant/commands/__tests__/inputRouter.test.ts`
- `src/assistant/actions/actionEnvelope.ts`
- `src/assistant/actions/executeAssistantAction.ts`
- `src/assistant/actions/__tests__/actionEnvelope.test.ts`
- `src/assistant/actions/__tests__/executeAssistantAction.test.ts`
- `src/plugins/builtin/assistant-actions.ts`
- `src/assistant/review/reviewProfiles.ts`
- `src/assistant/review/reviewPromptFactory.ts`
- `src/assistant/review/__tests__/reviewPromptFactory.test.ts`
- `docs/assistant/commands.md`
- `docs/assistant/review-workflow.md`

### Modify
- `src/components/AIAssistant.vue`
- `src/plugins/init.ts`
- `src/plugins/index.ts`
- `src/stores/plugin.ts`
- `src/components/PluginManager.vue`
- `README.md`

---

## Chunk 1: Command-based writing entry (Week 1)

### Task 1: 建立命令注册与匹配核心

**Files:**
- Create: `src/assistant/commands/types.ts`
- Create: `src/assistant/commands/registry.ts`
- Create: `src/assistant/commands/builtinCommands.ts`
- Create: `src/assistant/commands/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/assistant/commands/__tests__/registry.test.ts
import { describe, it, expect } from 'vitest'
import { createCommandRegistry } from '../registry'
import { builtInCommands } from '../builtinCommands'

describe('command registry', () => {
  it('matches /review command', () => {
    const registry = createCommandRegistry(builtInCommands)
    const result = registry.match('/review consistency')

    expect(result?.id).toBe('review')
    expect(result?.args).toEqual(['consistency'])
  })

  it('returns null for plain chat input', () => {
    const registry = createCommandRegistry(builtInCommands)
    expect(registry.match('继续写第十章')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/assistant/commands/__tests__/registry.test.ts`
Expected: FAIL with missing module exports

- [ ] **Step 3: Write minimal implementation**

```ts
// src/assistant/commands/registry.ts
import type { AssistantCommand, MatchedCommand } from './types'

export function createCommandRegistry(commands: AssistantCommand[]) {
  const byName = new Map(commands.map((cmd) => [cmd.name, cmd]))

  function match(input: string): MatchedCommand | null {
    const text = input.trim()
    if (!text.startsWith('/')) return null

    const [rawName, ...args] = text.slice(1).split(/\s+/)
    const cmd = byName.get(rawName)
    if (!cmd) return null

    return { id: cmd.id, name: cmd.name, args, template: cmd.template }
  }

  return { match, list: () => commands }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/assistant/commands/__tests__/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/assistant/commands/types.ts src/assistant/commands/registry.ts src/assistant/commands/builtinCommands.ts src/assistant/commands/__tests__/registry.test.ts
git commit -m "feat: add assistant slash command registry"
```

---

### Task 2: 接入 AIAssistant 输入路由并修复 sendQuickCommand 缺口

**Files:**
- Create: `src/assistant/commands/inputRouter.ts`
- Create: `src/assistant/commands/__tests__/inputRouter.test.ts`
- Modify: `src/components/AIAssistant.vue`
- Modify: `src/stores/plugin.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/assistant/commands/__tests__/inputRouter.test.ts
import { describe, it, expect } from 'vitest'
import { routeAssistantInput } from '../inputRouter'

describe('routeAssistantInput', () => {
  it('routes slash input to command mode', () => {
    const routed = routeAssistantInput('/plan 第12章')
    expect(routed.mode).toBe('command')
    expect(routed.commandName).toBe('plan')
  })

  it('routes normal input to chat mode', () => {
    const routed = routeAssistantInput('帮我续写这一章')
    expect(routed.mode).toBe('chat')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/assistant/commands/__tests__/inputRouter.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Write minimal implementation + component wiring**

```ts
// src/assistant/commands/inputRouter.ts
export function routeAssistantInput(input: string) {
  const text = input.trim()
  if (!text.startsWith('/')) return { mode: 'chat' as const, text }

  const [commandName, ...args] = text.slice(1).split(/\s+/)
  return { mode: 'command' as const, commandName, args }
}
```

接线要求（`src/components/AIAssistant.vue`）：
- 明确新增 `sendQuickCommand(cmd)`，避免模板绑定悬空（当前 `@click="sendQuickCommand(cmd)"` 已存在）。
- `quickCommands` 改为“内置命令 + `pluginStore.getQuickCommands()` 合并输出”。
- `sendMessage()` 内先走 `routeAssistantInput()`；命令模式进入命令执行分支，聊天模式走原有 AI chat。

`src/stores/plugin.ts`：
- 增加 `executeQuickCommand(command: string)`，内部调用 `pluginManager.getRegistries().quickCommand.executeCommand(command)`。

- [ ] **Step 4: Run focused tests and type-check**

Run: `npm run test -- src/assistant/commands/__tests__/inputRouter.test.ts`
Expected: PASS

Run: `npm run build`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add src/assistant/commands/inputRouter.ts src/assistant/commands/__tests__/inputRouter.test.ts src/components/AIAssistant.vue src/stores/plugin.ts
git commit -m "fix: wire assistant quick command routing"
```

---

## Chunk 2: Unified AI action execution bus (Week 1-2)

### Task 3: 抽离动作 JSON 解析器（不再硬编码 create_character 正则）

**Files:**
- Create: `src/assistant/actions/actionEnvelope.ts`
- Create: `src/assistant/actions/__tests__/actionEnvelope.test.ts`
- Modify: `src/components/AIAssistant.vue`

- [ ] **Step 1: Write the failing test**

```ts
// src/assistant/actions/__tests__/actionEnvelope.test.ts
import { describe, it, expect } from 'vitest'
import { extractActionEnvelope } from '../actionEnvelope'

describe('extractActionEnvelope', () => {
  it('extracts action and strips JSON block from text', () => {
    const raw = '已完成。\n```json\n{"action":"create_character","data":{"name":"林渊"}}\n```'
    const parsed = extractActionEnvelope(raw)

    expect(parsed.action?.action).toBe('create_character')
    expect(parsed.visibleText).toBe('已完成。')
  })

  it('returns null action when no json block', () => {
    const parsed = extractActionEnvelope('只是一段普通回复')
    expect(parsed.action).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/assistant/actions/__tests__/actionEnvelope.test.ts`
Expected: FAIL with missing module

- [ ] **Step 3: Write minimal implementation**

```ts
// src/assistant/actions/actionEnvelope.ts
export interface AssistantActionEnvelope {
  action: string
  data?: Record<string, unknown>
}

export function extractActionEnvelope(raw: string): {
  visibleText: string
  action: AssistantActionEnvelope | null
} {
  const match = raw.match(/```json\s*(\{[\s\S]*?"action"\s*:[\s\S]*?\})\s*```/)
  if (!match) return { visibleText: raw.trim(), action: null }

  try {
    const action = JSON.parse(match[1]) as AssistantActionEnvelope
    return {
      visibleText: raw.replace(match[0], '').trim(),
      action
    }
  } catch {
    return { visibleText: raw.trim(), action: null }
  }
}
```

`AIAssistant.vue`：
- 用 `extractActionEnvelope()` 代替当前 `create_character` 专用正则逻辑。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/assistant/actions/__tests__/actionEnvelope.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/assistant/actions/actionEnvelope.ts src/assistant/actions/__tests__/actionEnvelope.test.ts src/components/AIAssistant.vue
git commit -m "refactor: extract generic assistant action envelope parser"
```

---

### Task 4: 对接 AIActionHandlerRegistry 执行动作

**Files:**
- Create: `src/assistant/actions/executeAssistantAction.ts`
- Create: `src/assistant/actions/__tests__/executeAssistantAction.test.ts`
- Create: `src/plugins/builtin/assistant-actions.ts`
- Modify: `src/plugins/init.ts`
- Modify: `src/plugins/index.ts`
- Modify: `src/components/AIAssistant.vue`
- Modify: `src/components/PluginManager.vue`

- [ ] **Step 1: Write the failing test**

```ts
// src/assistant/actions/__tests__/executeAssistantAction.test.ts
import { describe, it, expect, vi } from 'vitest'
import { executeAssistantAction } from '../executeAssistantAction'

describe('executeAssistantAction', () => {
  it('dispatches to registry by action type with context', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)
    const context = { project: { id: 'p1' } } as any

    await executeAssistantAction(
      { action: 'create_character', data: { name: '林渊' } },
      { execute },
      context
    )

    expect(execute).toHaveBeenCalledWith('create_character', { name: '林渊' }, context)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/assistant/actions/__tests__/executeAssistantAction.test.ts`
Expected: FAIL with missing implementation

- [ ] **Step 3: Write minimal implementation + builtin handler registration**

```ts
// src/assistant/actions/executeAssistantAction.ts
import type { ActionContext } from '@/plugins/types'

export async function executeAssistantAction(
  envelope: { action: string; data?: Record<string, unknown> },
  deps: { execute: (type: string, data: Record<string, unknown>, context: ActionContext) => Promise<void> },
  context: ActionContext
): Promise<void> {
  await deps.execute(envelope.action, envelope.data ?? {}, context)
}
```

接线要求：
- `src/plugins/builtin/assistant-actions.ts` 提供 `create_character` 的默认 handler（复用当前角色创建逻辑，不在组件里硬编码）。
- `src/plugins/init.ts` 初始化时注册该 handler。
- `AIAssistant.vue` 的 action 按钮改为统一走 `executeAssistantAction`。
- `PluginManager.vue` 执行快捷命令改为调用 store/registry，不直接 `command.handler()`。

- [ ] **Step 4: Run tests and build**

Run: `npm run test -- src/assistant/actions/__tests__/executeAssistantAction.test.ts`
Expected: PASS

Run: `npm run build`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add src/assistant/actions/executeAssistantAction.ts src/assistant/actions/__tests__/executeAssistantAction.test.ts src/plugins/builtin/assistant-actions.ts src/plugins/init.ts src/plugins/index.ts src/components/AIAssistant.vue src/components/PluginManager.vue
git commit -m "feat: execute assistant actions via plugin action registry"
```

---

## Chunk 3: Multi-role review workflow + docs (Week 2)

### Task 5: 落地 /review 多角色审校命令

**Files:**
- Create: `src/assistant/review/reviewProfiles.ts`
- Create: `src/assistant/review/reviewPromptFactory.ts`
- Create: `src/assistant/review/__tests__/reviewPromptFactory.test.ts`
- Modify: `src/assistant/commands/builtinCommands.ts`
- Modify: `src/components/AIAssistant.vue`
- Modify: `src/stores/suggestions.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/assistant/review/__tests__/reviewPromptFactory.test.ts
import { describe, it, expect } from 'vitest'
import { buildReviewPrompt } from '../reviewPromptFactory'

describe('buildReviewPrompt', () => {
  it('builds consistency review prompt', () => {
    const prompt = buildReviewPrompt('consistency', { chapterTitle: '第12章' })
    expect(prompt).toContain('一致性审校')
    expect(prompt).toContain('第12章')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/assistant/review/__tests__/reviewPromptFactory.test.ts`
Expected: FAIL with missing module

- [ ] **Step 3: Write minimal implementation**

```ts
// src/assistant/review/reviewProfiles.ts
export type ReviewProfile = 'consistency' | 'pacing' | 'reader_pull'

export const reviewProfileMeta: Record<ReviewProfile, { title: string; focus: string }> = {
  consistency: { title: '一致性审校', focus: '人设/设定/时间线冲突' },
  pacing: { title: '节奏审校', focus: '推进速度与章节密度' },
  reader_pull: { title: '读者吸引力审校', focus: '钩子、悬念、情绪峰值' }
}
```

```ts
// src/assistant/review/reviewPromptFactory.ts
import { reviewProfileMeta, type ReviewProfile } from './reviewProfiles'

export function buildReviewPrompt(profile: ReviewProfile, context: { chapterTitle: string }): string {
  const meta = reviewProfileMeta[profile]
  return `${meta.title}\n目标章节：${context.chapterTitle}\n重点：${meta.focus}`
}
```

接线要求：
- 新增内置命令 `/review <consistency|pacing|reader_pull>`。
- `AIAssistant.vue` 命令执行时，构建 prompt 后调用现有 `aiStore.chat`。
- 输出结构化建议后写入 `suggestionsStore.addSuggestion`，按现有分类映射：`consistency -> consistency`、`pacing -> quality`、`reader_pull -> optimization`，并把原始 profile 写入 `metadata.reviewProfile`。

- [ ] **Step 4: Run tests and smoke check**

Run: `npm run test -- src/assistant/review/__tests__/reviewPromptFactory.test.ts`
Expected: PASS

Run: `npm run build`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add src/assistant/review/reviewProfiles.ts src/assistant/review/reviewPromptFactory.ts src/assistant/review/__tests__/reviewPromptFactory.test.ts src/assistant/commands/builtinCommands.ts src/components/AIAssistant.vue src/stores/suggestions.ts
git commit -m "feat: add multi-role review command workflow"
```

---

### Task 6: 文档与回归清单

**Files:**
- Create: `docs/assistant/commands.md`
- Create: `docs/assistant/review-workflow.md`
- Modify: `README.md`

- [ ] **Step 1: Write docs checklist test (manual checklist as executable markdown section)**

在 `docs/assistant/review-workflow.md` 中先写验收清单：
- `/plan`、`/write`、`/review` 在 UI 中可触发
- quick command 可从插件面板执行
- AI action 通过 registry 执行成功

- [ ] **Step 2: Run manual verification sequence**

Run: `npm run dev`
Expected: 本地启动成功

Manual checks:
1. 在助手输入 `/review consistency`
2. 看到建议写入“建议”标签页
3. 点击动作按钮，确认 action 走 registry 执行

- [ ] **Step 3: Update docs**

- `docs/assistant/commands.md`：命令语法、参数、示例。
- `docs/assistant/review-workflow.md`：三种审校角色输入输出格式。
- `README.md`：新增“命令化助手与审校工作流”小节。

- [ ] **Step 4: Final regression**

Run: `npm run test`
Expected: PASS

Run: `npm run build`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add docs/assistant/commands.md docs/assistant/review-workflow.md README.md
git commit -m "docs: add assistant command and review workflow guides"
```

---

## Execution Order (2-week cadence)

1. **Week 1 Day 1-2:** Task 1-2（命令能力可用，修复快捷命令入口）
2. **Week 1 Day 3-4:** Task 3-4（动作总线替换硬编码）
3. **Week 2 Day 1-2:** Task 5（多角色审校上线）
4. **Week 2 Day 3:** Task 6（文档+回归）

## Risks & Controls

- **Risk:** AIAssistant.vue 体量大、回归面广。
  **Control:** 新逻辑尽量放入 `src/assistant/*`，组件仅接线。
- **Risk:** 插件注册表执行链不可见。
  **Control:** 所有执行入口加统一 logger namespace（assistant:*）。
- **Risk:** 命令误解析影响普通对话。
  **Control:** 仅 `/` 前缀进入命令模式，其他输入保持原行为。
