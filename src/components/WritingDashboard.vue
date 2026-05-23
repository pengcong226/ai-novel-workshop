<template>
  <div class="writing-dashboard">
    <section class="dashboard-hero">
      <div>
        <p class="eyebrow">写作仪表盘</p>
        <h1>{{ summary.title }}</h1>
        <p class="subtitle">集中查看项目进度、章节状态与最近写作动态。</p>
      </div>
      <el-button type="primary" size="large" @click="emit('open-chapters')">
        打开章节管理
      </el-button>
    </section>

    <el-row :gutter="16" class="metrics-row">
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-label">当前字数</div>
          <div class="metric-value">{{ formatNumber(summary.currentWords) }}</div>
          <div class="metric-foot">目标 {{ formatNumber(summary.targetWords) }} 字</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-label">完成进度</div>
          <div class="metric-value">{{ summary.progressPercent }}%</div>
          <el-progress :percentage="summary.progressPercent" :show-text="false" />
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-label">章节总数</div>
          <div class="metric-value">{{ summary.chapterCount }}</div>
          <div class="metric-foot">已修订/定稿 {{ summary.completedChapterCount }} 章</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-label">平均章长</div>
          <div class="metric-value">{{ formatNumber(summary.averageChapterWords) }}</div>
          <div class="metric-foot">字 / 章</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="dashboard-grid">
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="dashboard-card">
          <template #header>
            <div class="card-header">
              <span>章节状态</span>
              <el-tag type="info" size="small">{{ summary.chapterCount }} 章</el-tag>
            </div>
          </template>
          <div class="status-list">
            <div class="status-item">
              <span>草稿</span>
              <el-progress :percentage="statusPercent(summary.statusCounts.draft)" :stroke-width="10" color="#909399" />
              <strong>{{ summary.statusCounts.draft }}</strong>
            </div>
            <div class="status-item">
              <span>已修订</span>
              <el-progress :percentage="statusPercent(summary.statusCounts.revised)" :stroke-width="10" color="#e6a23c" />
              <strong>{{ summary.statusCounts.revised }}</strong>
            </div>
            <div class="status-item">
              <span>定稿</span>
              <el-progress :percentage="statusPercent(summary.statusCounts.final)" :stroke-width="10" color="#67c23a" />
              <strong>{{ summary.statusCounts.final }}</strong>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="dashboard-card">
          <template #header>
            <div class="card-header">
              <span>继续写作</span>
              <el-button text type="primary" @click="emit('continue-writing')">进入章节</el-button>
            </div>
          </template>
          <el-empty v-if="!summary.nextChapter" description="所有章节都已定稿" :image-size="80" />
          <div v-else class="next-chapter">
            <el-tag type="warning" size="small">下一章</el-tag>
            <h3>第{{ summary.nextChapter.number }}章 {{ summary.nextChapter.title }}</h3>
            <p>{{ getChapterPreview(summary.nextChapter) }}</p>
            <el-button type="primary" plain @click="emit('continue-writing')">继续写作</el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="dashboard-card">
          <template #header>
            <div class="card-header">
              <span>快捷操作</span>
            </div>
          </template>
          <div class="quick-actions">
            <el-button type="primary" plain @click="emit('create-chapter')">新建章节</el-button>
            <el-button type="success" plain @click="emit('continue-writing')">继续写作</el-button>
            <el-button type="warning" plain @click="emit('batch-generate')">批量生成</el-button>
            <el-button plain @click="emit('open-chapters')">章节管理</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="dashboard-card recent-card">
      <template #header>
        <div class="card-header">
          <span>最近章节</span>
          <span class="muted">按生成/更新时间排序</span>
        </div>
      </template>
      <el-empty v-if="summary.recentChapters.length === 0" description="暂无章节，先创建第一章吧" />
      <div v-else class="recent-list">
        <div v-for="chapter in summary.recentChapters" :key="chapter.id" class="recent-item">
          <div>
            <div class="recent-title">第{{ chapter.number }}章 {{ chapter.title }}</div>
            <div class="recent-meta">
              {{ formatNumber(chapter.wordCount) }} 字 · {{ formatDate(chapter.generationTime) }}
            </div>
          </div>
          <div class="recent-tags">
            <el-tag size="small" :type="getStatusType(chapter.status)">{{ getStatusText(chapter.status) }}</el-tag>
            <el-tag v-if="chapter.generatedBy === 'ai'" size="small" type="success">AI生成</el-tag>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Chapter } from '@/types'
