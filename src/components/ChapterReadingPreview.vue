<template>
  <article class="chapter-reading-preview">
    <header class="reader-header">
      <p class="chapter-number">第{{ chapter.number }}章</p>
      <h1>{{ chapter.title || '未命名章节' }}</h1>
      <div class="reader-meta">
        <span>{{ chapter.wordCount || 0 }} 字</span>
        <span v-if="chapter.generationTime">{{ formatDate(chapter.generationTime) }}</span>
      </div>
    </header>

    <el-empty v-if="paragraphs.length === 0" description="暂无正文内容" />
    <section v-else class="reader-content">
      <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
    </section>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Chapter } from '@/types'
import { buildReadingPreview, splitReadingParagraphs } from '@/utils/readingPreview'

const props = defineProps<{
  chapter: Chapter
}>()

const paragraphs = computed(() => splitReadingParagraphs(props.chapter.content || buildReadingPreview(props.chapter)))

function formatDate(date: Date | string): string {
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return '未记录时间'
  return value.toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.chapter-reading-preview {
  max-width: 820px;
  margin: 0 auto;
  padding: 8px 12px 32px;
  color: #303133;
}

.reader-header {
  padding-bottom: 24px;
  margin-bottom: 20px;
  text-align: center;
  border-bottom: 1px solid #ebeef5;
}

.chapter-number {
  margin: 0 0 8px;
  color: #909399;
  letter-spacing: 0.12em;
}

.reader-header h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.4;
  font-family: 'Songti SC', 'Noto Serif SC', STSong, serif;
}

.reader-meta {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 12px;
  color: #909399;
  font-size: 13px;
}

.reader-content {
  font-size: 18px;
  line-height: 2.1;
  letter-spacing: 0.02em;
  font-family: 'Songti SC', 'Noto Serif SC', STSong, serif;
}

.reader-content p {
  margin: 0 0 1.2em;
  text-indent: 2em;
  white-space: pre-wrap;
}
</style>
