<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="导出设置"
    width="600px"
  >
    <el-tabs v-model="activeTab">
      <!-- Markdown 设置 -->
      <el-tab-pane label="Markdown" name="markdown">
        <el-form :model="markdownSettings" label-width="120px">
          <el-form-item label="包含元数据">
            <el-switch v-model="markdownSettings.includeMetadata" />
            <span class="setting-hint">包含字数、创建时间、状态等信息</span>
          </el-form-item>

          <el-form-item label="包含大纲">
            <el-switch v-model="markdownSettings.includeOutline" />
            <span class="setting-hint">包含章节目标和冲突信息</span>
          </el-form-item>

          <el-form-item label="包含人物">
            <el-switch v-model="markdownSettings.includeCharacters" />
            <span class="setting-hint">章节末尾列出出场人物</span>
          </el-form-item>

          <el-form-item label="包含地点">
            <el-switch v-model="markdownSettings.includeLocation" />
            <span class="setting-hint">章节末尾列出场景地点</span>
          </el-form-item>

          <el-form-item label="包含摘要">
            <el-switch v-model="markdownSettings.includeSummary" />
            <span class="setting-hint">包含章节摘要</span>
          </el-form-item>

          <el-form-item label="章节分隔符">
            <el-select v-model="markdownSettings.chapterSeparator" style="width: 100%">
              <el-option label="水平线 (---)" value="&#10;&#10;---&#10;&#10;" />
              <el-option label="星号线 (***)" value="&#10;&#10;***&#10;&#10;" />
              <el-option label="双换行" value="&#10;&#10;" />
              <el-option label="分页符" value="page-break" />
            </el-select>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- PDF 设置 -->
      <el-tab-pane label="PDF" name="pdf">
        <el-form :model="pdfSettings" label-width="120px">
          <el-form-item label="页面大小">
            <el-select v-model="pdfSettings.pageSize" style="width: 100%">
              <el-option label="A4" value="A4" />
              <el-option label="A5" value="A5" />
              <el-option label="Letter" value="Letter" />
            </el-select>
          </el-form-item>

          <el-form-item label="正文字号">
            <el-slider
              v-model="pdfSettings.fontSize"
              :min="12"
              :max="24"
              :marks="fontSizeMarks"
              show-input
            />
          </el-form-item>

          <el-form-item label="行高">
            <el-slider
              v-model="pdfSettings.lineHeight"
              :min="1.2"
              :max="2.5"
              :step="0.1"
              :marks="lineHeightMarks"
              show-input
            />
          </el-form-item>

          <el-form-item label="字体">
            <el-select v-model="pdfSettings.fontFamily" style="width: 100%">
              <el-option label="衬线体 (Georgia)" value="Georgia, 'Noto Serif SC', serif" />
              <el-option label="宋体" value="'SimSun', 'Songti SC', serif" />
              <el-option label="黑体" value="'SimHei', 'Heiti SC', sans-serif" />
              <el-option label="楷体" value="'KaiTi', 'Kaiti SC', serif" />
              <el-option label="无衬线体" value="'Microsoft YaHei', 'PingFang SC', sans-serif" />
            </el-select>
          </el-form-item>

          <el-form-item label="页边距">
            <el-row :gutter="10">
              <el-col :span="6">
                <el-input-number
                  v-model="pdfSettings.margin.top"
                  :min="10"
                  :max="50"
                  size="small"
                  placeholder="上"
                />
                <div class="margin-label">上</div>
              </el-col>
              <el-col :span="6">
                <el-input-number
                  v-model="pdfSettings.margin.right"
                  :min="10"
                  :max="50"
                  size="small"
                  placeholder="右"
                />
                <div class="margin-label">右</div>
              </el-col>
              <el-col :span="6">
                <el-input-number
                  v-model="pdfSettings.margin.bottom"
                  :min="10"
                  :max="50"
                  size="small"
                  placeholder="下"
                />
                <div class="margin-label">下</div>
              </el-col>
              <el-col :span="6">
                <el-input-number
                  v-model="pdfSettings.margin.left"
                  :min="10"
                  :max="50"
                  size="small"
                  placeholder="左"
                />
                <div class="margin-label">左</div>
              </el-col>
            </el-row>
          </el-form-item>

          <el-form-item label="包含目录">
            <el-switch v-model="pdfSettings.includeToc" />
          </el-form-item>

          <el-form-item label="包含页码">
            <el-switch v-model="pdfSettings.includePageNumber" />
          </el-form-item>

          <el-form-item label="包含页眉">
            <el-switch v-model="pdfSettings.includeHeader" />
          </el-form-item>

          <el-form-item label="章节另起页">
            <el-switch v-model="pdfSettings.chapterStartPage" />
            <span class="setting-hint">每个章节从新的一页开始</span>
          </el-form-item>

          <el-form-item label="包含元数据">
            <el-switch v-model="pdfSettings.includeMetadata" />
            <span class="setting-hint">包含字数、状态等信息</span>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="handleExport" :loading="exporting">
        导出
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Chapter, Project } from '@/types'
import {
  exportChapterToMarkdown,
  exportAllChaptersToMarkdown,
  DEFAULT_MD_OPTIONS,
  type MarkdownExportOptions
} from '@/utils/markdownExporter'
import {
  exportChapterToPdf,
  exportAllChaptersToPdf,
  DEFAULT_PDF_OPTIONS,
  type PdfExportOptions
} from '@/utils/pdfExporter'

