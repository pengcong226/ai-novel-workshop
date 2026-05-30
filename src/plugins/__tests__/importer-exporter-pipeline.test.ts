import { describe, it, expect, vi } from 'vitest'
import { ImporterRegistry } from '../registries/importer-registry'
import { ExporterRegistry } from '../registries/exporter-registry'
import type { ImportResult, ExportData, ImporterContribution, ExporterContribution } from '../types'

describe('Importer/Exporter pipeline integration', () => {
  it('runs pre-import and post-import processor pipeline around importer', async () => {
    const registry = new ImporterRegistry()
    const processPipeline = vi.fn(async (stage: string, data: unknown) => {
      const obj = data as Record<string, unknown>
      if (stage === 'pre-import') {
        return {
          ...obj,
          text: async () => 'raw-from-pipeline'
        }
      }
      if (stage === 'post-import') return { ...obj, project: { ...((obj.project || {}) as Record<string, unknown>), piped: true } }
      return data
    })

    ;(registry as unknown as Record<string, unknown>).processorRegistry = { processPipeline }

    let importerReceivedText = ''
    registry.register({
      id: 'txt-importer',
      name: 'Text Importer',
      type: 'importer',
      supportedFormats: ['txt'],
      fileExtensions: ['.txt'],
      async import(file: File) {
        importerReceivedText = await (file as unknown as { text(): Promise<string> }).text()
        return { project: { title: 'Imported' } }
      }
    } as unknown as ImporterContribution)

    const fakeFile = {
      name: 'demo.txt',
      type: 'text/plain',
      async text() {
        return 'raw'
      }
    } as unknown as File

    const result = await registry.import('txt-importer', fakeFile)

    expect(processPipeline).toHaveBeenCalledWith('pre-import', expect.anything(), expect.anything())
    expect(importerReceivedText).toBe('raw-from-pipeline')
    expect(processPipeline).toHaveBeenCalledWith('post-import', expect.anything(), expect.anything())
    expect(((result as ImportResult).project as Record<string, unknown>).piped).toBe(true)
  })

  it('runs pre-export processor pipeline before exporter.export', async () => {
    const registry = new ExporterRegistry()
    const processPipeline = vi.fn(async (_stage: string, data: unknown) => {
      const obj = data as Record<string, unknown>
      return {
        ...obj,
        content: { ...((obj.content || {}) as Record<string, unknown>), title: 'Processed by Pipeline' }
      }
    })

    ;(registry as unknown as Record<string, unknown>).processorRegistry = { processPipeline }

    let exporterReceived: ExportData | null = null
    registry.register({
      id: 'md-exporter',
      name: 'Markdown Exporter',
      type: 'exporter',
      format: 'md',
      fileExtension: '.md',
      mimeType: 'text/markdown',
      capabilities: {
        supportsBatch: false,
        supportsCustomTemplate: false,
        supportsMetadata: false,
        supportsImages: false
      },
      async export(data: ExportData) {
        exporterReceived = data
        return new Blob(['ok'], { type: 'text/markdown' })
      }
    } as unknown as ExporterContribution)

    const blob = await registry.export('md-exporter', {
      type: 'project',
      content: { title: 'Original' }
    } as ExportData)

    expect(blob).toBeInstanceOf(Blob)
    expect(processPipeline).toHaveBeenCalledWith('pre-export', expect.anything(), expect.anything())
    expect((exporterReceived!.content as Record<string, unknown>).title).toBe('Processed by Pipeline')
  })
})
