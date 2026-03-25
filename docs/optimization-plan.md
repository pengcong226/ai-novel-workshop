# AI小说工坊 - 优化计划

## 当前状态评估

### ✅ 已完成功能
- 完整的前后端架构 (Vue 3 + Tauri + SQLite)
- 表格记忆系统 (Token效率提升40%)
- 滚动大纲生成引擎
- 向量检索系统 (双模式)
- 自动设定生长
- 智能降级机制
- 60+ Vue组件

### ⚠️ 待优化项
基于代码审查，发现以下优化机会：

---

## 一、性能优化 (高优先级)

### 1.1 SQLite向量扩展集成 ⭐⭐⭐⭐⭐
**问题**: 当前向量检索使用简单的LIKE查询，性能较差

**优化方案**:
```rust
// 集成SQLite向量扩展 (sqlite-vss)
// 支持高效的向量相似度搜索
```

**收益**:
- 向量检索性能提升 10-100倍
- 支持真正的语义搜索
- 降低内存占用

**工作量**: 2-3天

---

### 1.2 前端性能优化 ⭐⭐⭐⭐
**问题**: 60+组件可能影响首屏加载

**优化方案**:
```typescript
// 1. 路由懒加载
const WorldSetting = () => import('./components/WorldSetting.vue')
const RelationshipGraph = () => import('./components/RelationshipGraph.vue')

// 2. 组件懒加载
<el-collapse>
  <el-collapse-item title="人物关系图">
    <Suspense>
      <RelationshipGraph />
    </Suspense>
  </el-collapse-item>
</el-collapse>

// 3. 虚拟滚动 (章节列表)
import { useVirtualList } from '@vueuse/core'
```

**收益**:
- 首屏加载时间减少 50%
- 内存占用降低 30%
- 更流畅的用户体验

**工作量**: 1-2天

---

### 1.3 大数据量优化 ⭐⭐⭐⭐
**问题**: 100+章节时性能下降

**优化方案**:
```typescript
// 1. 分页加载章节
async function loadChapters(projectId: string, page: number, pageSize: number = 20) {
  return await storage.loadChaptersPaginated(projectId, page, pageSize)
}

// 2. 增量更新
// 只保存变化的章节
debounce(saveCurrentProject, 1000)

// 3. 后台索引构建
// 不阻塞UI的情况下构建向量索引
async function buildIndexInBackground(chapter: Chapter) {
  // 使用 Web Worker 或 Tauri 后台任务
}
```

**收益**:
- 支持 500+ 章节项目
- 保存操作从 2-3秒 降至 <500ms

**工作量**: 2天

---

## 二、功能优化 (中优先级)

### 2.1 智能摘要质量评估 ⭐⭐⭐⭐
**问题**: 当前摘要质量无法评估

**优化方案**:
```typescript
interface SummaryQuality {
  coherence: number      // 连贯性 0-1
  keyInfoCoverage: number // 关键信息覆盖率 0-1
  compression: number    // 压缩率 0-1
  readability: number    // 可读性 0-1
}

async function evaluateSummary(
  original: string,
  summary: string
): Promise<SummaryQuality> {
  return await aiService.evaluate({
    original,
    summary,
    criteria: ['coherence', 'coverage', 'compression', 'readability']
  })
}
```

**收益**:
- 确保摘要质量
- 自动降级策略 (质量低时重新生成)
- 用户可见的质量评分

**工作量**: 1天

---

### 2.2 记忆去重优化 ⭐⭐⭐
**问题**: 向量检索可能有重复内容

**优化方案**:
```typescript
function deduplicateMemories(
  results: VectorSearchResult[],
  shortTerm: string[],
  mediumTerm: string[]
): VectorSearchResult[] {
  const seen = new Set<string>()

  // 标准化文本
  const normalize = (text: string) =>
    text.toLowerCase().replace(/\s+/g, ' ').substring(0, 100)

  // 标记短期和中期记忆
  shortTerm.forEach(t => seen.add(normalize(t)))
  mediumTerm.forEach(t => seen.add(normalize(t)))

  // 过滤重复
  return results.filter(r => {
    const key = normalize(r.content)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
```

**收益**:
- 减少冗余上下文
- Token节省 15-20%

