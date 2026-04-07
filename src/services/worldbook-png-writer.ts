/**
 * PNG 写卡工具
 *
 * 将世界书或角色卡数据嵌入PNG图片元数据
 *
 * 核心功能：
 * - 创建世界书PNG（带元数据）
 * - 嵌入世界书到角色卡PNG
 * - 支持Character Card V1/V2/V3格式
 * - 支持tEXt和zTXt chunk（自动压缩）
 * - CRC32校验确保数据完整性
 *
 * @module services/worldbook-png-writer
 */

import type { Worldbook } from '@/types/worldbook'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * PNG Writer选项
 */
export interface PngWriterOptions {
  /** PNG宽度 (默认512) */
  width?: number

  /** PNG高度 (默认512) */
  height?: number

  /** 背景颜色 (十六进制，默认'#1a1a2e') */
  backgroundColor?: string

  /** 角色卡格式 (v1, v2, v3) */
  cardFormat?: 'v1' | 'v2' | 'v3'

  /** 是否包含扩展字段 */
  includeExtensions?: boolean

  /** 是否包含AI元数据 */
  includeAiMetadata?: boolean

  /** 压缩阈值 (字节，默认1024) */
  compressionThreshold?: number
}

/**
 * Character Card V1/V2 数据结构
 */
export interface CharacterCardV1 {
  name: string
  description?: string
  personality?: string
  scenario?: string
  first_mes?: string
  mes_example?: string
  [key: string]: any
}

/**
 * Character Card V3 数据结构
 */
export interface CharacterCardV2 {
  spec: 'chara_card_v2'
  spec_version: '2.0'
  data: {
    name: string
    description?: string
    personality?: string
    scenario?: string
    first_mes?: string
    mes_example?: string
    character_book?: {
      entries: Worldbook['entries']
      name?: string
      description?: string
      scan_depth?: number
      token_budget?: number
      recursive_scan_depth?: number
      extensions?: Record<string, unknown>
    }
    [key: string]: any
  }
  [key: string]: any
}

/**
 * Character Card V3 数据结构
 */
export interface CharacterCardV3 {
  spec: 'chara_card_v3'
  spec_version: '3.0'
  data: {
    name: string
    description?: string
    personality?: string
    scenario?: string
    first_mes?: string
    mes_example?: string
    character_book?: {
      entries: Worldbook['entries']
      name?: string
      description?: string
      scan_depth?: number
      token_budget?: number
      recursive_scan_depth?: number
      extensions?: Record<string, unknown>
    }
    [key: string]: any
  }
  [key: string]: any
}

/**
 * PNG Chunk结构
 */
interface PngChunk {
  /** Chunk类型 (4字节ASCII) */
  type: string

  /** Chunk数据 */
  data: Uint8Array
}

// ============================================================================
// 常量
// ============================================================================

/** PNG签名 */
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

/** CRC32查找表 */
const CRC32_TABLE = buildCrc32Table()

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 构建CRC32查找表
 */
function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256)

  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }

  return table
}

/**
 * 计算CRC32校验和
 *
 * @param data 数据
 * @returns CRC32值
 */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff

  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

/**
 * 将字符串编码为Latin1字节
 *
 * @param str 字符串
 * @returns 字节数组
 */
function encodeLatin1(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length)

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    bytes[i] = code > 255 ? 63 : code // '?' for non-Latin1
  }

  return bytes
}

/**
 * Base64编码
 *
 * @param data 字节数组
 * @returns Base64字符串
 */
function base64Encode(data: Uint8Array): string {
  // 使用浏览器原生Base64编码
  const binary = String.fromCharCode.apply(null, Array.from(data))
  return btoa(binary)
}

/**
 * pako压缩 (动态导入)
 */
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  try {
    // 尝试使用pako (如果可用)
    // @ts-ignore - pako是可选依赖
    const pako = await import('pako')
    return pako.deflate(data)
  } catch {
    // 如果pako不可用，使用浏览器原生CompressionStream
    const stream = new CompressionStream('deflate')
    const writer = stream.writable.getWriter()
    await writer.write(data as BufferSource)
    await writer.close()

    const reader = stream.readable.getReader()
    const chunks: Uint8Array[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }

    // 合并chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0

    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }

    return result
  }
}

