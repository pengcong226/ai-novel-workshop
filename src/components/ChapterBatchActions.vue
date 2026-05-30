<template>
  <el-card class="header-card">
    <div class="header">
      <h2>章节管理</h2>
      <div class="actions">
        <el-button @click="$emit('validate')" :loading="validating">
          <el-icon><CircleCheck /></el-icon>
          验证章节
        </el-button>
        <el-dropdown @command="(cmd: string) => $emit('exportCommand', cmd)" style="margin-right: 10px;">
          <el-button>
            <el-icon><Download /></el-icon>
            导出
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="exportAllMarkdown">
                <el-icon><Document /></el-icon>
                导出全部 (Markdown)
              </el-dropdown-item>
              <el-dropdown-item command="exportAllPdf">
                <el-icon><Document /></el-icon>
                导出全部 (PDF)
              </el-dropdown-item>
              <el-dropdown-item command="exportAllDocx">
                <el-icon><Document /></el-icon>
                导出全部 (DOCX)
              </el-dropdown-item>
              <el-dropdown-item command="exportAllTxt">
                <el-icon><Document /></el-icon>
                导出全部 (TXT)
              </el-dropdown-item>
              <el-dropdown-item command="exportAllEpub">
                <el-icon><Reading /></el-icon>
                导出全部 (EPUB)
              </el-dropdown-item>
              <el-dropdown-item command="exportAllJson">
                <el-icon><DataBoard /></el-icon>
                导出全部 (JSON)
              </el-dropdown-item>
              <el-dropdown-item divided command="exportSettings">
                <el-icon><Setting /></el-icon>
                导出设置...
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="primary" @click="$emit('batchGenerate')">
          <el-icon><MagicStick /></el-icon>
          批量生成
        </el-button>
        <el-button type="success" @click="$emit('writeNext')">
          <el-icon><MagicStick /></el-icon>
          一键续写
        </el-button>
        <el-button type="success" plain @click="$emit('continuation')">续写</el-button>
        <el-button type="warning" plain @click="$emit('rewrite')">改写</el-button>
        <el-button @click="$emit('addChapter')">
          <el-icon><Plus /></el-icon>
          新建章节
        </el-button>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ArrowDown, CircleCheck, DataBoard, Document, Download, MagicStick, Plus, Reading, Setting } from '@element-plus/icons-vue'

defineProps<{
  validating: boolean
}>()

defineEmits<{
  validate: []
  exportCommand: [command: string]
  batchGenerate: []
  writeNext: []
  continuation: []
  rewrite: []
  addChapter: []
}>()
</script>

<style scoped>
.header-card {
  margin-bottom: var(--ds-space-5);
  border-radius: var(--ds-radius-lg);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--ds-space-4);
}

.header h2 {
  margin: 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-xl);
}

.actions {
  display: flex;
  gap: var(--ds-space-2);
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* breakpoint: md (768px) */
@media (max-width: 768px) {
  .header {
    align-items: flex-start;
    flex-direction: column;
  }

  .actions {
    justify-content: flex-start;
  }
}
</style>
