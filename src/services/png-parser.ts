/**
 * PNG解析器 - 参考tavern-parser的健壮实现
 * @module services/png-parser
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('png-parser')

// 安全限制常量
const MAX_COMPRESSED_TEXT_BYTES = 1024 * 1024      // 1MB
const MAX_DECOMPRESSED_TEXT_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_TEXT_VALUE_BYTES = 5 * 1024 * 1024        // 5MB
const MAX_TOTAL_TEXT_BYTES = 10 * 1024 * 1024       // 10MB
const MAX_CARD_JSON_BYTES = 5 * 1024 * 1024         // 5MB
const MAX_CARD_BASE64_CHARS = Math.ceil((MAX_CARD_JSON_BYTES * 4) / 3)

// PNG签名
const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]

// PNG块优先级
const CHUNK_PRIORITY = {
  'tEXt': 1,
  'zTXt': 2,
  'iTXt': 3
}

/**
 * PNG解析结果
 */
export interface PngParseResult {
  kind: 'character' | 'worldbook' | 'unknown'
  format: string
  data?: any
  raw: any
}

/**
 * PNG元数据
 */
export interface PngMetadata {
  [keyword: string]: string
}

/**
 * 从PNG提取角色卡数据
 */
export async function parsePngCard(input: ArrayBuffer): Promise<PngParseResult> {
  const buffer = new Uint8Array(input)

  // 1. 验证PNG签名
  validatePngSignature(buffer)

  // 2. 提取文本元数据
  const metadata = await extractPngMetadata(buffer)

  // 调试：输出找到的元数据关键字
  const keywords = Object.keys(metadata)
  logger.info('PNG元数据关键字', {
    count: keywords.length,
    keywords: keywords.join(', ')
  })

  // 3. 提取角色卡数据
  const payload = extractCardPayload(metadata)

  // 4. 规范化数据
  return normalizeCard(payload.raw, payload.sourceKey)
}

/**
 * 验证PNG签名
 */
function validatePngSignature(buffer: Uint8Array): void {
  if (buffer.length < 8) {
    throw new Error('PNG文件过小')
  }

  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (buffer[i] !== PNG_SIGNATURE[i]) {
      throw new Error('不是有效的PNG文件（签名不匹配）')
    }
  }
}

/**
 * 从PNG提取文本元数据
 */
async function extractPngMetadata(buffer: Uint8Array): Promise<PngMetadata> {
  const metadata: PngMetadata = {}
  const sourcePriority: Record<string, number> = {}
  let totalTextBytes = 0

  let offset = 8 // 跳过PNG签名

  while (offset + 12 <= buffer.length) {
    // 读取块长度（大端序）
    const length = (buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3]
    const type = String.fromCharCode(buffer[offset + 4], buffer[offset + 5], buffer[offset + 6], buffer[offset + 7])
    const dataStart = offset + 8
    const dataEnd = dataStart + length

    // 检查块是否完整
    if (dataEnd + 4 > buffer.length) {
      throw new Error('PNG块不完整或已损坏')
    }

    // IEND块表示结束
    if (type === 'IEND') {
      break
    }

    // 处理文本块
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const chunkData = buffer.slice(dataStart, dataEnd)
      const parsed = await decodeTextChunk(type, chunkData)

      if (parsed && parsed.keyword) {
        const rank = CHUNK_PRIORITY[type as keyof typeof CHUNK_PRIORITY] || 0
        const currentRank = sourcePriority[parsed.keyword] || 0

        // 优先级更高的块覆盖之前的
        if (rank > currentRank) {
          // 检查文本大小
          const valueBytes = new TextEncoder().encode(parsed.value)
          if (valueBytes.length > MAX_TEXT_VALUE_BYTES) {
            throw new Error(`${type} 文本值过大 (${valueBytes.length} 字节)`)
          }

          // 更新budget
          const previousValue = metadata[parsed.keyword]
          if (typeof previousValue === 'string') {
            totalTextBytes -= new TextEncoder().encode(previousValue).length
          }

          totalTextBytes += valueBytes.length
          if (totalTextBytes > MAX_TOTAL_TEXT_BYTES) {
            throw new Error(`PNG元数据总大小超过限制 (${totalTextBytes} 字节)`)
          }

          metadata[parsed.keyword] = parsed.value
          sourcePriority[parsed.keyword] = rank
        }
      }
    }

    // 移动到下一个块
    offset = dataEnd + 4 // data + CRC
  }

  return metadata
}