import { useProjectStore } from '@/stores/project'
import { buildWritingDashboard, getDashboardChapterPreview } from '@/utils/writingDashboard'

const emit = defineEmits<{
  'open-chapters': []
  'create-chapter': []
  'continue-writing': []
  'batch-generate': []
}>()

const projectStore = useProjectStore()
const summary = computed(() => buildWritingDashboard(projectStore.currentProject))

function statusPercent(count: number): number {
  if (summary.value.chapterCount === 0) return 0
  return Math.round((count / summary.value.chapterCount) * 100)
}

function formatNumber(num: number): string {
  if (!Number.isFinite(num)) return '0'
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`
  return num.toString()
}

function formatDate(date: Date): string {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return '未记录'
  return value.toLocaleDateString('zh-CN')
}

function getChapterPreview(chapter: Chapter): string {
  return getDashboardChapterPreview(chapter)
}

function getStatusText(status: Chapter['status']): string {
  const labels: Record<Chapter['status'], string> = {
    draft: '草稿',
    revised: '已修订',
    final: '定稿',
  }
  return labels[status]
}

function getStatusType(status: Chapter['status']): 'info' | 'warning' | 'success' {
  const types: Record<Chapter['status'], 'info' | 'warning' | 'success'> = {
    draft: 'info',
    revised: 'warning',
    final: 'success',
  }
  return types[status]
}
</script>

<style scoped>
.writing-dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-4);
}

.dashboard-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-5);
  padding: var(--ds-space-8);
  border-radius: var(--ds-radius-xl);
  background:
    linear-gradient(135deg, var(--ds-accent-subtle), transparent),
    var(--ds-surface);
  border: 1px solid var(--ds-surface-border);
  box-shadow: var(--ds-shadow-md);
}

.eyebrow {
  margin: 0 0 var(--ds-space-2);
  color: var(--ds-accent-text);
  font-weight: 700;
  letter-spacing: 0.08em;
}

.dashboard-hero h1 {
  margin: 0;
  font-size: var(--ds-text-2xl);
  color: var(--ds-text-primary);
}

.subtitle,
.muted,
.metric-foot,
.recent-meta,
.next-chapter p {
  color: var(--ds-text-tertiary);
}

.subtitle {
  margin: var(--ds-space-2) 0 0;
}

.metrics-row,
.dashboard-grid {
  row-gap: var(--ds-space-4);
}

.metric-card,
.dashboard-card {
  position: relative;
  height: 100%;
  border-radius: var(--ds-radius-lg);
  overflow: hidden;
}

.metric-card::before,
.dashboard-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--ds-accent);
}

.metric-label {
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-sm);
}

.metric-value {
  margin: var(--ds-space-2) 0;
  font-size: 30px;
  font-weight: 700;
  color: var(--ds-text-primary);
}

.card-header,
.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-3);
}

.status-list,
.quick-actions,
.recent-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-3);
}

.status-item {
  display: grid;
  grid-template-columns: 56px 1fr 32px;
  align-items: center;
  gap: var(--ds-space-3);
}

.next-chapter h3 {
  margin: var(--ds-space-3) 0 var(--ds-space-2);
  color: var(--ds-text-primary);
}

.quick-actions .el-button {
  justify-content: flex-start;
  margin-left: 0;
}

.recent-card {
  min-height: 240px;
}

.recent-item {
  padding: var(--ds-space-3) 0;
  border-bottom: 1px solid var(--ds-surface-border);
}

.recent-item:last-child {
  border-bottom: none;
}

.recent-title {
  font-weight: 600;
  color: var(--ds-text-primary);
}

.recent-tags {
  display: flex;
  gap: var(--ds-space-2);
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .dashboard-hero,
  .recent-item {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