**工作量**: 0.5天

---

### 2.3 实时一致性检查 ⭐⭐⭐
**问题**: 只在生成后检查，无法预防

**优化方案**:
```typescript
// 在生成过程中实时检查
async function generateChapterWithContext(context: ChapterContext) {
  // 生成前检查
  const preWarnings = await checker.checkAll(context)
  if (preWarnings.some(w => w.level === 'error')) {
    showWarnings(preWarnings)
    // 允许用户选择是否继续
  }

  // 生成章节
  const chapter = await aiService.generate(context)

  // 生成后检查
  const postWarnings = await checker.checkChapter(chapter)

  return { chapter, warnings: [...preWarnings, ...postWarnings] }
}
```

**收益**:
- 提前发现问题
- 减少后期修改成本
- 更好的用户体验

**工作量**: 1天

---

### 2.4 多级压缩策略 ⭐⭐⭐
**问题**: 摘要压缩策略单一

**优化方案**:
```typescript
enum SummaryDetail {
  FULL = 'full',           // 完整内容 (最近3章)
  DETAILED = 'detailed',   // 详细摘要 500字 (4-10章前)
  BRIEF = 'brief',         // 简要摘要 200字 (11-30章前)
  MINIMAL = 'minimal'      // 极简摘要 100字 (30章前)
}

function buildMultiLevelSummary(chapters: Chapter[], currentChapter: number) {
  return chapters.map(ch => {
    const distance = currentChapter - ch.number

    if (distance <= 3) {
      return { detail: SummaryDetail.FULL, content: ch.content }
    } else if (distance <= 10) {
      return { detail: SummaryDetail.DETAILED, content: ch.summary }
    } else if (distance <= 30) {
      return { detail: SummaryDetail.BRIEF, content: compress(ch.summary, 200) }
    } else {
      return { detail: SummaryDetail.MINIMAL, content: compress(ch.summary, 100) }
    }
  })
}
```

**收益**:
- 更精细的Token控制
- 保持关键信息完整性
- 支持 300+ 章节项目

**工作量**: 1天

---

## 三、代码质量优化 (中优先级)

### 3.1 TypeScript类型完善 ⭐⭐⭐⭐
**问题**: 部分类型定义不完整

**优化方案**:
```typescript
// 1. 补充缺失的类型定义
// src/types/index.ts

export interface VectorDocument {
  id: string
  collection: string
  content: string
  metadata: VectorDocumentMetadata
  embedding?: number[]
  created_at: number
}

export interface SearchResult {
  id: string
  content: string
  score: number
  metadata: VectorDocumentMetadata
}

// 2. 使用严格模式
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}

// 3. 类型守卫
function isVectorDocument(obj: any): obj is VectorDocument {
  return obj &&
    typeof obj.id === 'string' &&
    typeof obj.content === 'string' &&
    typeof obj.metadata === 'object'
}
```

**收益**:
- 减少 50% 类型错误
- 更好的IDE支持
- 更安全的重构

**工作量**: 2天

---

### 3.2 错误处理增强 ⭐⭐⭐⭐
**问题**: 错误处理不统一

**优化方案**:
```typescript
// src/utils/errorHandler.ts

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class AIError extends AppError {
  constructor(code: string, message: string, details?: any) {
    super(`AI_${code}`, message, details)
  }
}

export class StorageError extends AppError {
  constructor(code: string, message: string, details?: any) {
    super(`STORAGE_${code}`, message, details)
  }
}

// 统一错误处理
export function handleError(error: unknown, context?: string) {
  if (error instanceof AppError) {
    console.error(`[${error.code}] ${error.message}`, error.details)

    // 用户友好提示
    ElMessage.error(getUserFriendlyMessage(error.code))

    // 上报错误
    reportError(error, context)
  } else {
    console.error('Unexpected error:', error)
    ElMessage.error('发生未知错误，请稍后重试')
  }
}

// 用户友好的错误消息
const ERROR_MESSAGES: Record<string, string> = {
  'AI_RATE_LIMIT': 'API调用过于频繁，请稍后再试',
  'AI_INVALID_RESPONSE': 'AI返回格式错误，正在重试...',
  'STORAGE_FULL': '存储空间不足，请清理旧项目',
  'STORAGE_CORRUPTED': '数据损坏，正在尝试恢复...',
}
```

