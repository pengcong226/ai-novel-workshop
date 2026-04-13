<template>
  <div class="sandbox-map-container">
    <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 10px;">
      <p style="font-size: 12px; color: var(--text-muted);">
        <i class="ri-information-line"></i> 角色位置根据时间线中提取的 @地点 自动同步。基于地理坐标系百分比渲染。
      </p>
    </div>

    <!-- The Map Canvas -->
    <div class="map-canvas">
      <!-- 1. Render Location Pins -->
      <div
        v-for="loc in locationNodes"
        :key="loc.id"
        class="map-pin"
        :style="{ top: loc.y + '%', left: loc.x + '%' }"
      >
        <i class="ri-map-pin-fill" :style="{ color: loc.color }"></i>
        <div class="map-pin-label">{{ loc.name }}</div>
      </div>

      <!-- 2. Render Animated Avatar Paths (Only simple SVG lines connecting them) -->
      <svg class="map-svg-layer">
        <line
          v-for="path in (avatarPaths as any[])"
          :key="path.id"
          :x1="path.x1 + '%'"
          :y1="path.y1 + '%'"
          :x2="path.x2 + '%'"
          :y2="path.y2 + '%'"
          stroke="var(--accent-glow)"
          stroke-width="2"
          stroke-dasharray="5,5"
        />
      </svg>

      <!-- 3. Render Avatars -->
      <div
        v-for="avatar in avatarNodes"
        :key="avatar.id"
        class="map-avatar"
        :style="{ top: avatar.y + '%', left: avatar.x + '%' }"
        :title="avatar.name + ' 的当前位置'"
      >
        {{ avatar.name.charAt(0) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSandboxStore } from '@/stores/sandbox'

const sandboxStore = useSandboxStore()

// 1. Extract static locations to render pins
const locationNodes = computed(() => {
  const result: any[] = []
  const activeState = sandboxStore.activeEntitiesState
  for (const [id, state] of Object.entries(activeState)) {
    if (state.category === 'Location' || state.category === '地点') {
      const coord = state.visualMeta?.defaultCoordinates || { x: 50, y: 50 }
      result.push({
        id,
        name: state.name,
        x: coord.x,
        y: coord.y,
        color: state.visualMeta?.color || 'var(--accent-primary)'
      })
    }
  }
  return result
})

// 2. Extract active characters that have a location property
const avatarNodes = computed(() => {
  const result: any[] = []
  const activeState = sandboxStore.activeEntitiesState
  for (const [id, state] of Object.entries(activeState)) {
    if ((state.category === 'Protagonist' || state.category === '核心人物' || state.category === 'Antagonist' || state.category === '反派') && state.location) {
      result.push({
        id,
        name: state.name,
        x: state.location.x,
        y: state.location.y
      })
    }
  }
  return result
})

// TODO: 实现路径计算逻辑，目前返回空数组
const avatarPaths = computed(() => [])
</script>

<style scoped>
.sandbox-map-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
}

.map-canvas {
  flex: 1;
  /* Basic sci-fi grid overlay acting as map */
  background:
    linear-gradient(rgba(60, 130, 246, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(60, 130, 246, 0.1) 1px, transparent 1px),
    rgba(10, 10, 15, 0.9);
  background-size: 50px 50px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
}

.map-svg-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.map-pin {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translate(-50%, -100%);
  cursor: pointer;
  z-index: 5;
  transition: all 0.3s;
}
.map-pin:hover { transform: translate(-50%, -110%); }
.map-pin i {
  font-size: 24px;
  text-shadow: 0 0 10px currentColor;
}
.map-pin-label {
  background: rgba(0,0,0,0.8);
  border: 1px solid var(--border-color);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  margin-top: 4px;
  white-space: nowrap;
  color: #fff;
}

.map-avatar {
  position: absolute;
  width: 28px;
  height: 28px;
  background: var(--bg-base);
  border-radius: 50%;
  border: 2px solid var(--accent-success);
  transform: translate(-50%, -50%);
  box-shadow: 0 0 15px var(--accent-glow);
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 12px;
  color: #fff;
  font-weight: bold;
  z-index: 10;
  transition: top 1.5s cubic-bezier(0.45, 0, 0.15, 1), left 1.5s cubic-bezier(0.45, 0, 0.15, 1);
}
</style>