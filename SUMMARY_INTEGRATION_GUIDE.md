# 自动摘要生成系统 - 集成指南

## 已完成的实现

### 1. 核心文件
- ✅ `src/utils/summarizer.ts` - 摘要生成核心逻辑
- ✅ `src/components/SummaryManager.vue` - 摘要管理界面
- ✅ `src/utils/summaryIntegration.ts` - 摘要集成工具
- ✅ 更新 `src/types/index.ts` - 添加摘要相关类型
- ✅ 更新 `src/utils/contextBuilder.ts` - 集成摘要到上下文

### 2. 系统功能

#### 2.1 摘要生成功能
- 为每章生成摘要（200-500字）
- 自动提取关键信息：事件、人物、地点、剧情推进
- 质量检查：完整度、连贯性、简洁性

#### 2.2 滑动窗口摘要策略
- **最近3章**：完整内容（不生成摘要）
- **4-10章前**：详细摘要（500字）
- **11-30章前**：简要摘要（200字）
- **30章前**：极简摘要（100字）

#### 2.3 多层次摘要
- 章节摘要 ✅
- 卷摘要（合并章节摘要）✅
- 全书摘要（待实现）

## 需要手动集成的部分

### 1. 在 Chapters.vue 中添加自动触发

在 `src/components/Chapters.vue` 的 `saveChapter` 函数末尾添加：

```typescript
async function saveChapter() {
  // ... 现有代码 ...

  await projectStore.saveCurrentProject()

  // 添加以下代码：自动生成摘要
  if ((isNewChapter || chapterData.content !== oldContent) && chapterData.wordCount > 100) {
    triggerSummaryGeneration(chapterData)
  }

  ElMessage.success('保存成功')
  // ...
}

// 添加这个新函数
async function triggerSummaryGeneration(chapter: Chapter) {
  try {
    console.log(`[摘要生成] 开始为第${chapter.number}章生成摘要...`)

    const { generateChapterSummary, determineSummaryDetail, SummaryDetail } = await import('@/utils/summarizer')

    const maxChapter = Math.max(...(project.value?.chapters.map(c => c.number) || [0]))
    const detail = determineSummaryDetail(chapter.number, maxChapter)

    if (detail === SummaryDetail.FULL) {
      console.log(`[摘要生成] 第${chapter.number}章是最近3章，跳过`)
      return
    }

    const summaryData = await generateChapterSummary(chapter)

    if (project.value) {
      const index = project.value.chapters.findIndex(c => c.id === chapter.id)
      if (index !== -1) {
        project.value.chapters[index].summaryData = summaryData
        project.value.chapters[index].summary = summaryData.summary
        await projectStore.saveCurrentProject()
        console.log(`[摘要生成] 第${chapter.number}章摘要已保存`)
      }
    }
  } catch (error) {
    console.error('[摘要生成] 失败:', error)
  }
}
```

### 2. 在路由中添加摘要管理页面

在 `src/router/index.ts` 中添加路由：

```typescript
{
  path: '/project/:id/summary',
  name: 'SummaryManager',
  component: () => import('@/components/SummaryManager.vue'),
  meta: { requiresProject: true }
}
```

### 3. 在侧边栏添加导航入口

在项目编辑器的侧边栏添加"摘要管理"菜单项。

## 使用方式

### 1. 自动生成
- 章节保存时自动触发（需完成上述集成）
- 仅对100字以上的章节生成摘要
- 最近3章不生成摘要

### 2. 手动管理
- 打开摘要管理页面
- 查看所有章节摘要
- 手动生成、编辑或重新生成摘要
- 查看摘要质量评分

### 3. 批量生成
- 在摘要管理页面点击"生成所有摘要"
- 系统会自动为所有符合条件的章节生成摘要

## 摘要数据结构

```typescript
interface ChapterSummaryData {
  id: string
  chapterNumber: number
  title: string
  summary: string              // 摘要内容
  keyEvents: string[]          // 关键事件
  characters: string[]         // 出场人物
  locations: string[]          // 场景地点
  plotProgression: string      // 剧情推进
  emotionalTone?: string       // 情感基调
  conflicts?: string[]         // 冲突
  resolutions?: string[]       // 解决方案
  wordCount: number            // 原文字数
  summaryWordCount: number     // 摘要字数
  tokenCount: number           // token数
  createdAt: Date
  updatedAt: Date
  detail: SummaryDetail        // 摘要详细度
}
```

## 质量检查

系统会自动检查摘要质量，包括：

1. **长度检查**：是否符合目标字数
2. **完整度**：是否包含关键信息
   - 关键事件
   - 出场人物
   - 场景地点
   - 剧情推进
3. **连贯性**：是否有连接词
4. **简洁性**：是否避免重复

评分范围：0-10分
- ≥6分：合格
- <6分：需要改进

## 性能优化建议

1. **异步生成**：摘要生成在后台进行，不阻塞用户操作
2. **缓存机制**：生成的摘要会缓存，避免重复生成
3. **增量更新**：只在内容变化时重新生成
4. **批量处理**：支持批量生成，提高效率

## 成本控制

摘要生成使用配置的AI模型，建议：
- 使用成本较低的模型（如 GPT-3.5）
- 设置合理的 token 限制（默认1000）
- 批量生成时添加延迟（默认500ms）

## 后续优化方向

1. **增量摘要**：只对新增内容生成摘要
2. **并行处理**：多章节并行生成
3. **智能触发**：根据内容变化程度决定是否重新生成
4. **摘要索引**：建立向量索引，支持语义检索
5. **摘要问答**：基于摘要回答用户问题
