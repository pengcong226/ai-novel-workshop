/**
 * 接口自动化测试 — 连续性审计员（ContinuityAuditor）
 * 覆盖用例：TC-8.1 ~ TC-8.10
 * 优先级：P0 + P1
 */
import { describe, expect, it } from 'vitest'
import { AUDIT_DIMENSIONS, getGenreAuditDimensions } from '@/agents/ContinuityAuditor'

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------

describe('ContinuityAuditor 接口自动化测试', () => {

  // =========================================================================
  // TC-8.1 18维度审计维度完整性（含dialogue维度）
  // =========================================================================
  describe('TC-8.1 审计维度完整性', () => {
    it('P0: 共18个审计维度', () => {
      expect(AUDIT_DIMENSIONS.length).toBe(18)
    })

    it('P0: 7个critical维度', () => {
      const criticalDims = AUDIT_DIMENSIONS.filter(d => d.severity === 'critical')
      expect(criticalDims.length).toBe(7)

      const criticalIds = criticalDims.map(d => d.id).sort()
      expect(criticalIds).toEqual(['format', 'info-leak', 'lore', 'memo-deviation', 'ooc', 'power', 'timeline'])
    })

    it('P0: 8个warning维度', () => {
      const warningDims = AUDIT_DIMENSIONS.filter(d => d.severity === 'warning')
      expect(warningDims.length).toBe(8)

      const warningIds = warningDims.map(d => d.id).sort()
      expect(warningIds).toEqual(['desire-drive', 'dialogue', 'hooks', 'numbers', 'pacing', 'pov', 'sidekick-dumb', 'style'])
    })

    it('P0: 3个info维度', () => {
      const infoDims = AUDIT_DIMENSIONS.filter(d => d.severity === 'info')
      expect(infoDims.length).toBe(3)

      const infoIds = infoDims.map(d => d.id).sort()
      expect(infoIds).toEqual(['cliche', 'paragraph-length', 'word-fatigue'])
    })
  })

  // =========================================================================
  // TC-8.2 Critical维度权重正确
  // =========================================================================
  describe('TC-8.2 Critical维度权重', () => {
    it('P0: ooc权重为10', () => {
      const ooc = AUDIT_DIMENSIONS.find(d => d.id === 'ooc')
      expect(ooc).toBeDefined()
      expect(ooc!.weight).toBe(10)
    })

    it('P0: timeline权重为9', () => {
      const dim = AUDIT_DIMENSIONS.find(d => d.id === 'timeline')
      expect(dim!.weight).toBe(9)
    })

    it('P0: lore权重为9', () => {
      const dim = AUDIT_DIMENSIONS.find(d => d.id === 'lore')
      expect(dim!.weight).toBe(9)
    })

    it('P0: info-leak权重为9', () => {
      const dim = AUDIT_DIMENSIONS.find(d => d.id === 'info-leak')
      expect(dim!.weight).toBe(9)
    })

    it('P0: memo-deviation权重为8', () => {
      const dim = AUDIT_DIMENSIONS.find(d => d.id === 'memo-deviation')
      expect(dim!.weight).toBe(8)
    })

    it('P0: power权重为8', () => {
      const dim = AUDIT_DIMENSIONS.find(d => d.id === 'power')
      expect(dim!.weight).toBe(8)
    })

    it('P0: format权重为7', () => {
      const dim = AUDIT_DIMENSIONS.find(d => d.id === 'format')
      expect(dim!.weight).toBe(7)
    })
  })

  // =========================================================================
  // TC-8.2 附加: 所有维度结构完整性
  // =========================================================================
  describe('维度结构完整性', () => {
    it('P1: 每个维度都有必要字段', () => {
      for (const dim of AUDIT_DIMENSIONS) {
        expect(dim.id).toBeTruthy()
        expect(dim.name).toBeTruthy()
        expect(['critical', 'warning', 'info']).toContain(dim.severity)
        expect(dim.weight).toBeGreaterThan(0)
        expect(dim.description).toBeTruthy()
        expect(dim.checkInstruction).toBeTruthy()
      }
    })

    it('P1: 维度ID唯一', () => {
      const ids = AUDIT_DIMENSIONS.map(d => d.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })
  })

  // =========================================================================
  // TC-8.7 题材维度扩展——getGenreAuditDimensions
  // =========================================================================
  describe('TC-8.7 题材维度扩展', () => {
    it('P1: 未知题材返回默认维度', () => {
      const dims = getGenreAuditDimensions('未知题材')
      expect(dims.length).toBe(AUDIT_DIMENSIONS.length)
      expect(dims[0]!.id).toBe(AUDIT_DIMENSIONS[0]!.id)
    })

    it('P1: 不传genre返回默认维度', () => {
      const dims = getGenreAuditDimensions(undefined)
      expect(dims.length).toBe(AUDIT_DIMENSIONS.length)
    })

    it('P1: 空字符串返回默认维度', () => {
      const dims = getGenreAuditDimensions('')
      expect(dims.length).toBe(AUDIT_DIMENSIONS.length)
    })
  })

  // =========================================================================
  // TC-8.8 题材维度扩展——已知题材
  // =========================================================================
  describe('TC-8.8 已知题材维度扩展', () => {
    it('P1: 玄幻题材返回有效维度列表', () => {
      const dims = getGenreAuditDimensions('玄幻')
      expect(dims.length).toBeGreaterThanOrEqual(1)
      // 每个维度都应有必要的字段
      for (const dim of dims) {
        expect(dim.id).toBeTruthy()
        expect(dim.name).toBeTruthy()
        expect(dim.severity).toBeTruthy()
      }
    })

    it('P1: 仙侠题材返回有效维度列表', () => {
      const dims = getGenreAuditDimensions('仙侠')
      expect(dims.length).toBeGreaterThanOrEqual(1)
    })

    it('P1: 都市题材返回有效维度列表', () => {
      const dims = getGenreAuditDimensions('都市')
      expect(dims.length).toBeGreaterThanOrEqual(1)
    })

    it('P1: 使用英文genreId也能返回维度', () => {
      const dims = getGenreAuditDimensions('xuanhuan')
      expect(dims.length).toBeGreaterThanOrEqual(1)
    })
  })
})
