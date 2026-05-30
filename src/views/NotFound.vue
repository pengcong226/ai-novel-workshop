<template>
  <div class="not-found">
    <div class="not-found-card glass-panel">
      <div class="not-found-code">404</div>
      <h1 class="not-found-title">页面未找到</h1>
      <p class="not-found-message">
        你访问的页面不存在或已被移除。
      </p>
      <div class="not-found-actions">
        <el-button type="primary" round @click="goHome">
          返回首页
        </el-button>
        <el-button round @click="goBack">
          返回上一页
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function goHome() {
  router.push({ name: 'ProjectList' })
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    goHome()
  }
}
</script>

<style scoped>
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
  padding: 24px;
}

.not-found-card {
  text-align: center;
  padding: 48px 40px;
  max-width: 440px;
  width: 100%;
  border-radius: 16px;
}

.not-found-code {
  font-size: 72px;
  font-weight: 700;
  line-height: 1;
  color: var(--ds-accent-text, var(--el-color-primary));
  opacity: 0.25;
  margin-bottom: 8px;
}

.not-found-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
  margin: 0 0 8px;
}

.not-found-message {
  font-size: 14px;
  color: var(--el-text-color-secondary, #909399);
  margin: 0 0 24px;
}

.not-found-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