// ============================================================================
// PNG Chunk操作
// ============================================================================

/**
 * 创建tEXt chunk (未压缩文本)
 *
 * @param keyword 关键字
 * @param value 值
 * @returns PNG chunk
 */
function createTextChunk(keyword: string, value: string): PngChunk {
  // tEXt chunk格式: keyword + null separator + text
  const keywordBytes = encodeLatin1(keyword)
  const valueBytes = encodeLatin1(value)

  const data = new Uint8Array(keywordBytes.length + 1 + valueBytes.length)
  data.set(keywordBytes, 0)
  data[keywordBytes.length] = 0 // null separator
  data.set(valueBytes, keywordBytes.length + 1)

  return {
    type: 'tEXt',
    data
  }
}

/**
 * 创建zTXt chunk (压缩文本)
 *
 * @param keyword 关键字
 * @param value 值
 * @returns PNG chunk
 */
async function createCompressedTextChunk(
  keyword: string,
  value: string
): Promise<PngChunk> {
  // zTXt chunk格式: keyword + null separator + compression method + compressed text
  const keywordBytes = encodeLatin1(keyword)
  const valueBytes = encodeLatin1(value)

  // 压缩数据
  const compressed = await deflate(valueBytes)

  const data = new Uint8Array(
    keywordBytes.length + 1 + 1 + compressed.length
  )
  data.set(keywordBytes, 0)
  data[keywordBytes.length] = 0 // null separator
  data[keywordBytes.length + 1] = 0 // compression method (0 = deflate)
  data.set(compressed, keywordBytes.length + 2)

  return {
    type: 'zTXt',
    data
  }
}

/**
 * 创建IHDR chunk (PNG头信息)
 *
 * @param width 宽度
 * @param height 高度
 * @returns PNG chunk
 */
function createIhdrChunk(width: number, height: number): PngChunk {
  const data = new Uint8Array(13)
  const view = new DataView(data.buffer)

  // 宽度和高度 (4字节大端)
  view.setUint32(0, width, false)
  view.setUint32(4, height, false)

  // 位深度 (8位)
  data[8] = 8

  // 颜色类型 (2 = RGB, 6 = RGBA)
  data[9] = 6

  // 压缩方法 (0 = deflate)
  data[10] = 0

  // 滤波方法 (0)
  data[11] = 0

  // 隔行扫描 (0 = 无)
  data[12] = 0

  return {
    type: 'IHDR',
    data
  }
}

/**
 * 创建IDAT chunk (图像数据)
 *
 * @param canvas Canvas元素
 * @returns PNG chunk数据
 */
async function createIdatChunk(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas转换为Blob失败'))
          return
        }

        const reader = new FileReader()
        reader.onload = () => {
          const arrayBuffer = reader.result as ArrayBuffer
          const pngData = new Uint8Array(arrayBuffer)

          // 从PNG中提取IDAT chunk
          let offset = 8 // 跳过PNG签名

          while (offset < pngData.length) {
            const length = new DataView(pngData.buffer, offset, 4).getUint32(0, false)
            const type = String.fromCharCode.apply(
              null,
              Array.from(pngData.subarray(offset + 4, offset + 8))
            )

            if (type === 'IDAT') {
              resolve(pngData.subarray(offset + 8, offset + 8 + length))
              return
            }

            offset += 12 + length // length(4) + type(4) + data(length) + crc(4)
          }

          reject(new Error('未找到IDAT chunk'))
        }
        reader.onerror = () => reject(new Error('读取PNG数据失败'))
        reader.readAsArrayBuffer(blob)
      },
      'image/png'
    )
  })
}

/**
 * 创建IEND chunk (PNG结束)
 *
 * @returns PNG chunk
 */
function createIendChunk(): PngChunk {
  return {
    type: 'IEND',
    data: new Uint8Array(0)
  }
}