interface Props {
  modelValue: boolean
  project: Project | null
  chapters: Chapter[]
  selectedChapter?: Chapter | null
  exportMode: 'single' | 'all'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'exported'): void
}>()

const activeTab = ref('markdown')
const exporting = ref(false)

// Markdown 设置
const markdownSettings = ref<MarkdownExportOptions>({
  ...DEFAULT_MD_OPTIONS
})

// PDF 设置
const pdfSettings = ref<PdfExportOptions>({
  ...DEFAULT_PDF_OPTIONS,
  title: props.project?.title || '未命名小说',
  author: 'AI小说工坊'
})

// 字号标记
const fontSizeMarks = {
  12: '12px',
  16: '16px',
  20: '20px',
  24: '24px'
}

// 行高标记
const lineHeightMarks = {
  1.2: '1.2',
  1.5: '1.5',
  2.0: '2.0',
  2.5: '2.5'
}

// 监听项目变化
watch(() => props.project, (newProject) => {
  if (newProject) {
    pdfSettings.value.title = newProject.title
  }
}, { immediate: true })

// 处理导出
async function handleExport() {
  if (!props.project) {
    return
  }

  exporting.value = true

  try {
    if (activeTab.value === 'markdown') {
      if (props.exportMode === 'single' && props.selectedChapter) {
        exportChapterToMarkdown(
          props.selectedChapter,
          props.project.title,
          markdownSettings.value
        )
      } else {
        exportAllChaptersToMarkdown(
          props.chapters,
          props.project.title,
          markdownSettings.value,
          (current, total) => {
            console.log(`导出进度: ${current}/${total}`)
          }
        )
      }
    } else {
      // PDF
      if (props.exportMode === 'single' && props.selectedChapter) {
        exportChapterToPdf(
          props.selectedChapter,
          props.project,
          pdfSettings.value
        )
      } else {
        exportAllChaptersToPdf(
          props.chapters,
          props.project,
          pdfSettings.value,
          (current, total) => {
            console.log(`导出进度: ${current}/${total}`)
          }
        )
      }
    }

    emit('exported')
    emit('update:modelValue', false)
  } catch (error) {
    console.error('导出失败:', error)
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.setting-hint {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.margin-label {
  text-align: center;
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

:deep(.el-slider__marks-text) {
  font-size: 12px;
}
</style>
