<template>
  <el-tabs v-model="currentTab" class="chat-tabs">
    <el-tab-pane label="对话" name="chat">
      <slot name="chat" />
    </el-tab-pane>
    <el-tab-pane label="建议" name="suggestions">
      <slot name="suggestions" />
    </el-tab-pane>
    <el-tab-pane label="统计" name="statistics">
      <slot name="statistics" />
    </el-tab-pane>
  </el-tabs>
</template>

<script setup lang="ts">
const currentTab = defineModel<string>({ required: true })
</script>
