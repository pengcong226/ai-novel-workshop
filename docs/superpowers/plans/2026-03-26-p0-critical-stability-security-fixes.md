# P0 Critical Stability & Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 3 个 P0 问题（硬编码密钥、建议导航失效、章节 projectId 一致性），恢复核心可用性与最低安全基线。

**Architecture:** 保持现有 Vue + Pinia + Tauri/IndexedDB 架构不变，只做最小改动。通过“可测试的小函数 + 组件最小接线”落地修复，避免大规模重构。优先建立回归测试，确保后续改动不会重复引入同类问题。

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest, Node.js scripts

---

## File Structure

### New files
- `src/utils/suggestionNavigation.ts`
  负责把 `navigateTarget` 解析为编辑器可执行的内部导航指令（菜单切换 + 可选参数）。
- `src/utils/__tests__/suggestionNavigation.test.ts`
  覆盖导航目标解析规则。
- `src/stores/chapterPersistence.ts`
  负责章节写入前的 `projectId` 归一化。
- `src/stores/__tests__/chapterPersistence.test.ts`
  覆盖章节归一化逻辑。
- `scripts/e2eProviderConfig.js`
  统一 E2E 脚本读取环境变量，不允许硬编码 API key。
- `scripts/__tests__/e2eProviderConfig.test.ts`
  覆盖配置读取与缺失报错。

### Modified files
- `src/components/AIAssistant.vue`
  使用导航解析器，替换无效的 `window.location.hash` 逻辑。
- `src/views/ProjectEditor.vue`
  监听内部导航事件，切换 `activeMenu`。
- `src/stores/suggestions.ts`
  修正默认建议目标值（避免无效路由）。
- `src/components/Chapters.vue`
  保存章节时补齐 `projectId`。
- `src/stores/storage.ts`
  在 IndexedDB 写入路径统一注入 `projectId`。
- `src/types/index.ts`
  给 `Chapter` 增加 `projectId`（可选，平滑过渡）。
- `test-e2e.js`
  移除硬编码 key，改用配置模块。
- `auto-writer.js`
  移除硬编码 key，改用配置模块。

---

## Chunk 1: Remove hardcoded API keys (Security P0)

### Task 1: 抽离并强制使用环境变量配置

**Files:**
- Create: `scripts/e2eProviderConfig.js`
- Create: `scripts/__tests__/e2eProviderConfig.test.ts`
- Modify: `test-e2e.js`
- Modify: `auto-writer.js`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/__tests__/e2eProviderConfig.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getE2EProviderConfig } from '../e2eProviderConfig'

