/**
 * 世界书导出服务测试
 */

import { describe, it, expect } from 'vitest'
import {
  WorldbookExporter,
  createWorldbookExporter,
  exportWorldbookAsJson,
  exportWorldbookAsJsonl,
  exportWorldbookAsYaml,
  exportWorldbookAsMarkdown
} from '../worldbook-exporter'
import type { Worldbook, WorldbookEntry } from '@/types/worldbook'

describe('WorldbookExporter', () => {
  // 测试数据
  const createTestWorldbook = (): Worldbook => ({
    name: '测试世界书',
    entries: [
      {
        uid: 1,
        key: ['角色A', 'character_a'],
        keysecondary: ['A'],
        content: '角色A是一个勇敢的战士。',
        comment: '角色A介绍',
        constant: false,
        disable: false,
        order: 10,
        position: 'before_char',
        probability: 100,
        depth: 4,
        novelWorkshop: {
          category: '角色',
          tags: ['主角', '战士'],
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-02'),
          relatedCharacters: ['char_001'],
          statistics: {
            activationCount: 50,
            tokenUsage: 120
          }
        }
      },
      {
        uid: 2,
        key: ['地点B', 'location_b'],
        content: '地点B是一座古老的城市。',
        comment: '地点B描述',
        constant: true,
        disable: false,
        order: 5,
        novelWorkshop: {
          category: '地点',
          tags: ['城市'],
          relatedLocations: ['loc_001']
        }
      },
      {
        uid: 3,
        key: ['事件C'],
        content: '事件C是一场大战。',
        disable: true,
        order: 15,
        novelWorkshop: {
          category: '事件',
          chapterRange: {
            start: 10,
            end: 20
          }
        }
      }
    ],
    metadata: {
      description: '这是一个测试世界书',
      totalEntries: 3,
      scan_depth: 2,
      token_budget: 2000
    }
  })

  describe('exportAsJson', () => {
    it('应该导出为 JSON 格式', () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()
      const json = exporter.exportAsJson(worldbook, { pretty: true })

      expect(json).toBeDefined()
      expect(typeof json).toBe('string')

      const parsed = JSON.parse(json)
      expect(parsed.name).toBe('测试世界书')
      expect(parsed.entries).toHaveLength(3)
    })

    it('应该过滤禁用的条目', () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()
      const json = exporter.exportAsJson(worldbook, {
        includeDisabled: false,
        pretty: false
      })

      const parsed = JSON.parse(json)
      expect(parsed.entries).toHaveLength(2)
      expect(parsed.entries.find((e: WorldbookEntry) => e.uid === 3)).toBeUndefined()
    })

    it('应该只包含启用的条目', () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()
      const json = exporter.exportAsJson(worldbook, {
        enabledOnly: true,
        pretty: false
      })

      const parsed = JSON.parse(json)
      expect(parsed.entries).toHaveLength(2)
      expect(parsed.entries.find((e: WorldbookEntry) => e.disable)).toBeUndefined()
    })

    it('应该包含扩展字段', () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()
      const json = exporter.exportAsJson(worldbook, {
        includeExtensions: true,
        pretty: false
      })

      const parsed = JSON.parse(json)
      expect(parsed.entries[0].extensions?.novelWorkshop).toBeDefined()
      expect(parsed.entries[0].extensions?.novelWorkshop.category).toBe('角色')
    })

    it('应该按指定字段排序', () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()

      // 按 order 排序
      const jsonByOrder = exporter.exportAsJson(worldbook, {
        sortBy: 'order',
        pretty: false
      })
      const parsedByOrder = JSON.parse(jsonByOrder)
      expect(parsedByOrder.entries[0].uid).toBe(2) // order: 5
      expect(parsedByOrder.entries[1].uid).toBe(1) // order: 10
      expect(parsedByOrder.entries[2].uid).toBe(3) // order: 15
    })
  })

  describe('exportAsJsonl', () => {
    it('应该导出为 JSONL 格式', () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()
      const jsonl = exporter.exportAsJsonl(worldbook)

      expect(jsonl).toBeDefined()
      expect(typeof jsonl).toBe('string')

      const lines = jsonl.split('\n')
      expect(lines).toHaveLength(3)

      // 每行应该是有效的 JSON
      lines.forEach(line => {
        const entry = JSON.parse(line)
        expect(entry.uid).toBeDefined()
        expect(entry.key).toBeDefined()
        expect(entry.content).toBeDefined()
      })
    })
  })

  describe('exportAsYaml', () => {
    it('应该导出为 YAML 格式', async () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()
      const yaml = await exporter.exportAsYaml(worldbook)

      expect(yaml).toBeDefined()
      expect(typeof yaml).toBe('string')
      expect(yaml).toContain('name: 测试世界书')
      expect(yaml).toContain('entries:')
    })
  })

  describe('exportAsMarkdown', () => {
    it('应该导出为 Markdown 格式（详细模板）', () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()
      const markdown = exporter.exportAsMarkdown(worldbook, {
        template: 'detailed',
        includeStatistics: true,
        includeToc: true
      })

      expect(markdown).toBeDefined()
      expect(markdown).toContain('# 测试世界书')
      expect(markdown).toContain('## 统计信息')
      expect(markdown).toContain('## 目录')
      expect(markdown).toContain('### 角色A介绍')
    })

    it('应该导出为 Markdown 格式（紧凑模板）', () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()
      const markdown = exporter.exportAsMarkdown(worldbook, {
        template: 'compact',
        includeStatistics: false,
        includeToc: false
      })

      expect(markdown).toBeDefined()
      expect(markdown).toContain('# 测试世界书')
      expect(markdown).not.toContain('## 统计信息')
      expect(markdown).not.toContain('## 目录')
    })

    it('应该按分类分组', () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()
      const markdown = exporter.exportAsMarkdown(worldbook, {
        template: 'detailed',
        groupByCategory: true
      })

      expect(markdown).toContain('## 角色')
      expect(markdown).toContain('## 地点')
      expect(markdown).toContain('## 事件')
    })

    it('应该包含扩展字段', () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()
      const markdown = exporter.exportAsMarkdown(worldbook, {
        template: 'detailed',
        includeExtensions: true
      })

      expect(markdown).toContain('**扩展信息**:')
      expect(markdown).toContain('分类: 角色')
      expect(markdown).toContain('标签: 主角, 战士')
    })
  })

  describe('export', () => {
    it('应该导出为 JSON 格式', async () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()
      const result = await exporter.export(worldbook, { format: 'json' })

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.exportedCount).toBe(3)
      expect(result.mimeType).toBe('application/json')
      expect(result.suggestedFilename).toContain('.json')
    })

    it('应该导出为 YAML 格式', async () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()
      const result = await exporter.export(worldbook, { format: 'yaml' })

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.exportedCount).toBe(3)
      expect(result.mimeType).toBe('text/yaml')
      expect(result.suggestedFilename).toContain('.yaml')
    })

    it('应该导出为 Markdown 格式', async () => {
      const worldbook = createTestWorldbook()
      const exporter = new WorldbookExporter()
      const result = await exporter.export(worldbook, { format: 'markdown' })

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.exportedCount).toBe(3)
      expect(result.mimeType).toBe('text/markdown')
      expect(result.suggestedFilename).toContain('.md')
    })
  })

  describe('便捷导出函数', () => {
    it('exportWorldbookAsJson 应该正常工作', async () => {
      const worldbook = createTestWorldbook()
      const result = await exportWorldbookAsJson(worldbook, { pretty: true })

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
    })

    it('exportWorldbookAsJsonl 应该正常工作', async () => {
      const worldbook = createTestWorldbook()
      const jsonl = await exportWorldbookAsJsonl(worldbook)

      expect(jsonl).toBeDefined()
      expect(jsonl.split('\n')).toHaveLength(3)
    })

    it('exportWorldbookAsYaml 应该正常工作', async () => {
      const worldbook = createTestWorldbook()
      const yaml = await exportWorldbookAsYaml(worldbook)

      expect(yaml).toBeDefined()
      expect(yaml).toContain('name: 测试世界书')
    })

    it('exportWorldbookAsMarkdown 应该正常工作', async () => {
      const worldbook = createTestWorldbook()
      const markdown = await exportWorldbookAsMarkdown(worldbook)

      expect(markdown).toBeDefined()
      expect(markdown).toContain('# 测试世界书')
    })
  })

  describe('createWorldbookExporter', () => {
    it('应该创建导出器实例', () => {
      const exporter = createWorldbookExporter()
      expect(exporter).toBeInstanceOf(WorldbookExporter)
    })
  })
})
