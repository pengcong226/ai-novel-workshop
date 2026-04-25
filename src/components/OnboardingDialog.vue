<template>
  <el-dialog
    v-model="onboarding.isVisible.value"
    title="欢迎来到 AI 小说工坊"
    width="720px"
    class="onboarding-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    destroy-on-close
  >
    <el-steps :active="onboarding.currentStep.value" finish-status="success" align-center>
      <el-step v-for="step in steps" :key="step.title" :title="step.title" />
    </el-steps>

    <section class="step-body">
      <template v-if="onboarding.currentStep.value === 0">
        <h2>把长篇创作拆成可控工作台</h2>
        <p>这里会把项目、章节、设定沙盘、AI 审校和导入流程串在一起，适合持续推进百万字级别小说。</p>
        <div class="feature-grid">
          <div v-for="feature in features" :key="feature.title" class="feature-card">
            <strong>{{ feature.title }}</strong>
            <span>{{ feature.description }}</span>
          </div>
        </div>
      </template>

      <template v-else-if="onboarding.currentStep.value === 1">
        <h2>先选择你的起步方式</h2>
        <el-radio-group v-model="selectedPath" class="path-list">
          <el-radio-button value="create">新建项目</el-radio-button>
          <el-radio-button value="import">导入已有小说</el-radio-button>
          <el-radio-button value="configure">先配置 AI</el-radio-button>
        </el-radio-group>
        <p class="hint">完成引导后会回到当前页面，你可以直接使用项目列表、导入入口或项目内配置页继续。</p>
      </template>

      <template v-else-if="onboarding.currentStep.value === 2">
        <h2>推荐的第一轮工作流</h2>
        <el-timeline>
          <el-timeline-item timestamp="1" placement="top">创建或导入项目，设定题材与目标字数。</el-timeline-item>
          <el-timeline-item timestamp="2" placement="top">进入写作仪表盘查看进度，再到章节管理创建第一章。</el-timeline-item>
          <el-timeline-item timestamp="3" placement="top">用设定沙盘维护角色、势力、地点和状态事件。</el-timeline-item>
          <el-timeline-item timestamp="4" placement="top">生成后用审校建议和版本快照稳住质量。</el-timeline-item>
        </el-timeline>
      </template>

      <template v-else>
        <h2>准备开始</h2>
        <el-alert
          :title="finishTitle"
          type="success"
          :closable="false"
          show-icon
        />
        <p class="hint">你可以随时在项目列表创建/导入项目，在项目工作区从左侧进入写作仪表盘、章节、设定沙盘和配置。</p>
      </template>
    </section>

    <template #footer>
      <div class="dialog-footer">
        <el-button text @click="onboarding.dismiss()">稍后继续</el-button>
        <div class="footer-actions">
          <el-button v-if="onboarding.currentStep.value > 0" @click="onboarding.previousStep()">上一步</el-button>
          <el-button v-if="onboarding.currentStep.value < steps.length - 1" type="primary" @click="onboarding.nextStep()">
            下一步
          </el-button>
          <el-button v-else type="primary" @click="finishOnboarding">完成并开始</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useOnboarding } from '@/composables/useOnboarding'

const onboarding = useOnboarding()
const selectedPath = ref<'create' | 'import' | 'configure'>('create')

const steps = [
  { title: '欢迎' },
  { title: '起步方式' },
  { title: '工作流' },
  { title: '开始' },
]

const features = [
  { title: '写作仪表盘', description: '集中查看字数、章节状态与最近进展。' },
  { title: '章节管理', description: '创建、生成、改写、续写和维护版本快照。' },
  { title: '设定沙盘', description: '用 Entity + StateEvent 维护角色和世界状态。' },
  { title: 'AI 审校', description: '生成后沉淀建议，再回到编辑器中处理。' },
]

const finishTitle = computed(() => {
  const titles = {
    create: '建议先点击项目列表里的“新建项目”，创建你的第一部作品。',
    import: '建议先使用项目列表里的“导入项目”，接入已有小说资料。',
    configure: '建议进入项目配置页，先完成 AI 模型和写作偏好设置。',
  }
  return titles[selectedPath.value]
})

function finishOnboarding(): void {
  onboarding.complete()
}
</script>

<style scoped>
.step-body {
  min-height: 300px;
  padding: 28px 4px 8px;
}

.step-body h2 {
  margin: 0 0 12px;
  color: #303133;
}

.step-body p,
.hint {
  color: #606266;
  line-height: 1.7;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 20px;
}

.feature-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  background: #f8fafc;
}

.feature-card strong {
  color: #409eff;
}

.feature-card span {
  color: #606266;
  line-height: 1.5;
}

.path-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 768px) {
  .feature-grid {
    grid-template-columns: 1fr;
  }

  .dialog-footer {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