describe('getE2EProviderConfig', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws when E2E_API_KEY is missing', () => {
    vi.stubEnv('E2E_API_KEY', '')
    expect(() => getE2EProviderConfig()).toThrow('E2E_API_KEY')
  })

  it('returns provider config from env', () => {
    vi.stubEnv('E2E_API_KEY', 'sk-test-123')
    const config = getE2EProviderConfig()
    expect(config.apiKey).toBe('sk-test-123')
    expect(config.baseUrl).toContain('maas-api.ai-yuanjing.com')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- scripts/__tests__/e2eProviderConfig.test.ts`
Expected: FAIL with `Cannot find module '../e2eProviderConfig'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/e2eProviderConfig.js
export function getE2EProviderConfig() {
  const apiKey = process.env.E2E_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('E2E_API_KEY is required for E2E scripts')
  }

  return {
    id: 'test-provider',
    name: 'YuanJing',
    type: 'custom',
    baseUrl: 'https://maas-api.ai-yuanjing.com/openapi/compatible-mode/v1',
    apiKey,
    isEnabled: true,
    models: [{ id: 'glm-5', name: 'glm-5', isEnabled: true }]
  }
}
```

并在 `test-e2e.js` / `auto-writer.js` 替换硬编码 `apiKey`：
- Node 侧先 `const provider = getE2EProviderConfig()`
- `page.evaluate((provider) => { ... providers: [provider] ... }, provider)`

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- scripts/__tests__/e2eProviderConfig.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/e2eProviderConfig.js scripts/__tests__/e2eProviderConfig.test.ts test-e2e.js auto-writer.js
git commit -m "fix: remove hardcoded e2e api keys"
```

---

## Chunk 2: Fix broken suggestion navigation (Stability P0)

### Task 2: 用内部菜单导航替代无效 hash/path 导航

**Files:**
- Create: `src/utils/suggestionNavigation.ts`
- Create: `src/utils/__tests__/suggestionNavigation.test.ts`
- Modify: `src/components/AIAssistant.vue`
- Modify: `src/views/ProjectEditor.vue`
- Modify: `src/stores/suggestions.ts`
- Modify: `src/types/suggestions.ts` (only if needed for stricter target typing)

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/__tests__/suggestionNavigation.test.ts
import { describe, it, expect } from 'vitest'
import { resolveSuggestionNavigation } from '../suggestionNavigation'

describe('resolveSuggestionNavigation', () => {
  it('maps /chapters to chapters menu', () => {
    expect(resolveSuggestionNavigation('/chapters')).toEqual({ menu: 'chapters' })
  })

  it('maps /chapters/:num to chapters menu with chapterNumber', () => {
    expect(resolveSuggestionNavigation('/chapters/12')).toEqual({ menu: 'chapters', chapterNumber: 12 })
  })

  it('maps /characters/:id to characters menu with characterId', () => {
    expect(resolveSuggestionNavigation('/characters/abc')).toEqual({ menu: 'characters', characterId: 'abc' })
  })

  it('returns null for unknown target', () => {
    expect(resolveSuggestionNavigation('/unknown')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/utils/__tests__/suggestionNavigation.test.ts`
Expected: FAIL with missing module/function

- [ ] **Step 3: Write minimal implementation + wiring**

```ts
// src/utils/suggestionNavigation.ts
export interface SuggestionNavInstruction {
  menu: 'chapters' | 'characters'
  chapterNumber?: number
  characterId?: string
}

export function resolveSuggestionNavigation(target: string): SuggestionNavInstruction | null {
  if (target === '/chapters') return { menu: 'chapters' }

  const chapterMatch = target.match(/^\/chapters\/(\d+)$/)
  if (chapterMatch) return { menu: 'chapters', chapterNumber: Number(chapterMatch[1]) }

  const characterMatch = target.match(/^\/characters\/([^/]+)$/)
  if (characterMatch) return { menu: 'characters', characterId: characterMatch[1] }

  return null
}
```

接线要求：
- `AIAssistant.vue` 中 `handleSuggestionAction`：
  - 删除 `window.location.hash = ...`
  - 调用 `resolveSuggestionNavigation`
  - 成功时 `window.dispatchEvent(new CustomEvent('editor:navigate', { detail: instruction }))`
  - 失败时给出提示（不 silent fail）
- `ProjectEditor.vue`：
  - `onMounted` 注册 `editor:navigate` 监听，设置 `activeMenu`
  - `onUnmounted` 清理监听
- `suggestions.ts` 中默认 target 改为可解析值（保留 `/chapters`、`/chapters/:num`、`/characters/:id`）

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- src/utils/__tests__/suggestionNavigation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/suggestionNavigation.ts src/utils/__tests__/suggestionNavigation.test.ts src/components/AIAssistant.vue src/views/ProjectEditor.vue src/stores/suggestions.ts
git commit -m "fix: restore suggestion navigation flow in editor"
```

---

## Chunk 3: Enforce chapter.projectId consistency (Data Integrity P0)

### Task 3: 写入前统一补齐 projectId，阻断新数据污染

**Files:**
- Create: `src/stores/chapterPersistence.ts`
- Create: `src/stores/__tests__/chapterPersistence.test.ts`
- Modify: `src/components/Chapters.vue`
- Modify: `src/stores/storage.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/stores/__tests__/chapterPersistence.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeChapterForProject } from '../chapterPersistence'

describe('normalizeChapterForProject', () => {
  it('injects missing projectId', () => {
    const chapter = { id: 'c1', number: 1, title: 't', content: 'x', wordCount: 1 }
    const normalized = normalizeChapterForProject(chapter as any, 'p1')
    expect(normalized.projectId).toBe('p1')
  })

  it('keeps existing projectId when same', () => {
    const chapter = { id: 'c1', projectId: 'p1' }
    const normalized = normalizeChapterForProject(chapter as any, 'p1')
    expect(normalized.projectId).toBe('p1')
  })

  it('overwrites wrong projectId with authoritative project id', () => {
    const chapter = { id: 'c1', projectId: 'p2' }
    const normalized = normalizeChapterForProject(chapter as any, 'p1')
    expect(normalized.projectId).toBe('p1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/stores/__tests__/chapterPersistence.test.ts`
Expected: FAIL with missing module/function

- [ ] **Step 3: Write minimal implementation + wiring**

```ts
// src/stores/chapterPersistence.ts
export function normalizeChapterForProject<T extends Record<string, unknown>>(chapter: T, projectId: string): T & { projectId: string } {
  return {
    ...chapter,
    projectId
  }
}

export function normalizeChaptersForProject<T extends Record<string, unknown>>(chapters: T[], projectId: string): Array<T & { projectId: string }> {
  return chapters.map(ch => normalizeChapterForProject(ch, projectId))
}
```

接线要求：
- `Chapters.vue:saveChapter` 写入 `chapterData.projectId = project.value.id`
- `storage.ts`:
  - `IndexedDBStorage.saveProject` 批量写章节前调用 `normalizeChaptersForProject(chapters, projectMeta.id)`
  - `IndexedDBStorage.saveChapter` 要求 `chapter.projectId`，否则抛错
- `types/index.ts`:
  - `Chapter` 增加 `projectId?: string`（兼容老数据）

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- src/stores/__tests__/chapterPersistence.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/chapterPersistence.ts src/stores/__tests__/chapterPersistence.test.ts src/components/Chapters.vue src/stores/storage.ts src/types/index.ts
git commit -m "fix: enforce chapter projectId consistency on persistence"
```

---

## Chunk 4: Verification gate

### Task 4: 回归验证与结果确认

**Files:**
- Test only (no required code changes)

- [ ] **Step 1: Run targeted tests**

Run:
- `npm run test -- scripts/__tests__/e2eProviderConfig.test.ts`
- `npm run test -- src/utils/__tests__/suggestionNavigation.test.ts`
- `npm run test -- src/stores/__tests__/chapterPersistence.test.ts`

Expected: all PASS

- [ ] **Step 2: Run full plugin baseline tests to avoid accidental regressions**

Run:
- `npm run test -- src/plugins/__tests__/processor-registry.test.ts`
- `npm run test -- src/plugins/__tests__/importer-exporter-pipeline.test.ts`

Expected: PASS

- [ ] **Step 3: Manual smoke check (dev runtime)**

Run: `npm run dev`

Checklist:
- 在项目编辑器中触发建议动作“开始创作/查看章节/编辑人物”能切换到正确菜单
- 新建章节后刷新重开项目，章节仍能正确加载
- 运行 `node test-e2e.js` / `node auto-writer.js` 时，未设置 `E2E_API_KEY` 会明确报错，不再读取硬编码密钥

- [ ] **Step 4: Final commit for any verification-only adjustments (if needed)**

```bash
git add <only-if-changed-files>
git commit -m "test: add p0 regression coverage and verification fixes"
```

---

## Notes
- 这是 P0 止血计划：只修复关键失效点，不做架构重构。
- 对历史上已写入但缺失 `projectId` 的旧章节数据，本计划不做自动修复迁移；后续可单独开 migration 计划。
- 执行中每完成一个 Task 就跑对应测试并提交，避免大批量变更难回滚。

Plan complete and saved to `docs/superpowers/plans/2026-03-26-p0-critical-stability-security-fixes.md`. Ready to execute?