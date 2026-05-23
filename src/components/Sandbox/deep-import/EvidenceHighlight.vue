<template>
  <span class="evidence-highlight" :title="`${evidence.quote} (offset: ${evidence.offset})`">
    <el-tag size="small" type="info" effect="plain" class="evidence-tag">
      <el-icon><Document /></el-icon>
      {{ truncatedQuote }}
    </el-tag>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Document } from '@element-plus/icons-vue'
import type { Evidence } from '@/types/deep-import'

const props = defineProps<{
  evidence: Evidence
}>()

const truncatedQuote = computed(() => {
  const q = props.evidence.quote
  return q.length > 60 ? q.slice(0, 60) + '...' : q
})
</script>

<style scoped>
.evidence-highlight {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.evidence-tag {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  cursor: help;
}

.evidence-tag .el-icon {
  margin-right: 2px;
}
</style>
