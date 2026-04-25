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
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
}

.message-content {
  flex: 1;
  max-width: 80%;
}

.message-text {
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.6;
  word-wrap: break-word;
}

.message.user .message-text {
  background: #409eff;
  color: white;
  border-bottom-right-radius: 4px;
}

.message.assistant .message-text {
  background: #f0f2f5;
  color: #333;
  border-bottom-left-radius: 4px;
}

.message-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  background: #f0f2f5;
  border-radius: 12px;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: #999;
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
  padding: 12px 20px;
  border-top: 1px solid #e4e7ed;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.input-area {
  padding: 16px 20px;
  border-top: 1px solid #e4e7ed;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
}
</style>
