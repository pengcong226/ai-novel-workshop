# Chapters.vue 补丁 - 自动摘要生成

## 位置
在 `src/components/Chapters.vue` 文件中，找到 `saveChapter` 函数。

## 修改内容

### 1. 在 saveChapter 函数中添加以下代码

在 `await projectStore.saveCurrentProject()` 之后添加：

```typescript
// 如果是新章节或内容有变化，自动生成摘要（后台异步）
if ((isNewChapter || chapterData.content !== oldContent) && chapterData.wordCount > 100) {
  triggerSummaryGeneration(chapterData)
}
```

### 2. 在 saveChapter 函数开头保存原始内容

在 `saving.value = true` 之前添加：

```typescript
const isNewChapter = !editingChapter.value
const oldContent = editingChapter.value?.content
```

### 3. 添加 triggerSummaryGeneration 函数

在 `saveChapter` 函数之后添加新函数：

```typescript
/**
 * 触发摘要生成（后台异步）
 */
async function triggerSummaryGeneration(chapter: Chapter) {
  try {
    console.log(`[摘要生成] 开始为第${chapter.number}章生成摘要...`)

    const { generateChapterSummary, determineSummaryDetail, SummaryDetail } = await import('@/utils/summarizer')

    // 判断是否需要生成摘要（最近3章不生成）
    const maxChapter = Math.max(...(project.value?.chapters.map(c => c.number) || [0]))
    const detail = determineSummaryDetail(chapter.number, maxChapter)

    if (detail === SummaryDetail.FULL) {
      console.log(`[摘要生成] 第${chapter.number}章是最近3章，跳过`)
      return
    }

    // 生成摘要
    const summaryData = await generateChapterSummary(chapter)

    // 更新章节数据
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
    // 不显示错误消息，避免打扰用户
  }
}
```

## 完整示例

```typescript
async function saveChapter() {
  if (!chapterForm.value.title.trim()) {
    ElMessage.warning('请输入章节标题')
    return
  }

  // 添加：保存原始状态
  const isNewChapter = !editingChapter.value
  const oldContent = editingChapter.value?.content

  saving.value = true
  try {
    if (!project.value) return

    // 将 reactive 对象转换为普通对象
    const chapterData = JSON.parse(JSON.stringify(chapterForm.value))
    chapterData.wordCount = chapterData.content.length

    if (editingChapter.value) {
      const index = project.value.chapters.findIndex(c => c.id === chapterData.id)
      if (index !== -1) {
        project.value.chapters[index] = chapterData
      }
    } else {
      chapterData.id = uuidv4()
      project.value.chapters.push(chapterData)
    }

    // 更新当前字数
    project.value.currentWords = project.value.chapters.reduce((sum, c) => sum + c.wordCount, 0)

    await projectStore.saveCurrentProject()

    // 添加：自动生成摘要
    if ((isNewChapter || chapterData.content !== oldContent) && chapterData.wordCount > 100) {
      triggerSummaryGeneration(chapterData)
    }

    ElMessage.success('保存成功')
    showEditDialog.value = false
    resetForm()
  } catch (error) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

// 添加：触发摘要生成函数
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

## 说明

1. **异步执行**：摘要生成在后台进行，不阻塞用户操作
2. **智能跳过**：最近3章不生成摘要
3. **条件触发**：只在内容变化时重新生成
4. **静默失败**：失败时不显示错误，避免打扰用户
5. **自动保存**：生成后自动更新章节数据

## 测试

修改完成后，保存一个章节（字数>100），查看浏览器控制台：
- 应该看到 `[摘要生成] 开始为第X章生成摘要...`
- 如果成功，会看到 `[摘要生成] 第X章摘要已保存`
- 可以在摘要管理页面查看生成的摘要
