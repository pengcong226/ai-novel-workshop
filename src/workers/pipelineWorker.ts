/**
 * Pipeline Worker — Web Worker 后台 Pipeline 执行
 *
 * 通过 postMessage 与主线程通信
 * 接收项目数据和配置，执行 Pipeline，返回结果
 */

// Worker 消息请求类型
export interface WorkerRequest {
  type: 'execute-chapter' | 'execute-batch' | 'cancel' | 'ping'
  requestId: string
  payload?: {
    projectData: any          // 序列化后的 Project 对象
    chapterNumber: number
    config?: any              // PipelineConfig
    externalContext?: string
  }
}

// Worker 消息响应类型
export interface WorkerResponse {
  type: 'chapter-result' | 'chapter-progress' | 'batch-progress' | 'error' | 'pong' | 'cancelled'
  requestId: string
  payload?: any
  error?: string
}

// Worker self 上下文
const ctx: Worker = self as unknown as Worker

let isCancelled = false
let currentRequestId: string | null = null

ctx.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const { type, requestId, payload } = event.data

  switch (type) {
    case 'ping':
      ctx.postMessage({ type: 'pong', requestId } as WorkerResponse)
      break

    case 'cancel':
      isCancelled = true
      ctx.postMessage({
        type: 'cancelled',
        requestId: currentRequestId || requestId,
      } as WorkerResponse)
      break

    case 'execute-chapter':
      if (!payload) {
        ctx.postMessage({
          type: 'error',
          requestId,
          error: '缺少执行参数',
        } as WorkerResponse)
        return
      }
      await executeChapter(requestId, payload)
      break

    case 'execute-batch':
      // 批量执行不在此 Worker 中处理，交由主线程 BatchContinueScheduler 调度
      ctx.postMessage({
        type: 'error',
        requestId,
        error: '批量执行请使用主线程调度器',
      } as WorkerResponse)
      break
  }
})

/**
 * 执行单章 Pipeline
 * Worker 无法直接访问 Pinia 存储，需要通过消息传递所有数据
 */
async function executeChapter(
  requestId: string,
  payload: NonNullable<WorkerRequest['payload']>,
) {
  currentRequestId = requestId
  isCancelled = false

  try {
    // 通知主线程 Pipeline 正在初始化
    ctx.postMessage({
      type: 'chapter-progress',
      requestId,
      payload: { stage: 'starting', message: 'Pipeline 正在初始化...' },
    } as WorkerResponse)

    // Worker 内部可以使用动态导入来加载模块
    // 由于使用 Vite 构建，静态导入会被打包进 Worker 产物中
    // 但 Worker 无法直接访问 Pinia Store，因此实际的 Pipeline 执行
    // 通过主线程的 BatchContinueScheduler 进行调度

    // 检查是否已被取消
    if (isCancelled) {
      ctx.postMessage({
        type: 'cancelled',
        requestId,
      } as WorkerResponse)
      return
    }

    // 返回就绪状态，表明 Worker 环境已初始化完成
    // 实际的 Pipeline 执行由主线程 BatchContinueScheduler 管理
    ctx.postMessage({
      type: 'chapter-result',
      requestId,
      payload: {
        status: 'worker-ready',
        message: 'Worker 环境已就绪，实际 Pipeline 执行通过主线程 BatchContinueScheduler 进行',
        chapterNumber: payload.chapterNumber,
      },
    } as WorkerResponse)
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      requestId,
      error: error instanceof Error ? error.message : String(error),
    } as WorkerResponse)
  } finally {
    currentRequestId = null
  }
}

// 导出空对象以满足 TypeScript 模块要求（Worker 运行时不使用）
export {}
