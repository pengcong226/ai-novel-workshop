import { describe, it, expect } from 'vitest'
import { ProcessorRegistry } from '../registries/processor-registry'

describe('ProcessorRegistry', () => {
  it('executes processors by priority descending', async () => {
    const registry = new ProcessorRegistry()
    const calls: string[] = []

    registry.register({
      id: 'low',
      name: 'Low',
      type: 'processor',
      stage: 'post-generation',
      async process(data: any) {
        calls.push('low')
        return `${data}-low`
      }
    })

    registry.register({
      id: 'high',
      name: 'High',
      type: 'processor',
      stage: 'post-generation',
      priority: 100,
      async process(data: any) {
        calls.push('high')
        return `${data}-high`
      }
    } as any)

    registry.register({
      id: 'mid',
      name: 'Mid',
      type: 'processor',
      stage: 'post-generation',
      priority: 50,
      async process(data: any) {
        calls.push('mid')
        return `${data}-mid`
      }
    } as any)

    const result = await registry.processPipeline('post-generation', 'x', {})

    expect(calls).toEqual(['high', 'mid', 'low'])
    expect(result).toBe('x-high-mid-low')
  })

  it('continues when processor fails and onError is continue', async () => {
    const registry = new ProcessorRegistry()

    registry.register({
      id: 'fail-continue',
      name: 'Fail Continue',
      type: 'processor',
      stage: 'post-generation',
      onError: 'continue',
      async process() {
        throw new Error('boom')
      }
    } as any)

    registry.register({
      id: 'next',
      name: 'Next',
      type: 'processor',
      stage: 'post-generation',
      async process(data: any) {
        return `${data}-ok`
      }
    })

    const result = await registry.processPipeline('post-generation', 'start', {})
    expect(result).toBe('start-ok')
  })

  it('aborts when processor fails and onError is abort', async () => {
    const registry = new ProcessorRegistry()

    registry.register({
      id: 'fail-abort',
      name: 'Fail Abort',
      type: 'processor',
      stage: 'post-generation',
      onError: 'abort',
      async process() {
        throw new Error('stop-here')
      }
    } as any)

    registry.register({
      id: 'never',
      name: 'Never',
      type: 'processor',
      stage: 'post-generation',
      async process(data: any) {
        return `${data}-never`
      }
    })

    await expect(registry.processPipeline('post-generation', 'start', {})).rejects.toThrow('stop-here')
  })

  it('throws timeout error when processor exceeds timeoutMs', async () => {
    const registry = new ProcessorRegistry()

    registry.register({
      id: 'slow',
      name: 'Slow',
      type: 'processor',
      stage: 'post-generation',
      timeoutMs: 20,
      async process(data: any) {
        await new Promise(resolve => setTimeout(resolve, 80))
        return `${data}-slow`
      }
    } as any)

    await expect(registry.processPipeline('post-generation', 'x', {})).rejects.toThrow('timeout')
  })
})
