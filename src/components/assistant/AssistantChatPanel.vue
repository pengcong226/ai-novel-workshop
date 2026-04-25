<template>
  <div class="assistant-chat-panel">
    <div ref="messagesRef" class="messages">
      <div
        v-for="(msg, index) in messages"
        :key="index"
        :class="['message', msg.role]"
      >
        <div class="message-avatar">
          <el-avatar :size="32" v-if="msg.role === 'assistant'">AI</el-avatar>
          <el-avatar :size="32" v-else>我</el-avatar>
        </div>
        <div class="message-content">
          <div class="message-text" v-html="formatAssistantMessage(msg.content)"></div>
          <div v-if="msg.actions" class="message-actions">
            <el-button
              v-for="action in msg.actions"
              :key="action.text"
              size="small"
              @click="emit('action', action)"
            >
              {{ action.text }}
            </el-button>
          </div>
        </div>
      </div>

      <div v-if="isTyping" class="message assistant">
        <div class="message-avatar">
          <el-avatar :size="32">AI</el-avatar>
        </div>
        <div class="message-content">
          <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </div>

    <div class="quick-actions">
      <el-button
        v-for="cmd in quickCommands"
        :key="cmd.text"
        size="small"
        @click="emit('quick-command', cmd)"
      >
        {{ cmd.text }}
      </el-button>
    </div>

    <div class="input-area">
      <el-input
        v-model="input"
        placeholder="描述你想要的设定，AI会帮你实现..."
        type="textarea"
        :rows="3"
        @keydown.enter.ctrl="emit('send')"
      />
      <div class="input-actions">
        <el-button @click="emit('clear')" text>清空对话</el-button>
        <el-button type="primary" @click="emit('send')" :loading="isTyping">
          发送
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { formatAssistantMessage, type AssistantAction, type AssistantMessage } from '@/assistant/commands/assistantChat'

interface Props {
  messages: AssistantMessage[]
  quickCommands: AssistantAction[]
  isTyping: boolean
}

const input = defineModel<string>('input', { required: true })
defineProps<Props>()
const emit = defineEmits<{
  send: []
  clear: []
  action: [action: AssistantAction]
  'quick-command': [command: AssistantAction]
}>()

const messagesRef = ref<HTMLElement | null>(null)

defineExpose({ messagesRef })
</script>

<style scoped>
.assistant-chat-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--ds-bg-elevated);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--ds-space-5);
}

.message {
  display: flex;
  gap: var(--ds-space-3);
  margin-bottom: var(--ds-space-5);
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
}

.message-content {
  flex: 1;
  max-width: 82%;
}

.message-text {
  padding: var(--ds-space-3) var(--ds-space-4);
  border-radius: var(--ds-radius-md);
  line-height: 1.7;
  word-wrap: break-word;
  border: 1px solid var(--ds-surface-border);
}

.message.user .message-text {
  background: var(--ds-accent-subtle);
  color: var(--ds-text-primary);
  border-color: color-mix(in srgb, var(--ds-accent) 24%, transparent);
  border-bottom-right-radius: var(--ds-radius-sm);
}

.message.assistant .message-text {
  background: var(--ds-surface);
  color: var(--ds-text-primary);
  border-left: 2px solid var(--ds-accent);
  border-bottom-left-radius: var(--ds-radius-sm);
}

.message-actions {
  margin-top: var(--ds-space-2);
  display: flex;
  gap: var(--ds-space-2);
  flex-wrap: wrap;
}

.typing-indicator {
  display: flex;
  gap: var(--ds-space-1);
  padding: var(--ds-space-3) var(--ds-space-4);
  background: var(--ds-surface);
  border: 1px solid var(--ds-surface-border);
  border-left: 2px solid var(--ds-accent);
  border-radius: var(--ds-radius-md);
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: var(--ds-accent);
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-10px);
  }
}

.quick-actions {
  padding: var(--ds-space-3) var(--ds-space-5);
  border-top: 1px solid var(--ds-surface-border);
  display: flex;
  gap: var(--ds-space-2);
  flex-wrap: wrap;
  background: var(--ds-bg-secondary);
}

.quick-actions .el-button {
  border-radius: var(--ds-radius-full) !important;
}

.input-area {
  padding: var(--ds-space-4) var(--ds-space-5);
  border-top: 1px solid var(--ds-surface-border);
  background: var(--ds-bg-tertiary);
}

.input-actions {
  display: flex;
  justify-content: space-between;
  margin-top: var(--ds-space-3);
}
</style>