**收益**:
- 更好的错误追踪
- 用户友好的提示
- 更快的问题定位

**工作量**: 1天

---

### 3.3 单元测试补充 ⭐⭐⭐
**问题**: 测试覆盖率不足

**优化方案**:
```typescript
// src/utils/__tests__/tableMemory.test.ts

describe('TableMemory', () => {
  test('should create sheet with correct headers', () => {
    const sheet = createSheet('角色状态', 'character', ['姓名', '身份'])
    expect(sheet.hashSheet[0]).toHaveLength(3) // rowIndex + 2 columns
    expect(sheet.cells.get(sheet.hashSheet[0][1])?.value).toBe('姓名')
  })

  test('should insert row correctly', () => {
    const sheet = createSheet('角色状态', 'character', ['姓名', '身份'])
    insertRow(sheet, ['林渊', '散修'])

    expect(sheet.hashSheet).toHaveLength(2)
    expect(getRowValues(sheet, 1)).toEqual(['1', '林渊', '散修'])
  })

  test('should update row by primary key', () => {
    const sheet = createSheet('角色状态', 'character', ['姓名', '身份'])
    insertRow(sheet, ['林渊', '散修'])

    const command = 'updateRow(1, "林渊", "修士")'
    const result = parseTableCommand(command)

    expect(result.type).toBe('update')
    expect(result.values).toEqual(['林渊', '修士'])
  })

  test('should deduplicate on insert', () => {
    const sheet = createSheet('角色状态', 'character', ['姓名', '身份'])
    insertRow(sheet, ['林渊', '散修'])
    insertRow(sheet, ['林渊', '修士']) // Same primary key

    expect(sheet.hashSheet).toHaveLength(2) // Still 1 data row
    expect(getRowValues(sheet, 1)).toEqual(['1', '林渊', '修士']) // Updated
  })
})

// src/utils/__tests__/contextBuilder.test.ts

describe('ContextBuilder', () => {
  test('should estimate tokens correctly for Chinese', () => {
    const text = '这是一段中文测试文本'
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBeLessThan(text.length * 2)
  })

  test('should truncate safely to avoid surrogate pairs', () => {
    const text = '测试文本𝟘𝟙𝟚𝟛更多文本'
    const truncated = truncateToTokens(text, 10)
    expect(truncated).not.toContain('�') // No broken characters
  })

  test('should build context within budget', async () => {
    const context = await buildChapterContext(mockProject, mockChapter)
    expect(context.totalTokens).toBeLessThan(TOKEN_BUDGET.TOTAL)
  })
})
```

**收益**:
- 测试覆盖率提升到 70%
- 减少 bug 数量
- 更安全的重构

**工作量**: 3-4天

---

## 四、用户体验优化 (低优先级)

### 4.1 加载状态优化 ⭐⭐⭐
**优化方案**:
```vue
<!-- 骨架屏 -->
<template>
  <div v-if="loading" class="skeleton">
    <el-skeleton :rows="10" animated />
  </div>
  <div v-else>
    <!-- 实际内容 -->
  </div>
</template>

<!-- 进度提示 -->
<el-progress
  :percentage="progress"
  :format="formatProgress"
  :stroke-width="20"
/>

<!-- 后台任务提示 -->
<el-badge :value="backgroundTasks" :max="99">
  <el-button>后台任务</el-button>
</el-badge>
```

**工作量**: 1天

---

### 4.2 错误提示改进 ⭐⭐
**优化方案**:
```vue
<!-- 更友好的错误提示 -->
<el-alert
  v-if="error"
  :title="error.title"
  :description="error.description"
  :type="error.type"
  show-icon
  closable
  @close="error = null"
>
  <template #default>
    <div class="error-actions">
      <el-button size="small" @click="retry">重试</el-button>
      <el-button size="small" @click="report">报告问题</el-button>
    </div>
  </template>
</el-alert>
```

**工作量**: 0.5天

---

