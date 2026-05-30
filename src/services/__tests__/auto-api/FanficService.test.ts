/**
 * 接口自动化测试 — 同人创作服务（FanficService）
 * 覆盖用例：TC-A.1 ~ TC-A.6
 * 优先级：P0 + P1
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { chatMock, checkInitializedMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  checkInitializedMock: vi.fn(),
}))

vi.mock('@/stores/ai', () => ({
  useAIStore: () => ({
    chat: chatMock,
    checkInitialized: checkInitializedMock,
  }),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FanficService 接口自动化测试', () => {
  let FanficService: typeof import('@/services/FanficService').FanficService

  beforeEach(async () => {
    vi.clearAllMocks()
    checkInitializedMock.mockReturnValue(true)
    chatMock.mockResolvedValue({
      content: JSON.stringify({
        profiles: [
          { name: '萧炎', sourceDescription: '天才少年', fanficGuidelines: '保持热血性格' },
          { name: '萧薰儿', sourceDescription: '古族公主', fanficGuidelines: '温婉聪慧' },
        ],
      }),
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    })

    const mod = await import('@/services/FanficService')
    FanficService = mod.FanficService
  })

  // =========================================================================
  // TC-A.1 Canon模式初始化
  // =========================================================================
  describe('TC-A.1 Canon模式初始化', () => {
    it('P0: canon模式生成正确的项目配置', async () => {
      const service = new FanficService()
      const result = await service.initFanficProject({
        sourceMaterial: '斗破苍穹',
        mode: 'canon',
        characters: ['萧炎', '萧薰儿'],
        language: 'zh',
      })

      expect(result).toBeDefined()
      expect(result.title).toBeTruthy()
      expect(result.description).toBeTruthy()
      expect(result.systemPrompt).toContain('忠实原作设定')
      expect(result.worldRules.length).toBeGreaterThan(0)
      expect(result.writingConstraints.length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // TC-A.2 AU模式初始化
  // =========================================================================
  describe('TC-A.2 AU模式初始化', () => {
    it('P1: au模式生成包含平行宇宙描述的配置', async () => {
      const service = new FanficService()
      const result = await service.initFanficProject({
        sourceMaterial: '斗破苍穹',
        mode: 'au',
        characters: ['萧炎'],
        auDescription: '现代都市背景',
        language: 'zh',
      })

      expect(result.systemPrompt).toContain('平行宇宙')
      expect(result.description).toContain('平行宇宙')
    })
  })

  // =========================================================================
  // TC-A.3 CP模式
  // =========================================================================
  describe('TC-A.3 CP模式', () => {
    it('P1: cp模式包含CP信息', async () => {
      const service = new FanficService()
      const result = await service.initFanficProject({
        sourceMaterial: '斗破苍穹',
        mode: 'cp',
        characters: ['萧炎', '萧薰儿'],
        cpPairing: '萧炎x萧薰儿',
        language: 'zh',
      })

      expect(result.title).toContain('萧炎x萧薰儿')
      expect(result.description).toContain('CP')
    })
  })

  // =========================================================================
  // TC-A.4 OOC模式
  // =========================================================================
  describe('TC-A.4 OOC模式', () => {
    it('P1: ooc模式允许性格偏离', async () => {
      const service = new FanficService()
      const result = await service.initFanficProject({
        sourceMaterial: '斗破苍穹',
        mode: 'ooc',
        characters: ['萧炎'],
        language: 'zh',
      })

      expect(result.systemPrompt).toBeTruthy()
      expect(result.description).toContain('性格自由发挥')
    })
  })

  // =========================================================================
  // TC-A.5 项目标题生成
  // =========================================================================
  describe('TC-A.5 项目标题生成', () => {
    it('P2: canon模式标题格式正确', async () => {
      const service = new FanficService()
      const result = await service.initFanficProject({
        sourceMaterial: '斗破苍穹',
        mode: 'canon',
        characters: ['萧炎', '萧薰儿'],
        language: 'zh',
      })

      expect(result.title).toContain('斗破苍穹')
      expect(result.title).toContain('萧炎')
    })

    it('P2: cp模式标题包含CP信息', async () => {
      const service = new FanficService()
      const result = await service.initFanficProject({
        sourceMaterial: '斗破苍穹',
        mode: 'cp',
        characters: ['萧炎', '萧薰儿'],
        cpPairing: '萧炎x萧薰儿',
        language: 'zh',
      })

      expect(result.title).toContain('萧炎x萧薰儿')
    })
  })

  // =========================================================================
  // TC-A.6 项目描述生成
  // =========================================================================
  describe('TC-A.6 项目描述生成', () => {
    it('P2: 描述包含必要信息', async () => {
      const service = new FanficService()
      const result = await service.initFanficProject({
        sourceMaterial: '斗破苍穹',
        mode: 'canon',
        characters: ['萧炎', '萧薰儿'],
        theme: '热血冒险',
        language: 'zh',
      })

      expect(result.description).toContain('斗破苍穹')
      expect(result.description).toContain('萧炎')
      expect(result.description).toContain('忠实原作设定')
      expect(result.description).toContain('热血冒险')
    })
  })
})
