<template>
  <div class="global-task-observer">
    <!-- 飘窗 Toast 区域 -->
    <div class="task-toasts">
      <transition-group name="toast-list">
        <div 
          v-for="toast in manager.toasts" 
          :key="toast.id" 
          class="task-toast"
          :class="'toast-' + toast.type"
        >
          <el-icon class="toast-icon">
            <InfoFilled v-if="toast.type === 'info'" />
            <SuccessFilled v-else-if="toast.type === 'success'" />
            <WarningFilled v-else-if="toast.type === 'warning'" />
            <CircleCloseFilled v-else />
          </el-icon>
          <span>{{ toast.message }}</span>
        </div>
      </transition-group>
    </div>

    <!-- 左下角/底部任务队列面板 -->
    <div class="task-panel" v-if="manager.tasks.length > 0">
      <div class="panel-header" @click="isExpanded = !isExpanded">
        <div class="header-left">
          <el-icon :class="{'is-spinning': manager.hasActiveTasks}"><Loading v-if="manager.hasActiveTasks" /><Operation v-else /></el-icon>
          <span class="title">任务中心 ({{ manager.activeTasks.length }})</span>
        </div>
        <div class="header-right">
          <el-icon><ArrowUp v-if="!isExpanded"/><ArrowDown v-else/></el-icon>
        </div>
      </div>
      
      <el-collapse-transition>
        <div v-show="isExpanded" class="panel-content">
          <div v-if="manager.tasks.length === 0" class="empty-state">暂无任务</div>
          <div v-for="task in manager.tasks" :key="task.id" class="task-item">
            <div class="task-item-header">
              <span class="task-title" :class="task.status">{{ task.title }}</span>
              <span class="task-status-text">{{ getStatusText(task.status) }}</span>
            </div>
            <div class="task-item-desc" v-if="task.description">{{ task.description }}</div>
            <el-progress 
              v-if="task.status === 'running' || task.status === 'pending'" 
              :percentage="task.progress" 
              :stroke-width="4"
              :show-text="false"
            />
            <div class="task-item-actions" v-if="task.status === 'running' && task.cancellable">
              <el-button size="small" type="danger" link @click="manager.cancelTask(task.id)">取消</el-button>
            </div>
          </div>
          
          <div class="panel-footer" v-if="manager.completedTasks.length > 0">
            <el-button size="small" link @click="manager.clearCompletedTasks">清除已完成</el-button>
          </div>
        </div>
      </el-collapse-transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useTaskManager } from '@/stores/taskManager'
import { 
  InfoFilled, SuccessFilled, WarningFilled, CircleCloseFilled, 
  Loading, Operation, ArrowUp, ArrowDown 
} from '@element-plus/icons-vue'

const manager = useTaskManager()
const isExpanded = ref(false)

function getStatusText(status: string) {
  switch(status) {
    case 'pending': return '等待中'
    case 'running': return '进行中'
    case 'success': return '完成'
    case 'error': return '失败'
    case 'cancelled': return '已取消'
    default: return status
  }
}
</script>

<style scoped>
.global-task-observer {
  position: fixed;
  z-index: 9999;
  pointer-events: none; /* Let clicks pass through */
  bottom: 0;
  left: 0;
  right: 0;
  top: 0;
}

/* Toasts */
.task-toasts {
  position: absolute;
  top: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.task-toast {
  pointer-events: auto;
  padding: 12px 16px;
  border-radius: 8px;
  background: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  max-width: 350px;
}
.toast-success { border-left: 4px solid #67c23a; }
.toast-info { border-left: 4px solid #909399; }
.toast-warning { border-left: 4px solid #e6a23c; }
.toast-error { border-left: 4px solid #f56c6c; }

.toast-icon { font-size: 18px; }
.toast-success .toast-icon { color: #67c23a; }
.toast-info .toast-icon { color: #909399; }
.toast-warning .toast-icon { color: #e6a23c; }
.toast-error .toast-icon { color: #f56c6c; }


/* Task Panel */
.task-panel {
  pointer-events: auto;
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 320px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #ebeef5;
}

.panel-header {
  padding: 12px 16px;
  background: #f8f9fa;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  font-weight: bold;
  color: #303133;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.is-spinning {
  animation: spin 2s linear infinite;
}
@keyframes spin { 100% { transform: rotate(360deg); } }

.panel-content {
  max-height: 400px;
  overflow-y: auto;
  background: #fff;
  padding: 8px 0;
}

.task-item {
  padding: 12px 16px;
  border-bottom: 1px solid #ebeef5;
}
.task-item:last-child {
  border-bottom: none;
}

.task-item-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 13px;
}
.task-title {
  font-weight: 500;
  color: #303133;
}
.task-title.error { color: #f56c6c; }
.task-title.success { color: #67c23a; }
.task-title.cancelled { color: #909399; text-decoration: line-through; }

.task-status-text {
  font-size: 12px;
  color: #909399;
}
.task-item-desc {
  font-size: 12px;
  color: #606266;
  margin-bottom: 8px;
}

.task-item-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.panel-footer {
  padding: 8px 16px;
  text-align: center;
  background: #fcfcfc;
  border-top: 1px solid #ebeef5;
}

/* Transitions */
.toast-list-enter-active,
.toast-list-leave-active {
  transition: all 0.3s ease;
}
.toast-list-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.toast-list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
