<template>
  <div class="sandbox-map-container">
    <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 10px;">
      <p style="font-size: 12px; color: var(--text-muted);">
        <i class="ri-information-line"></i> 角色位置根据时间线中提取的 @地点 自动同步。基于地理坐标系百分比渲染。
      </p>
    </div>

    <div class="map-canvas">
      <div
        v-for="loc in locationNodes"
        :key="loc.id"
        class="map-pin"
        :style="{ top: loc.y + '%', left: loc.x + '%' }"
      >
        <i class="ri-map-pin-fill" :style="{ color: loc.color }"></i>
        <div class="map-pin-label">{{ loc.name }}</div>
      </div>

      <svg class="map-svg-layer">
        <line
          v-for="path in avatarPaths"
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
import { useSandboxStore, type ResolvedEntity } from '@/stores/sandbox'
import type { StateEvent } from '@/types/sandbox'

interface Coordinate {
  x: number
  y: number
}

interface LocationNode extends Coordinate {
  id: string
  name: string
  color: string
}

interface AvatarNode extends Coordinate {
  id: string
  name: string
}

interface AvatarPath {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

const CHARACTER_CATEGORIES = new Set(['Protagonist', '核心人物', 'Antagonist', '反派'])
const LOCATION_CATEGORIES = new Set(['Location', '地点'])

const sandboxStore = useSandboxStore()

function isValidCoordinate(value: Coordinate | undefined): value is Coordinate {
  return Boolean(value && Number.isFinite(value.x) && Number.isFinite(value.y))
}

function parseCoordinateValue(value: string | undefined): Coordinate | null {
  if (!value) return null
  const parts = value.split(',').map(part => part.trim())
  if (parts.length !== 2 || parts.some(part => part === '')) return null

  const coordinate = { x: Number(parts[0]), y: Number(parts[1]) }
  return isValidCoordinate(coordinate) ? coordinate : null
}

function getLocationMoveCoordinate(event: StateEvent): Coordinate | null {
  if (event.payload.coordinates && isValidCoordinate(event.payload.coordinates)) {
    return event.payload.coordinates
  }
  return parseCoordinateValue(event.payload.value)
}

function isLocationEntity(state: ResolvedEntity): boolean {
  return !state.isArchived && (state.type === 'LOCATION' || LOCATION_CATEGORIES.has(state.category))
}

function isTrackedCharacter(state: ResolvedEntity): boolean {
  return !state.isArchived && (state.type === 'CHARACTER' || CHARACTER_CATEGORIES.has(state.category))
}

function compareStateEvents(a: StateEvent, b: StateEvent): number {
  if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber
  return a.id.localeCompare(b.id)
}

const locationNodes = computed<LocationNode[]>(() => {
  const result: LocationNode[] = []
  for (const [id, state] of Object.entries(sandboxStore.activeEntitiesState)) {
    if (!isLocationEntity(state)) continue

    const coord = state.visualMeta?.defaultCoordinates || { x: 50, y: 50 }
    result.push({
      id,
      name: state.name,
      x: coord.x,
      y: coord.y,
      color: state.visualMeta?.color || 'var(--accent-primary)'
    })
  }
  return result
})

const avatarNodes = computed<AvatarNode[]>(() => {
  const result: AvatarNode[] = []
  for (const [id, state] of Object.entries(sandboxStore.activeEntitiesState)) {
    if (!isTrackedCharacter(state) || !state.location) continue

    result.push({
      id,
      name: state.name,
      x: state.location.x,
      y: state.location.y
    })
  }
  return result
})

const avatarPaths = computed<AvatarPath[]>(() => {
  const movesByEntityId = new Map<string, Coordinate[]>()
  const events = [...sandboxStore.stateEvents, ...sandboxStore.pendingStateEvents]
    .filter(event => event.eventType === 'LOCATION_MOVE' && event.chapterNumber <= sandboxStore.currentChapter)
    .sort(compareStateEvents)

  for (const event of events) {
    const coordinate = getLocationMoveCoordinate(event)
    if (!coordinate) continue

    const moves = movesByEntityId.get(event.entityId) || []
    moves.push(coordinate)
    movesByEntityId.set(event.entityId, moves)
  }

  return avatarNodes.value.flatMap(avatar => {
    const moves = movesByEntityId.get(avatar.id) || []

    if (moves.length < 2) return []

    const previous = moves[moves.length - 2]
    if (previous.x === avatar.x && previous.y === avatar.y) return []

    return [{
      id: `${avatar.id}:${previous.x},${previous.y}->${avatar.x},${avatar.y}`,
      x1: previous.x,
      y1: previous.y,
      x2: avatar.x,
      y2: avatar.y
    }]
  })
})
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
