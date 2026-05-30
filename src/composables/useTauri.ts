/**
 * Tauri 平台 Composable
 *
 * 提供 Vue 组件内可用的平台检测、IPC 调用包装和运行时元信息。
 * 全部从 `@/utils/tauri-guard` 衍生，保持单一真实来源。
 *
 * @module composables/useTauri
 */

import { computed, ref, type ComputedRef } from 'vue'
import {
  isDesktop as guardIsDesktop,
  isWeb as guardIsWeb,
  invoke as ipcInvoke,
  invokeFireAndForget as ipcInvokeFireAndForget,
} from '@/utils/tauri-guard'

/** useTauri 返回的 composable 接口 */
export interface UseTauriReturn {
  /** 是否为 Tauri 桌面端（只读 ref） */
  isDesktop: ComputedRef<boolean>
  /** 是否为 Web 端（只读 ref） */
  isWeb: ComputedRef<boolean>
  /** 运行时平台标签：'desktop' | 'web' */
  platform: ComputedRef<'desktop' | 'web'>
  /** 调用 Tauri IPC 命令 */
  invoke: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>
  /** 静默调用 IPC 命令（失败不抛出） */
  invokeQuiet: (command: string, args?: Record<string, unknown>) => void
  /** 有 IPC 调用正在执行中（只读 ref） */
  isBusy: ComputedRef<boolean>
}

/**
 * Tauri 平台 composable。
 *
 * 用法：
 * ```ts
 * const { isDesktop, invoke, isBusy } = useTauri()
 *
 * // 在桌面端加载实体数据
 * if (isDesktop.value) {
 *   const entities = await invoke('load_entities', { projectId })
 * }
 * ```
 */
export function useTauri(): UseTauriReturn {
  const isDesktopRef = computed(() => guardIsDesktop())
  const isWebRef = computed(() => guardIsWeb())
  const platform = computed<'desktop' | 'web'>(() =>
    isDesktopRef.value ? 'desktop' : 'web'
  )
  const busyCount = ref(0)
  const isBusy = computed(() => busyCount.value > 0)

  async function invoke<T = unknown>(
    command: string,
    args?: Record<string, unknown>
  ): Promise<T> {
    busyCount.value++
    try {
      return await ipcInvoke<T>(command, args)
    } finally {
      busyCount.value = Math.max(0, busyCount.value - 1)
    }
  }

  function invokeQuiet(command: string, args?: Record<string, unknown>): void {
    ipcInvokeFireAndForget(command, args)
  }

  return {
    isDesktop: isDesktopRef,
    isWeb: isWebRef,
    platform,
    invoke,
    invokeQuiet,
    isBusy,
  }
}
