<template>
  <n-config-provider :theme="darkTheme" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-dialog-provider>
        <n-layout style="min-height: 100vh">
          <n-layout-header bordered style="padding: 12px 24px; display: flex; align-items: center; justify-content: space-between">
            <n-text strong style="font-size: 18px; cursor: pointer" @click="$router.push('/')">
              📚 同人创作工作坊
            </n-text>
            <n-space v-if="userStore.isLoggedIn">
              <n-button quaternary @click="$router.push('/works')">作品库</n-button>
              <n-button quaternary @click="$router.push('/settings')">设置</n-button>
              <n-text depth="3">{{ userStore.user?.username }}</n-text>
              <n-button quaternary type="error" @click="userStore.logout()">退出</n-button>
            </n-space>
            <n-space v-else>
              <n-button @click="$router.push('/login')">登录</n-button>
              <n-button type="primary" @click="$router.push('/register')">注册</n-button>
            </n-space>
          </n-layout-header>
          <n-layout-content style="padding: 24px">
            <router-view />
          </n-layout-content>
        </n-layout>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { darkTheme, zhCN, dateZhCN } from 'naive-ui'
import { useUserStore } from './stores/user'

const userStore = useUserStore()
</script>

<style>
body {
  margin: 0;
  background: #1a1a2e;
  color: #e0e0e0;
}
</style>