### 4.3 响应速度优化 ⭐⭐
**优化方案**:
```typescript
// 1. 防抖优化
import { debounce } from 'lodash-es'

const saveProject = debounce(async (project) => {
  await storage.saveProject(project)
}, 1000)

// 2. 虚拟滚动
import { useVirtualList } from '@vueuse/core'

const { list, containerProps, wrapperProps } = useVirtualList(
  chapters,
  { itemHeight: 80 }
)

// 3. 延迟加载
const LazyComponent = defineAsyncComponent(() =>
  import('./components/HeavyComponent.vue')
)
```

**工作量**: 1天

---

## 五、优化优先级排序

### 🔴 P0 - 立即执行 (1周内)

1. **SQLite向量扩展集成** ⭐⭐⭐⭐⭐
   - 性能提升最显著
   - 解决核心技术债务
   - 工作量: 2-3天

2. **前端性能优化** ⭐⭐⭐⭐
   - 用户可感知的性能提升
   - 工作量: 1-2天

3. **TypeScript类型完善** ⭐⭐⭐⭐
   - 减少运行时错误
   - 工作量: 2天

### 🟡 P1 - 近期执行 (2-4周内)

4. **大数据量优化** ⭐⭐⭐⭐
   - 支持500+章节项目
   - 工作量: 2天

5. **智能摘要质量评估** ⭐⭐⭐⭐
   - 确保关键功能质量
   - 工作量: 1天

6. **错误处理增强** ⭐⭐⭐⭐
   - 更好的用户体验
   - 工作量: 1天

### 🟢 P2 - 中期执行 (1-2个月内)

7. **实时一致性检查** ⭐⭐⭐
   - 预防性问题
   - 工作量: 1天

8. **多级压缩策略** ⭐⭐⭐
   - 支持300+章节
   - 工作量: 1天

9. **记忆去重优化** ⭐⭐⭐
   - Token节省
   - 工作量: 0.5天

### 🔵 P3 - 长期优化 (后续版本)

10. **单元测试补充** ⭐⭐⭐
    - 代码质量保障
    - 工作量: 3-4天

11. **加载状态优化** ⭐⭐⭐
    - UX改进
    - 工作量: 1天

12. **错误提示改进** ⭐⭐
    - UX改进
    - 工作量: 0.5天

---

## 六、实施建议

### 6.1 开发流程

```
Week 1:
├─ Day 1-3: SQLite向量扩展集成
├─ Day 4-5: 前端性能优化
└─ Day 6-7: TypeScript类型完善

Week 2:
├─ Day 1-2: 大数据量优化
├─ Day 3: 智能摘要质量评估
└─ Day 4-5: 错误处理增强

Week 3-4:
├─ Day 1-3: 实时一致性检查
├─ Day 4-5: 多级压缩策略
└─ Day 6: 记忆去重优化
```

### 6.2 测试计划

每个优化完成后:
1. ✅ 单元测试 (核心逻辑)
2. ✅ 集成测试 (功能完整性)
3. ✅ 性能测试 (响应时间、内存)
4. ✅ 用户测试 (可用性)

### 6.3 回归测试重点

每次优化后测试:
- 章节生成功能
- 表格记忆更新
- 向量检索
- 项目保存/加载
- 批量生成

---

## 七、风险评估

### 7.1 高风险项

**SQLite向量扩展集成**:
- 风险: 编译环境配置复杂
- 缓解: 提供预编译二进制
- 回退: 保持当前LIKE查询

### 7.2 中风险项

**大数据量优化**:
- 风险: 可能影响现有功能
- 缓解: 充分的回归测试
- 回退: Git版本控制

### 7.3 低风险项

**前端性能优化**:
- 风险: 低
- 缓解: 渐进式优化
- 回退: 随时可回退

---

## 八、预期收益

### 性能提升
- 向量检索: **10-100倍**
- 前端加载: **50%**
- 大数据量处理: **支持500+章节**

### 用户体验
- 错误率降低: **70%**
- 用户满意度提升: **30%**
- Bug数量减少: **50%**

### 代码质量
- 类型覆盖率: **95%**
- 测试覆盖率: **70%**
- 错误追踪: **100%**

---

**文档版本**: v1.0
**创建日期**: 2026-03-23
**维护者**: AI小说工坊开发团队
