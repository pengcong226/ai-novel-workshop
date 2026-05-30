/**
 * 接口自动化测试 — ReaderAgent 多读者群体评估
 * 覆盖用例：TC-6-2-01 ~ TC-6-2-04
 * 优先级：P0 + P1
 *
 * 注意：runMultiPersonaReview 依赖 LLM 调用（通过 reviewRunner），
 * 本测试重点验证 ReaderAgent 的静态方法和降级处理逻辑。
 */
import { describe, expect, it } from 'vitest'
import { ReaderAgent } from '@/agents/ReaderAgent'

describe('ReaderAgent 多读者群体评估 接口自动化测试', () => {

  // =========================================================================
  // TC-6-2-01 [P0] 验证3种读者群体预设存在
  // =========================================================================
  describe('TC-6-2-01 [P0] 读者群体预设', () => {
    it('应返回3个预设读者群体', () => {
      const personas = ReaderAgent.getPersonas()

      expect(personas).toBeDefined()
      expect(Array.isArray(personas)).toBe(true)
      expect(personas.length).toBe(3)
    })

    it('应包含veteran（资深网文读者）', () => {
      const personas = ReaderAgent.getPersonas()
      const veteran = personas.find(p => p.id === 'veteran')

      expect(veteran).toBeDefined()
      expect(veteran!.name).toBe('资深网文读者')
      expect(veteran!.readingExperience).toBe('veteran')
      expect(veteran!.genreFamiliarity).toBe('core')
      expect(Array.isArray(veteran!.focusAreas)).toBe(true)
      expect(veteran!.focusAreas.length).toBeGreaterThan(0)
    })

    it('应包含newcomer（新手读者）', () => {
      const personas = ReaderAgent.getPersonas()
      const newcomer = personas.find(p => p.id === 'newcomer')

      expect(newcomer).toBeDefined()
      expect(newcomer!.name).toBe('新手读者')
      expect(newcomer!.readingExperience).toBe('newcomer')
      expect(newcomer!.genreFamiliarity).toBe('unfamiliar')
    })

    it('应包含genre_fan（题材核心受众）', () => {
      const personas = ReaderAgent.getPersonas()
      const genreFan = personas.find(p => p.id === 'genre_fan')

      expect(genreFan).toBeDefined()
      expect(genreFan!.name).toBe('题材核心受众')
      expect(genreFan!.readingExperience).toBe('intermediate')
      expect(genreFan!.genreFamiliarity).toBe('core')
    })
  })

  // =========================================================================
  // TC-6-2-02 [P0] 验证多读者群体并行评估接口
  // =========================================================================
  describe('TC-6-2-02 [P0] 多读者群体并行评估接口', () => {
    it('ReaderAgent应有runMultiPersonaReview方法', () => {
      const agent = new ReaderAgent()

      expect(typeof agent.runMultiPersonaReview).toBe('function')
    })

    it('getPersonas应返回不可变副本', () => {
      const personas1 = ReaderAgent.getPersonas()
      const personas2 = ReaderAgent.getPersonas()

      // 应返回不同引用（副本）
      expect(personas1).not.toBe(personas2)
      // 但内容相同
      expect(personas1).toEqual(personas2)
    })
  })

  // =========================================================================
  // TC-6-2-03 [P1] 验证单群体评估失败时的降级处理
  // =========================================================================
  describe('TC-6-2-03 [P1] 降级处理', () => {
    it('缺少输入时应返回空数组', async () => {
      const agent = new ReaderAgent()

      // 当 context 缺少 project 和 chapter 时，应返回空数组
      const result = await agent.runMultiPersonaReview(
        {} as any, // 空 context
        {} as any, // 空 config
      )

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it('缺少chapter时应返回空数组', async () => {
      const agent = new ReaderAgent()

      const result = await agent.runMultiPersonaReview(
        { project: { id: 'test' } } as any,
        {} as any,
      )

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })
  })

  // =========================================================================
  // TC-6-2-04 [P1] 验证自定义persona参数
  // =========================================================================
  describe('TC-6-2-04 [P1] 自定义persona', () => {
    it('getPersonas返回的persona应包含必要的字段', () => {
      const personas = ReaderAgent.getPersonas()

      for (const persona of personas) {
        expect(persona.id).toBeDefined()
        expect(persona.name).toBeDefined()
        expect(persona.readingExperience).toBeDefined()
        expect(persona.genreFamiliarity).toBeDefined()
        expect(Array.isArray(persona.focusAreas)).toBe(true)
        expect(persona.toleranceForTropes).toBeDefined()
      }
    })

    it('每个persona的focusAreas应非空', () => {
      const personas = ReaderAgent.getPersonas()

      for (const persona of personas) {
        expect(persona.focusAreas.length).toBeGreaterThan(0)
      }
    })

    it('persona的toleranceForTropes应为有效值', () => {
      const personas = ReaderAgent.getPersonas()
      const validValues = ['low', 'medium', 'high']

      for (const persona of personas) {
        expect(validValues).toContain(persona.toleranceForTropes)
      }
    })
  })
})
