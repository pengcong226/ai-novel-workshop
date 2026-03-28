/**
 * 世界书导入服务测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { WorldbookImporter, createWorldbookImporter, exportWorldbook } from '../worldbook-importer'
import type { WorldbookData, WorldbookEntry } from '@/types/worldbook'

describe('WorldbookImporter', () => {
  let importer: WorldbookImporter

  beforeEach(() => {
    importer = createWorldbookImporter()
  })

  describe('parseJsonContent', () => {
    it('应该解析标准世界书 JSON 格式', async () => {
      const jsonData = {
        name: '测试世界书',
        description: '这是一个测试世界书',
        entries: [
          {
            uid: 'entry-1',
            keys: ['关键词1', '关键词2'],
            content: '这是条目内容',
            enabled: true
          }
        ]
      }

      const jsonString = JSON.stringify(jsonData)
      const result = await importer.importWorldbook(
        new File([jsonString], 'test.json', { type: 'application/json' }),
        { autoGenerateIds: false }
      )

      expect(result.stats.total).toBe(1)
      expect(result.stats.imported).toBe(1)
      expect(result.worldbook.name).toBe('测试世界书')
      expect(result.worldbook.entries).toHaveLength(1)
      expect(result.worldbook.entries[0].keys).toEqual(['关键词1', '关键词2'])
    })

    it('应该解析条目数组格式', async () => {
      const entries = [
        {
          uid: 'entry-1',
          keys: ['测试'],
          content: '测试内容'
        }
      ]

      const jsonString = JSON.stringify(entries)
      const result = await importer.importWorldbook(
        new File([jsonString], 'test.json', { type: 'application/json' }),
        { autoGenerateIds: false }
      )

      expect(result.stats.imported).toBe(1)
      expect(result.worldbook.entries).toHaveLength(1)
    })

    it('应该处理无效 JSON', async () => {
      const invalidJson = '{ invalid json }'

      await expect(
        importer.importWorldbook(
          new File([invalidJson], 'test.json', { type: 'application/json' })
        )
      ).rejects.toThrow()
    })
  })

  describe('parseJsonlContent', () => {
    it('应该解析 JSONL 格式', async () => {
      const entries = [
        { uid: '1', keys: ['a'], content: 'content 1' },
        { uid: '2', keys: ['b'], content: 'content 2' }
      ]

      const jsonlString = entries.map(e => JSON.stringify(e)).join('\n')
      const result = await importer.importWorldbook(
        new File([jsonlString], 'test.jsonl', { type: 'application/jsonl' }),
        { autoGenerateIds: false }
      )

      expect(result.stats.imported).toBe(2)
      expect(result.worldbook.entries).toHaveLength(2)
    })
  })

  describe('条目处理', () => {
    it('应该自动生成 ID', async () => {
      const jsonData = {
        entries: [
          {
            keys: ['test'],
            content: 'test content'
          }
        ]
      }

      const result = await importer.importWorldbook(
        new File([JSON.stringify(jsonData)], 'test.json', { type: 'application/json' }),
        { autoGenerateIds: true }
      )

      expect(result.worldbook.entries[0].uid).toBeDefined()
      expect(result.worldbook.entries[0].uid).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('应该推断条目分类', async () => {
      const jsonData = {
        entries: [
          {
            keys: ['角色', '主角'],
            content: '主角信息'
          },
          {
            keys: ['world'],
            content: '世界设定'
          }
        ]
      }

      const result = await importer.importWorldbook(
        new File([JSON.stringify(jsonData)], 'test.json', { type: 'application/json' }),
        { inferCategories: true }
      )

      expect(result.worldbook.entries[0].category).toBe('角色')
      expect(result.worldbook.entries[1].category).toBe('世界观')
    })

    it('应该过滤无效条目', async () => {
      const jsonData = {
        entries: [
          {
            keys: ['valid'],
            content: 'valid content'
          },
          {
            keys: [],
            content: 'no keys'
          },
          {
            keys: ['test'],
            content: ''
          }
        ]
      }

      const result = await importer.importWorldbook(
        new File([JSON.stringify(jsonData)], 'test.json', { type: 'application/json' })
      )

      expect(result.stats.imported).toBe(1)
      expect(result.stats.errors).toBe(2)
      expect(result.errors).toBeDefined()
      expect(result.errors).toHaveLength(2)
    })

    it('应该支持自定义过滤', async () => {
      const jsonData = {
        entries: [
          { keys: ['a'], content: 'content a' },
          { keys: ['b'], content: 'content b' }
        ]
      }

      const result = await importer.importWorldbook(
        new File([JSON.stringify(jsonData)], 'test.json', { type: 'application/json' }),
        {
          filter: (entry) => entry.keys.includes('a')
        }
      )

      expect(result.stats.imported).toBe(1)
      expect(result.worldbook.entries[0].keys).toContain('a')
    })

    it('应该支持条目转换', async () => {
      const jsonData = {
        entries: [
          { keys: ['test'], content: 'original' }
        ]
      }

      const result = await importer.importWorldbook(
        new File([JSON.stringify(jsonData)], 'test.json', { type: 'application/json' }),
        {
          transform: (entry) => ({
            ...entry,
            content: entry.content?.toUpperCase()
          })
        }
      )

      expect(result.worldbook.entries[0].content).toBe('ORIGINAL')
    })
  })

  describe('导出功能', () => {
    const testWorldbook: WorldbookData = {
      name: '测试世界书',
      description: '测试描述',
      entries: [
        {
          uid: '1',
          keys: ['test'],
          content: 'test content',
          enabled: true
        }
      ]
    }

    it('应该导出为 JSON 格式', async () => {
      const json = await exportWorldbook(testWorldbook, 'json', { pretty: true })
      const parsed = JSON.parse(json)

      expect(parsed.name).toBe('测试世界书')
      expect(parsed.entries).toHaveLength(1)
    })

    it('应该导出为 JSONL 格式', async () => {
      const jsonl = await exportWorldbook(testWorldbook, 'jsonl')
      const lines = jsonl.split('\n')

      expect(lines).toHaveLength(1)
      const entry = JSON.parse(lines[0])
      expect(entry.uid).toBe('1')
    })

    it('应该支持过滤导出', async () => {
      const worldbook: WorldbookData = {
        entries: [
          { uid: '1', keys: ['a'], content: 'a', enabled: true },
          { uid: '2', keys: ['b'], content: 'b', enabled: false }
        ]
      }

      const json = await exportWorldbook(worldbook, 'json', {
        filter: (entry) => entry.enabled === true
      })

      const parsed = JSON.parse(json)
      expect(parsed.entries).toHaveLength(1)
      expect(parsed.entries[0].uid).toBe('1')
    })
  })
})
