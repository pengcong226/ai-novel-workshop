<template>
  <div class="automaton-chat-container">
    <div class="panel-header">
      <div class="sci-fi-title">
        <i class="ri-robot-2-line"></i> 自动化主脑 (Automaton)
      </div>
    </div>

    <div class="chat-container">
      <div class="chat-messages" id="chat-box">
        <div class="msg msg-system">
          <i class="ri-dashboard-line"></i> 系统：已切换至多维沙盘模式。所有视图受底层 State Engine 驱动。
        </div>

        <div class="msg msg-ai">
          您好！我是沙盘状态提取引擎。
          <br><br>
          目前由于是技术预览版，如果您在大纲时间线点击 <b>[AI 生成正文并同步状态]</b>，我将模拟一次 `update_entity_state` 的 Structured Output 工具调用，向沙盘中注入以下数据：
          <br><br>
          - 增加【太虚玉简】和【影傀】两个新图谱节点。
          - 改变主角境界。
          - 更改主角的 GIS 坐标为妖兽森林，触发动画。
        </div>
      </div>

      <div class="chat-input">
        <div class="chat-input-wrapper">
          <textarea placeholder="请先在时间线执行大纲推演或生成正文..." readonly style="opacity: 0.7;"></textarea>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// TODO: 此组件为占位符，待实现工具调用渲染功能。目前仅显示静态示例。
</script>

<style scoped>
.automaton-chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.panel-header {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}
.sci-fi-title {
  color: var(--accent-glow);
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 8px;
}
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.msg {
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}
.msg-ai {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255,255,255,0.05);
}
.msg-system {
  background: transparent;
  border: 1px dashed var(--accent-success);
  color: var(--accent-success);
  text-align: center;
}
.chat-input {
  margin-top: auto;
}
.chat-input textarea {
  width: 100%;
  background: rgba(0,0,0,0.4);
  border: 1px solid var(--border-color);
  color: white;
  padding: 12px;
  border-radius: 8px;
  outline: none;
  resize: none;
  height: 80px;
}
</style>