/**
 * 将chunk编码为PNG格式
 *
 * @param chunk PNG chunk
 * @returns 字节数组
 */
function encodeChunk(chunk: PngChunk): Uint8Array {
  const typeBytes = encodeLatin1(chunk.type)
  const crcData = new Uint8Array(typeBytes.length + chunk.data.length)

  crcData.set(typeBytes, 0)
  crcData.set(chunk.data, typeBytes.length)

  const crc = crc32(crcData)

  // PNG chunk格式: length(4) + type(4) + data(length) + crc(4)
  const result = new Uint8Array(4 + 4 + chunk.data.length + 4)
  const view = new DataView(result.buffer)

  // 长度
  view.setUint32(0, chunk.data.length, false)

  // 类型
  result.set(typeBytes, 4)

  // 数据
  result.set(chunk.data, 8)

  // CRC
  view.setUint32(result.length - 4, crc, false)

  return result
}

// ============================================================================
// Canvas绘制
// ============================================================================

/**
 * 创建基础Canvas
 *
 * @param width 宽度
 * @param height 高度
 * @param backgroundColor 背景颜色
 * @returns Canvas元素和上下文
 */
function createCanvas(
  width: number,
  height: number,
  backgroundColor: string
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法创建Canvas 2D上下文')
  }

  // 绘制渐变背景
  const gradient = ctx.createLinearGradient(0, 0, width, height)

  // 解析颜色并创建渐变
  const baseColor = backgroundColor || '#1a1a2e'
  gradient.addColorStop(0, baseColor)
  gradient.addColorStop(1, adjustBrightness(baseColor, -30))

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  return { canvas, ctx }
}

/**
 * 调整颜色亮度
 *
 * @param color 颜色 (十六进制)
 * @param amount 调整量 (-255到255)
 * @returns 调整后的颜色
 */