/**
 * 从PNG提取文本元数据（带大小限制）
 */
export async function extractPngTextMetadata(input: ArrayBuffer): Promise<PngMetadata> {
  const buffer = Buffer.isBuffer(input) ? new Uint8Array(input) : new Uint8Array(input)
  return extractPngMetadata(buffer)
}

/**
 * 解码PNG文本块
 */
async function decodeTextChunk(
  type: string,
  data: Uint8Array
): Promise<{ keyword: string; value: string } | null> {
  try {
    logger.debug(`开始解码${type}块`, {
      数据长度: data.length,
      前16字节: Array.from(data.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    })

    let result: { keyword: string; value: string } | null = null

    if (type === 'tEXt') {
      result = decodeTextChunk_tEXt(data)
    } else if (type === 'zTXt') {
      result = await decodeTextChunk_zTXt(data)
    } else if (type === 'iTXt') {
      result = await decodeTextChunk_iTXt(data)
    }

    if (result && (result.keyword === 'chara' || result.keyword === 'ccv3')) {
      // 检测base64解码后的内容编码
      try {
        const decoded = atob(result.value)
        const firstChars = decoded.substring(0, 100)
        const hasChinese = /[\u4e00-\u9fa5]/.test(firstChars)

        logger.info(`${type}块解码结果诊断`, {
          关键字: result.keyword,
          base64长度: result.value.length,
          解码后长度: decoded.length,
          前100字符: firstChars,
          包含中文: hasChinese,
          编码检测: {
            第一个字符: decoded.charAt(0),
            Unicode码点: decoded.charCodeAt(0)?.toString(16),
            前10个字节: decoded.substring(0, 10)
              .split('')
              .map(c => `${c}(U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`)
              .join(' ')
          }
        })
      } catch (e) {
        logger.warn('base64解码失败', e)
      }
    }

    return result
  } catch (error) {
    logger.warn(`解码${type}块失败`, error)
    return null
  }
}

/**
 * 解码tEXt块（未压缩）
 */
function decodeTextChunk_tEXt(data: Uint8Array): { keyword: string; value: string } | null {
  const sep = data.indexOf(0)
  if (sep < 0) return null

  const keywordBytes = data.slice(0, sep)
  const valueBytes = data.slice(sep + 1)

  return {
    keyword: new TextDecoder('latin1').decode(keywordBytes),
    value: new TextDecoder('latin1').decode(valueBytes)
  }
}

/**
 * 解码zTXt块（压缩）
 */
async function decodeTextChunk_zTXt(data: Uint8Array): Promise<{ keyword: string; value: string } | null> {
  const sep = data.indexOf(0)
  if (sep < 0 || sep + 2 > data.length) {
    logger.warn('zTXt块格式错误: 找不到分隔符或数据不完整')
    return null
  }

  const keywordBytes = data.slice(0, sep)
  const keyword = new TextDecoder('latin1').decode(keywordBytes)
  logger.debug(`zTXt块关键字: ${keyword}`)

  const compressionMethod = data[sep + 1]
  if (compressionMethod !== 0) {
    logger.warn('不支持的压缩方法', { compressionMethod })
    return null
  }

  const compressed = data.slice(sep + 2)
  logger.debug(`zTXt压缩数据`, {
    压缩数据长度: compressed.length,
    前16字节: Array.from(compressed.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')
  })

  if (compressed.length > MAX_COMPRESSED_TEXT_BYTES) {
    throw new Error(`压缩数据过大 (${compressed.length} 字节)`)
  }

  const value = await decompressZlib(compressed, MAX_DECOMPRESSED_TEXT_BYTES)
  logger.debug(`zTXt解压成功`, {
    关键字: keyword,
    解压后长度: value.length,
    前100字符: value.substring(0, 100)
  })

  return { keyword, value }
}

/**
 * 解码iTXt块（国际文本，可选压缩）
 */
async function decodeTextChunk_iTXt(data: Uint8Array): Promise<{ keyword: string; value: string } | null> {
  const keySep = data.indexOf(0)
  if (keySep < 0 || keySep + 3 > data.length) return null

  const keywordBytes = data.slice(0, keySep)
  const keyword = new TextDecoder('utf-8').decode(keywordBytes)

  const compressionFlag = data[keySep + 1]
  const compressionMethod = data[keySep + 2]

  let cursor = keySep + 3

  // 跳过语言标签
  const langSep = data.indexOf(0, cursor)
  if (langSep < 0) return null
  cursor = langSep + 1

  // 跳过翻译的关键字
  const translatedSep = data.indexOf(0, cursor)
  if (translatedSep < 0) return null
  cursor = translatedSep + 1

  const textBytes = data.slice(cursor)

  let value: string

  if (compressionFlag === 1) {
    // 压缩的iTXt
    if (compressionMethod !== 0) {
      logger.warn('不支持的压缩方法', { compressionMethod })
      return null
    }

    if (textBytes.length > MAX_COMPRESSED_TEXT_BYTES) {
      throw new Error(`压缩数据过大 (${textBytes.length} 字节)`)
    }

    value = await decompressZlib(textBytes, MAX_DECOMPRESSED_TEXT_BYTES)
  } else {
    // 未压缩的iTXt
    value = new TextDecoder('utf-8').decode(textBytes)
  }

  return { keyword, value }
}

/**
 * 使用DecompressionStream解压数据（浏览器环境）
 * DecompressionStream('deflate')支持zlib格式 (带头部和校验和)
 */
async function decompressZlib(compressed: Uint8Array, maxSize: number): Promise<string> {
  try {
    logger.debug('开始解压zlib数据', {
      输入长度: compressed.length,
      前16字节: Array.from(compressed.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    })

    const ds = new DecompressionStream('deflate')
    const writer = ds.writable.getWriter()

    await writer.write(compressed)
    await writer.close()

    const reader = ds.readable.getReader()
    const chunks: Uint8Array[] = []
    let totalSize = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      totalSize += value.length
      if (totalSize > maxSize) {
        throw new Error(`解压数据过大 (${totalSize} 字节)`)
      }

      chunks.push(value)
    }

    const decompressed = new Uint8Array(totalSize)
    let pos = 0
    for (const chunk of chunks) {
      decompressed.set(chunk, pos)
      pos += chunk.length
    }

    logger.debug('解压成功', {
      输出长度: totalSize,
      前100字节: Array.from(decompressed.slice(0, 100)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    })

    return new TextDecoder().decode(decompressed)
  } catch (error) {
    logger.error('解压失败', error)
    throw new Error(`解压失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 提取角色卡数据
 */
function extractCardPayload(metadata: PngMetadata): { raw: any; sourceKey: string } {
  // 调试：输出找到的所有关键字
  const keywords = Object.keys(metadata)
  logger.info('PNG元数据分析', {
    总关键字数: keywords.length,
    关键字列表: keywords,
    是否包含ccv3: !!metadata.ccv3,
    是否包含chara: !!metadata.chara,
    ccv3长度: metadata.ccv3?.length,
    chara长度: metadata.chara?.length
  })

  // 优先检查ccv3
  if (metadata.ccv3) {
    logger.info('发现ccv3元数据，正在解析...')
    if (metadata.ccv3.length > MAX_CARD_BASE64_CHARS) {
      throw new Error(`角色卡数据过大 (${metadata.ccv3.length} 字符，最大 ${MAX_CARD_BASE64_CHARS} 字符)`)
    }

    const raw = decodeBase64Json(metadata.ccv3)
    logger.info('ccv3元数据解析成功', {
      类型: typeof raw,
      是否有spec: !!raw?.spec,
      是否有name: !!raw?.name,
      是否有data: !!raw?.data,
      角色名: raw?.data?.name,
      是否有character_book: !!raw?.data?.character_book,
      character_book条目数: raw?.data?.character_book?.entries?.length,
      JSON字符串长度: JSON.stringify(raw).length,
      前500字符: JSON.stringify(raw).substring(0, 500)
    })

    // 如果有世界书，输出前3个条目的详细信息
    if (raw?.data?.character_book?.entries) {
      logger.info('ccv3世界书前3个条目', {
        条目数: raw.data.character_book.entries.length,
        前3个: raw.data.character_book.entries.slice(0, 3).map((e: any, i: number) => ({
          index: i,
          uid: e.uid,
          id: e.id,
          keys长度: (e.keys || e.key || []).length,
          content长度: e.content?.length,
          content前100字符: e.content?.substring(0, 100),
          包含中文: /[\u4e00-\u9fa5]/.test(e.content || '')
        }))
      })
    }

    return { raw, sourceKey: 'ccv3' }
  }

  // 然后检查chara
  if (metadata.chara) {
    logger.info('发现chara元数据，正在解析...')
    if (metadata.chara.length > MAX_CARD_BASE64_CHARS) {
      throw new Error(`角色卡数据过大 (${metadata.chara.length} 字符，最大 ${MAX_CARD_BASE64_CHARS} 字符)`)
    }

    const raw = decodeBase64Json(metadata.chara)
    logger.info('chara元数据解析成功', {
      类型: typeof raw,
      是否有name: !!raw?.name,
      是否有entries: !!raw?.entries,
      角色名: raw?.name,
      是否有character_book: !!raw?.character_book,
      character_book条目数: raw?.character_book?.entries?.length
    })

    // 如果有世界书，输出前3个条目的详细信息
    if (raw?.character_book?.entries) {
      logger.info('chara世界书前3个条目', {
        条目数: raw.character_book.entries.length,
        前3个: raw.character_book.entries.slice(0, 3).map((e: any, i: number) => ({
          index: i,
          uid: e.uid,
          id: e.id,
          keys长度: (e.keys || e.key || []).length,
          content长度: e.content?.length,
          content前100字符: e.content?.substring(0, 100),
          包含中文: /[\u4e00-\u9fa5]/.test(e.content || '')
        }))
      })
    }

    return { raw, sourceKey: 'chara' }
  }

  // 没有找到角色卡数据
  const errorMsg = keywords.length === 0
    ? 'PNG文件不包含任何文本元数据。这可能是：\n1. 普通PNG图片（非角色卡）\n2. 角色卡数据损坏\n3. 角色卡使用了非标准的嵌入方式'
    : `PNG文件不包含角色卡数据。找到的关键字：${keywords.join(', ')}。\n期望的关键字：chara 或 ccv3`

  logger.error('角色卡数据提取失败', {
    找到的关键字: keywords,
    元数据示例: keywords.slice(0, 3).map(k => ({
      关键字: k,
      值长度: metadata[k]?.length
    }))
  })

  throw new Error(errorMsg)
}

/**
 * 严格的Base64解码和JSON解析
 */
function decodeBase64Json(base64Value: string): any {
  try {
    // 规范化base64
    const normalized = base64Value.replace(/\s+/g, '')

    // 验证base64格式
    if (normalized.length === 0 || normalized.length % 4 !== 0) {
      throw new Error('无效的Base64编码（长度必须是4的倍数）')
    }

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
      throw new Error('无效的Base64编码（包含非法字符）')
    }

    // 解码base64为二进制
    const binaryString = atob(normalized)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    if (bytes.length > MAX_CARD_JSON_BYTES) {
      throw new Error(`JSON数据过大 (${bytes.length} 字节)`)
    }

    // 验证base64编码是否正确（防止填充攻击）
    const reencoded = btoa(binaryString)
    const stripPadding = (text: string) => text.replace(/=+$/g, '')
    if (stripPadding(reencoded) !== stripPadding(normalized)) {
      throw new Error('Base64编码无效（填充错误）')
    }

    // 使用UTF-8解码字节数组为字符串
    const decoder = new TextDecoder('utf-8')
    const jsonString = decoder.decode(bytes)

    // 解析JSON
    return JSON.parse(jsonString)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('无效的JSON格式')
    }
    throw error
  }
}

/**
 * 规范化角色卡数据
 */
function normalizeCard(raw: any, sourceKey: string): PngParseResult {
  // ccv3格式或V2/V3格式
  if (sourceKey === 'ccv3' || (raw?.spec && raw?.spec_version)) {
    return {
      kind: 'character',
      format: raw.spec || 'ccv3',
      data: raw?.data ?? {},
      raw
    }
  }

  // 世界书格式
  if (Array.isArray(raw?.entries)) {
    return {
      kind: 'worldbook',
      format: 'worldbook',
      data: raw,
      raw
    }
  }

  // V1格式角色卡
  if (raw?.name || raw?.description || raw?.personality || raw?.scenario) {
    const isTavernAI = Boolean(
      raw?.system_prompt || raw?.post_history_instructions || raw?.character_book
    )

    return {
      kind: 'character',
      format: isTavernAI ? 'tavernai' : 'sillytavern',
      data: raw,
      raw
    }
  }

  return {
    kind: 'unknown',
    format: 'unknown',
    data: raw,
    raw
  }
}
