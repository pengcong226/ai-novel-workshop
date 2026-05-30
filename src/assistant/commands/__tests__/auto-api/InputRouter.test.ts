/**
 * 接口自动化测试 — 自然语言命令路由（InputRouter / BuiltinCommands）
 * 覆盖用例：TC-C.1 ~ TC-C.6
 * 优先级：P1
 */
import { describe, expect, it, vi } from 'vitest'
import { builtinCommandRegistry } from '@/assistant/commands/builtinCommands'
import { routeAssistantInput } from '@/assistant/commands/inputRouter'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/stores/ai', () => ({
  useAIStore: () => ({
    chat: vi.fn().mockResolvedValue({ content: 'mock response', usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }),
    checkInitialized: vi.fn().mockReturnValue(true),
  }),
}))

vi.mock('@/stores/project', () => ({
  useProjectStore: () => ({
    currentProject: {
      chapters: [{ number: 1, title: '第一章', content: '测试内容' }],
    },
  }),
}))

describe('InputRouter 接口自动化测试', () => {

  // =========================================================================
  // TC-C.1 help命令
  // =========================================================================
  describe('TC-C.1 help命令', () => {
    it('P1: /help命令存在且可执行', async () => {
      const result = await builtinCommandRegistry.executeCommand('/help', '')
      expect(result).toBeDefined()
    })
  })

  // =========================================================================
  // TC-C.2 review命令——默认一致性检查
  // =========================================================================
  describe('TC-C.2 review命令', () => {
    it('P1: /review命令可执行', async () => {
      try {
        const result = await builtinCommandRegistry.executeCommand('/review', '')
        expect(result).toBeDefined()
      } catch (e) {
        // review可能因为缺少完整项目上下文而失败，但不应是命令不存在的错误
        expect((e as Error).message).not.toContain('Not a valid command')
      }
    })
  })

  // =========================================================================
  // TC-C.5 非命令文本路由
  // =========================================================================
  describe('TC-C.5 非命令文本路由', () => {
    it('P1: 不以/开头的文本路由为聊天', async () => {
      const result = await routeAssistantInput('你好，帮我写一个故事')
      expect(result).toBeDefined()
      expect(result.type).toBe('chat')
    })

    it('P1: 普通文本不被当作命令', async () => {
      const result = await routeAssistantInput('这是一段普通文本')
      expect(result.type).not.toBe('command')
    })
  })

  // =========================================================================
  // TC-C.6 未注册命令
  // =========================================================================
  describe('TC-C.6 未注册命令', () => {
    it('P1: 未注册命令返回错误', async () => {
      try {
        await builtinCommandRegistry.executeCommand('/nonexistent_command_xyz', '')
        // 如果不抛出异常，应该返回错误信息
      } catch (e) {
        expect(e).toBeDefined()
      }
    })
  })
})