function adjustBrightness(color: string, amount: number): string {
  const hex = color.replace('#', '')
  const num = parseInt(hex, 16)

  let r = (num >> 16) + amount
  let g = ((num >> 8) & 0x00ff) + amount
  let b = (num & 0x0000ff) + amount

  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * 绘制世界书信息到Canvas
 *
 * @param ctx Canvas上下文
 * @param worldbook 世界书数据
 * @param width 宽度
 * @param height 高度
 */
function drawWorldbookInfo(
  ctx: CanvasRenderingContext2D,
  worldbook: Worldbook,
  width: number,
  height: number
): void {
  const padding = 40

  // 标题背景
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.fillRect(0, 0, width, 120)

  // 标题
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 32px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const title = worldbook.name || '世界书'
  ctx.fillText(title, width / 2, 50, width - padding * 2)

  // 条目数量
  ctx.font = '16px Arial, sans-serif'
  ctx.fillStyle = '#cccccc'
  ctx.fillText(`共 ${worldbook.entries.length} 个条目`, width / 2, 85)

  // 底部信息
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.fillRect(0, height - 60, width, 60)

  ctx.fillStyle = '#ffffff'
  ctx.font = '14px Arial, sans-serif'
  ctx.fillText('AI 小说工坊 - 世界书', width / 2, height - 30)

  // 分类统计
  const categories = new Map<string, number>()
  for (const entry of worldbook.entries) {
    const category = entry.novelWorkshop?.category || '未分类'
    categories.set(category, (categories.get(category) || 0) + 1)
  }

  if (categories.size > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.font = '12px Arial, sans-serif'
    ctx.textAlign = 'left'

    let y = 160
    const lineHeight = 24

    ctx.fillText('分类统计:', padding, y)
    y += lineHeight

    for (const [category, count] of Array.from(categories.entries()).slice(0, 5)) {
      ctx.fillStyle = 'rgba(200, 200, 200, 0.8)'
      ctx.fillText(`  ${category}: ${count}`, padding, y)
      y += lineHeight
    }
  }
}

// ============================================================================
// 主类
// ============================================================================

/**
 * 世界书PNG写入器
 *
 * 提供世界书和角色卡PNG生成功能
 */
export class WorldbookPngWriter {
  /**
   * 创建世界书PNG
   *
   * @param worldbook 世界书数据
   * @param options PNG选项
   * @returns PNG Blob
   */
  async createWorldbookPng(
    worldbook: Worldbook,
    options: PngWriterOptions = {}
  ): Promise<Blob> {
    const {
      width = 512,
      height = 512,
      backgroundColor = '#1a1a2e',
      includeExtensions = false,
      includeAiMetadata = false,
      compressionThreshold = 1024
    } = options

    // 准备世界书数据
    const worldbookData = this.prepareWorldbookData(worldbook, {
      includeExtensions,
      includeAiMetadata
    })

    // 转换为JSON并Base64编码
    const jsonStr = JSON.stringify(worldbookData)
    const jsonBytes = new TextEncoder().encode(jsonStr)
    const base64Data = base64Encode(jsonBytes)

    // 创建Canvas
    const { canvas, ctx } = createCanvas(width, height, backgroundColor)

    // 绘制世界书信息
    drawWorldbookInfo(ctx, worldbook, width, height)

    // 构建PNG
    return this.buildPngWithMetadata(canvas, 'chara', base64Data, compressionThreshold)
  }

  /**
   * 嵌入世界书到角色卡
   *
   * @param characterData 角色卡数据
   * @param worldbook 世界书数据
   * @param options PNG选项
   * @returns PNG Blob
   */
  async embedInCharacterCard(
    characterData: CharacterCardV1 | CharacterCardV2 | CharacterCardV3,
    worldbook: Worldbook,
    options: PngWriterOptions = {}
  ): Promise<Blob> {
    const {
      width = 512,
      height = 512,
      backgroundColor = '#1a1a2e',
      cardFormat = 'v2',
      includeExtensions = false,
      includeAiMetadata = false,
      compressionThreshold = 1024
    } = options

    // 准备世界书数据
    const worldbookData = this.prepareWorldbookData(worldbook, {
      includeExtensions,
      includeAiMetadata
    })

    // 构建角色卡数据
    let cardData: any
    let metadataKey: string

    switch (cardFormat) {
      case 'v1':
        cardData = {
          ...characterData,
          character_book: worldbookData
        }
        metadataKey = 'chara'
        break

      case 'v2':
        cardData = {
          spec: 'chara_card_v2',
          spec_version: '2.0',
          data: {
            ...(characterData as CharacterCardV2).data,
            character_book: worldbookData
          }
        }
        metadataKey = 'chara'
        break

      case 'v3':
        cardData = {
          spec: 'chara_card_v3',
          spec_version: '3.0',
          data: {
            ...(characterData as CharacterCardV3).data,
            character_book: worldbookData
          }
        }
        metadataKey = 'ccv3'
        break

      default:
        throw new Error(`不支持的角色卡格式: ${cardFormat}`)
    }

    // 转换为JSON并Base64编码
    const jsonStr = JSON.stringify(cardData)
    const jsonBytes = new TextEncoder().encode(jsonStr)
    const base64Data = base64Encode(jsonBytes)

    // 创建Canvas
    const { canvas, ctx } = createCanvas(width, height, backgroundColor)

    // 绘制角色信息
    this.drawCharacterInfo(ctx, characterData, worldbook, width, height)

    // 构建PNG
    return this.buildPngWithMetadata(canvas, metadataKey, base64Data, compressionThreshold)
  }

  /**
   * 构建带元数据的PNG
   *
   * @param canvas Canvas元素
   * @param metadataKey 元数据键
   * @param metadataValue 元数据值
   * @param compressionThreshold 压缩阈值
   * @returns PNG Blob
   */
  private async buildPngWithMetadata(
    canvas: HTMLCanvasElement,
    metadataKey: string,
    metadataValue: string,
    compressionThreshold: number
  ): Promise<Blob> {
    // 创建chunks
    const chunks: Uint8Array[] = []

    // PNG签名
    chunks.push(PNG_SIGNATURE)

    // IHDR chunk
    const ihdr = createIhdrChunk(canvas.width, canvas.height)
    chunks.push(encodeChunk(ihdr))

    // 元数据chunk (tEXt或zTXt)
    const valueBytes = new TextEncoder().encode(metadataValue)
    const metadataChunk =
      valueBytes.length > compressionThreshold
        ? await createCompressedTextChunk(metadataKey, metadataValue)
        : createTextChunk(metadataKey, metadataValue)

    chunks.push(encodeChunk(metadataChunk))

    // IDAT chunk (从canvas提取)
    const idatData = await createIdatChunk(canvas)
    const idatChunk: PngChunk = {
      type: 'IDAT',
      data: idatData
    }
    chunks.push(encodeChunk(idatChunk))

    // IEND chunk
    const iend = createIendChunk()
    chunks.push(encodeChunk(iend))

    // 合并所有chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const pngData = new Uint8Array(totalLength)
    let offset = 0

    for (const chunk of chunks) {
      pngData.set(chunk, offset)
      offset += chunk.length
    }

    // 创建Blob
    return new Blob([pngData], { type: 'image/png' })
  }

  /**
   * 准备世界书数据
   *
   * @param worldbook 世界书
   * @param options 选项
   * @returns 清理后的世界书数据
   */
  private prepareWorldbookData(
    worldbook: Worldbook,
    options: { includeExtensions?: boolean; includeAiMetadata?: boolean }
  ): any {
    const { includeExtensions = false, includeAiMetadata = false } = options

    const entries = worldbook.entries.map((entry) =>
      this.prepareEntry(entry, { includeExtensions, includeAiMetadata })
    )

    const data: any = {
      entries,
      name: worldbook.name
    }

    // 添加元数据
    if (worldbook.metadata) {
      if (worldbook.metadata.description) {
        data.description = worldbook.metadata.description
      }
      if (worldbook.metadata.scan_depth !== undefined) {
        data.scan_depth = worldbook.metadata.scan_depth
      }
      if (worldbook.metadata.token_budget !== undefined) {
        data.token_budget = worldbook.metadata.token_budget
      }
      if (worldbook.metadata.recursive_scan_depth !== undefined) {
        data.recursive_scan_depth = worldbook.metadata.recursive_scan_depth
      }
    }

    return data
  }

  /**
   * 准备单个条目
   *
   * @param entry 条目
   * @param options 选项
   * @returns 清理后的条目数据
   */
  private prepareEntry(
    entry: any,
    options: { includeExtensions?: boolean; includeAiMetadata?: boolean }
  ): any {
    const { includeExtensions = false, includeAiMetadata = false } = options

    // SillyTavern标准字段
    const prepared: any = {
      uid: entry.uid,
      key: entry.key,
      keysecondary: entry.keysecondary,
      content: entry.content,
      comment: entry.comment,
      constant: entry.constant,
      selective: entry.selective,
      order: entry.order,
      position: entry.position,
      disable: entry.disable,
      excludeRecursion: entry.excludeRecursion,
      probability: entry.probability,
      depth: entry.depth,
      useProbability: entry.useProbability,
      displayIndex: entry.displayIndex
    }

    // 移除undefined字段
    Object.keys(prepared).forEach((key) => {
      if (prepared[key] === undefined) {
        delete prepared[key]
      }
    })

    // 包含扩展字段
    if (includeExtensions && entry.novelWorkshop) {
      prepared.extensions = {
        ...entry.extensions,
        novelWorkshop: this.filterNovelWorkshopExtensions(
          entry.novelWorkshop,
          includeAiMetadata
        )
      }
    } else if (entry.extensions) {
      prepared.extensions = entry.extensions
    }

    return prepared
  }

  /**
   * 过滤AI小说工坊扩展字段
   *
   * @param extensions 扩展字段
   * @param includeAiMetadata 是否包含AI元数据
   * @returns 过滤后的扩展字段
   */
  private filterNovelWorkshopExtensions(
    extensions: any,
    includeAiMetadata: boolean
  ): any {
    const filtered: any = {}

    // 基本信息
    if (extensions.category) filtered.category = extensions.category
    if (extensions.tags) filtered.tags = extensions.tags
    if (extensions.createdAt) filtered.createdAt = extensions.createdAt
    if (extensions.updatedAt) filtered.updatedAt = extensions.updatedAt

    // 关联关系
    if (extensions.relatedCharacters) {
      filtered.relatedCharacters = extensions.relatedCharacters
    }
    if (extensions.relatedLocations) {
      filtered.relatedLocations = extensions.relatedLocations
    }

    // 适用范围
    if (extensions.chapterRange) filtered.chapterRange = extensions.chapterRange

    // 可视化数据
    if (extensions.visualData) filtered.visualData = extensions.visualData

    // AI元数据
    if (includeAiMetadata && extensions.aiGenerated) {
      filtered.aiGenerated = extensions.aiGenerated
    }

    // 统计信息
    if (includeAiMetadata && extensions.statistics) {
      filtered.statistics = extensions.statistics
    }

    return filtered
  }

  /**
   * 绘制角色信息到Canvas
   *
   * @param ctx Canvas上下文
   * @param characterData 角色数据
   * @param worldbook 世界书
   * @param width 宽度
   * @param height 高度
   */
  private drawCharacterInfo(
    ctx: CanvasRenderingContext2D,
    characterData: any,
    worldbook: Worldbook,
    width: number,
    height: number
  ): void {
    const padding = 40
    const data = characterData.data || characterData

    // 标题背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(0, 0, width, 120)

    // 角色名称
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 32px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(data.name || '角色', width / 2, 50, width - padding * 2)

    // 世界书条目数量
    ctx.font = '16px Arial, sans-serif'
    ctx.fillStyle = '#cccccc'
    ctx.fillText(`世界书: ${worldbook.entries.length} 个条目`, width / 2, 85)

    // 底部信息
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(0, height - 60, width, 60)

    ctx.fillStyle = '#ffffff'
    ctx.font = '14px Arial, sans-serif'
    ctx.fillText('AI 小说工坊 - 角色卡', width / 2, height - 30)

    // 角色描述 (如果有)
    if (data.description) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.font = '12px Arial, sans-serif'
      ctx.textAlign = 'left'

      // 截断描述到合适长度
      const maxChars = Math.floor((width - padding * 2) / 7) * 5 // 约5行
      const truncated =
        data.description.length > maxChars
          ? data.description.substring(0, maxChars) + '...'
          : data.description

      this.wrapText(ctx, truncated, padding, 160, width - padding * 2, 20)
    }
  }

  /**
   * 自动换行绘制文本
   *
   * @param ctx Canvas上下文
   * @param text 文本
   * @param x X坐标
   * @param y Y坐标
   * @param maxWidth 最大宽度
   * @param lineHeight 行高
   */
  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): void {
    const words = text.split('')
    let line = ''
    let currentY = y

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i]
      const metrics = ctx.measureText(testLine)

      if (metrics.width > maxWidth && i > 0) {
        ctx.fillText(line, x, currentY)
        line = words[i]
        currentY += lineHeight
      } else {
        line = testLine
      }
    }

    ctx.fillText(line, x, currentY)
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建世界书PNG
 *
 * @param worldbook 世界书数据
 * @param options PNG选项
 * @returns PNG Blob
 */
export async function createWorldbookPng(
  worldbook: Worldbook,
  options?: PngWriterOptions
): Promise<Blob> {
  const writer = new WorldbookPngWriter()
  return writer.createWorldbookPng(worldbook, options)
}

/**
 * 嵌入世界书到角色卡
 *
 * @param character 角色卡数据
 * @param worldbook 世界书数据
 * @param options PNG选项
 * @returns PNG Blob
 */
export async function embedWorldbookInCharacterCard(
  character: CharacterCardV1 | CharacterCardV2 | CharacterCardV3,
  worldbook: Worldbook,
  options?: PngWriterOptions
): Promise<Blob> {
  const writer = new WorldbookPngWriter()
  return writer.embedInCharacterCard(character, worldbook, options)
}

/**
 * 下载PNG文件
 *
 * @param blob PNG Blob
 * @param filename 文件名
 */
export function downloadPng(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
