/**
 * IndexedDB缓存管理器
 * 用于缓存LLM分析结果，支持断点续传
 */

import { openDB, IDBPDatabase } from 'idb'
import type { AnalysisCache, AnalysisMode, LLMAnalysisResult } from './types'

const DB_NAME = 'novel-analysis-cache'
const STORE_NAME = 'analysis'
const DB_VERSION = 1

export class CacheManager {
  private db: IDBPDatabase | null = null
  private maxAge = 7 * 24 * 60 * 60 * 1000  // 7天（毫秒）
  private maxSize = 500 * 1024 * 1024  // 500MB

  /**
   * 初始化数据库连接
   */
  private async initDB(): Promise<IDBPDatabase> {
    if (this.db) {
      return this.db
    }

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'fileId' })
        }
      }
    })

    return this.db
  }

  /**
   * 生成文件ID（SHA-256哈希）
   */
  private async generateFileId(text: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(text)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * 保存阶段结果
   */
  async saveStage(
    text: string,
    mode: AnalysisMode,
    stage: 'chapterDetection' | 'characterExtraction' | 'worldExtraction' | 'outlineGeneration' | 'complete',
    result: any
  ): Promise<void> {
    const db = await this.initDB()
    const fileId = await this.generateFileId(text)

    // 加载现有缓存或创建新缓存
    let cache: AnalysisCache = await db.get(STORE_NAME, fileId) || {
      fileId,
      timestamp: Date.now(),
      mode
    }

    // 更新对应阶段
    cache[stage] = {
      result,
      timestamp: Date.now()
    }

    // 如果完成，更新主时间戳
    if (stage === 'complete') {
      cache.timestamp = Date.now()
    }

    // 保存
    await db.put(STORE_NAME, cache)
  }

  /**
   * 加载缓存
   */
  async loadCache(text: string): Promise<AnalysisCache | null> {
    const db = await this.initDB()
    const fileId = await this.generateFileId(text)

    const cache = await db.get(STORE_NAME, fileId)

    if (!cache) {
      return null
    }

    // 检查是否过期
    if (Date.now() - cache.timestamp > this.maxAge) {
      await this.deleteCache(text)
      return null
    }

    return cache
  }

  /**
   * 获取最后完成的阶段
   */
  async getLastStage(text: string): Promise<string | null> {
    const cache = await this.loadCache(text)

    if (!cache) {
      return null
    }

    if (cache.complete) {
      return 'complete'
    }
    if (cache.outlineGeneration) {
      return 'outline'
    }
    if (cache.worldExtraction) {
      return 'world'
    }
    if (cache.characterExtraction) {
      return 'characters'
    }
    if (cache.chapterDetection) {
      return 'chapters'
    }

    return null
  }

  /**
   * 从指定阶段恢复分析
   * 注意：实际的恢复逻辑需要在analyzer模块中实现
   * 这里只提供缓存数据的访问接口
   */
  async getStageData(
    text: string,
    stage: 'chapterDetection' | 'characterExtraction' | 'worldExtraction' | 'outlineGeneration'
  ): Promise<any | null> {
    const cache = await this.loadCache(text)
    if (!cache || !cache[stage]) {
      return null
    }
    return cache[stage].result
  }

  /**
   * 删除缓存
   */
  async deleteCache(text: string): Promise<void> {
    const db = await this.initDB()
    const fileId = await this.generateFileId(text)
    await db.delete(STORE_NAME, fileId)
  }

  /**
   * 清理所有过期缓存
   */
  async cleanup(): Promise<void> {
    const db = await this.initDB()
    const allCaches = await db.getAll(STORE_NAME)

    for (const cache of allCaches) {
      if (Date.now() - cache.timestamp > this.maxAge) {
        await db.delete(STORE_NAME, cache.fileId)
      }
    }
  }

  /**
   * 获取所有缓存
   */
  async getAllCaches(): Promise<AnalysisCache[]> {
    const db = await this.initDB()
    return await db.getAll(STORE_NAME)
  }

  /**
   * 检查存储空间
   */
  async checkStorageQuota(): Promise<boolean> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate()
      const availableSpace = (estimate.quota || 0) - (estimate.usage || 0)
      return availableSpace > this.maxSize
    }
    // 无法检测，假设有空间
    return true
  }

  /**
   * 获取缓存大小估算
   */
  async getCacheSize(): Promise<number> {
    const db = await this.initDB()
    const allCaches = await db.getAll(STORE_NAME)

    // 估算每个缓存的大小
    let totalSize = 0
    for (const cache of allCaches) {
      // 粗略估算：JSON序列化后的长度
      const jsonStr = JSON.stringify(cache)
      totalSize += jsonStr.length * 2  // UTF-16编码
    }

    return totalSize
  }
}

// 导出单例
export const cacheManager = new CacheManager()
