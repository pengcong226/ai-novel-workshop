import { describe, it, expect, vi } from 'vitest'
import { ImporterRegistry } from '../registries/importer-registry'
import { ExporterRegistry } from '../registries/exporter-registry'

describe('Importer/Exporter pipeline integration', () => {
  it('runs pre-import and post-import processor pipeline around importer', async () => {
    const registry = new ImporterRegistry()
    const processPipeline = vi.fn(async (stage: string, data: any) => {
      if (stage === 'pre-import') {
        return {
          ...data,
          text: async () => 'raw-from-pipeline'
        }
      }
      if (stage === 'post-import') return { ...data, project: { ...(data.project || {}), piped: true } }
      return data
    })

    ;(registry as any).processorRegistry = { processPipeline }

    let importerReceivedText = ''
    registry.register({
      id: 'txt-importer',
      name: 'Text Importer',
      type: 'importer',
      supportedFormats: ['txt'],
      fileExtensions: ['.txt'],
      async import(file: File) {
        importerReceivedText = await (file as any).text()
        return { project: { title: 'Imported' } }
      }
    } as any)

    const fakeFile = {
      name: 'demo.txt',
      type: 'text/plain',
      async text() {
        return 'raw'
      }
    } as any as File

    const result = await registry.import('txt-importer', fakeFile)

    expect(processPipeline).toHaveBeenCalledWith('pre-import', expect.anything(), expect.anything())
    expect(importerReceivedText).toBe('raw-from-pipeline')
    expect(processPipeline).toHaveBeenCalledWith('post-import', expect.anything(), expect.anything())
    expect((result as any).project.piped).toBe(true)
  })

  it('runs pre-export processor pipeline before exporter.export', async () => {
    const registry = new ExporterRegistry()
    const processPipeline = vi.fn(async (_stage: string, data: any) => ({
      ...data,
      content: { ...data.content, title: 'Processed by Pipeline' }
    }))

    ;(registry as any).processorRegistry = { processPipeline }

    let exporterReceived: any = null
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
      async export(data: any) {
        exporterReceived = data
        return new Blob(['ok'], { type: 'text/markdown' })
      }
    } as any)

    const blob = await registry.export('md-exporter', {
      type: 'project',
      content: { title: 'Original' }
    } as any)

    expect(blob).toBeInstanceOf(Blob)
    expect(processPipeline).toHaveBeenCalledWith('pre-export', expect.anything(), expect.anything())
    expect(exporterReceived.content.title).toBe('Processed by Pipeline')
  })
})
