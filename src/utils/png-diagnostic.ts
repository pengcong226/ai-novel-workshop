/**
 * PNG诊断工具
 * 用于分析和调试PNG文件中的元数据
 */

export interface PngDiagnosticResult {
  文件信息: {
    大小: number
    大小MB: string
  }
  PNG结构: {
    有效: boolean
    签名: string
    块数量: number
    块列表: Array<{
      类型: string
      长度: number
      偏移: number
    }>
  }
  元数据: {
    总数: number
    关键字: string[]
    详细信息: Array<{
      关键字: string
      来源: string
      长度: number
      前缀: string
    }>
  }
  角色卡数据: {
    存在: boolean
    来源?: string
    大小?: number
    错误?: string
  }
  建议: string[]
}

/**
 * 诊断PNG文件
 */
export async function diagnosePng(file: File): Promise<PngDiagnosticResult> {
  const result: PngDiagnosticResult = {
    文件信息: {
      大小: file.size,
      大小MB: (file.size / 1024 / 1024).toFixed(2)
    },
    PNG结构: {
      有效: false,
      签名: '',
      块数量: 0,
      块列表: []
    },
    元数据: {
      总数: 0,
      关键字: [],
      详细信息: []
    },
    角色卡数据: {
      存在: false
    },
    建议: []
  }

  try {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // 检查PNG签名
    const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
    let signatureValid = true
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
      if (bytes[i] !== PNG_SIGNATURE[i]) {
        signatureValid = false
        break
      }
    }

    result.PNG结构.有效 = signatureValid
    result.PNG结构.签名 = signatureValid ? '89 50 4E 47 0D 0A 1A 0A (正确)' : '无效'

    if (!signatureValid) {
      result.建议.push('这不是有效的PNG文件')
      return result
    }

    // 解析PNG块
    let offset = 8 // 跳过签名
    const chunks: Array<{ 类型: string; 长度: number; 偏移: number }> = []
    const metadata: Record<string, { 来源: string; 长度: number; 值: string }> = {}

    while (offset + 12 <= bytes.length) {
      const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
      const dataStart = offset + 8
      const dataEnd = dataStart + length

      chunks.push({
        类型: type,
        长度: length,
        偏移: offset
      })

      // 解析文本块
      if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
        try {
          const chunkData = bytes.slice(dataStart, dataEnd)
          const parsed = await parseTextChunk(type, chunkData)

          if (parsed) {
            metadata[parsed.keyword] = {
              来源: type,
              长度: parsed.value.length,
              值: parsed.value.substring(0, 100) // 只存储前100个字符用于显示
            }
          }
        } catch (error) {
          console.warn(`解析${type}块失败`, error)
        }
      }

      if (type === 'IEND') {
        break
      }

      offset = dataEnd + 4 // data + CRC
    }

    result.PNG结构.块数量 = chunks.length
    result.PNG结构.块列表 = chunks.slice(0, 20) // 只显示前20个块

    // 元数据分析
    result.元数据.总数 = Object.keys(metadata).length
    result.元数据.关键字 = Object.keys(metadata)
    result.元数据.详细信息 = Object.entries(metadata).map(([keyword, info]) => ({
      关键字: keyword,
      来源: info.来源,
      长度: info.长度,
      前缀: info.值.substring(0, 50)
    }))

    // 检查角色卡数据
    if (metadata.ccv3) {
      result.角色卡数据.存在 = true
      result.角色卡数据.来源 = 'ccv3'
      result.角色卡数据.大小 = metadata.ccv3.长度
      result.建议.push('✅ 发现ccv3格式的角色卡数据')
    } else if (metadata.chara) {
      result.角色卡数据.存在 = true
      result.角色卡数据.来源 = 'chara'
      result.角色卡数据.大小 = metadata.chara.长度
      result.建议.push('✅ 发现chara格式的角色卡数据')
    } else {
      result.角色卡数据.存在 = false
      result.角色卡数据.错误 = '未找到chara或ccv3元数据'

      if (result.元数据.总数 === 0) {
        result.建议.push('❌ PNG文件不包含任何文本元数据')
        result.建议.push('可能原因：')
        result.建议.push('  1. 这是普通PNG图片，不是角色卡')
        result.建议.push('  2. 角色卡数据嵌入在其他位置')
        result.建议.push('  3. 角色卡使用了非标准格式')
      } else {
        result.建议.push('❌ PNG包含元数据但不是角色卡')
        result.建议.push(`找到的元数据：${result.元数据.关键字.join(', ')}`)
        result.建议.push('可能原因：')
        result.建议.push('  1. 这是SillyTavern的世界书PNG（不是角色卡）')
        result.建议.push('  2. 角色卡使用了其他关键字存储')
        result.建议.push('  3. 数据格式不标准')
      }
    }

  } catch (error) {
    result.角色卡数据.错误 = error instanceof Error ? error.message : String(error)
    result.建议.push(`解析错误：${result.角色卡数据.错误}`)
  }

  return result
}

/**
 * 解析文本块（简化版）
 */
async function parseTextChunk(
  type: string,
  data: Uint8Array
): Promise<{ keyword: string; value: string } | null> {
  try {
    if (type === 'tEXt') {
      const sep = data.indexOf(0)
      if (sep < 0) return null

      const keywordBytes = data.slice(0, sep)
      const valueBytes = data.slice(sep + 1)

      return {
        keyword: new TextDecoder('latin1').decode(keywordBytes),
        value: new TextDecoder('latin1').decode(valueBytes)
      }
    }

    if (type === 'zTXt') {
      const sep = data.indexOf(0)
      if (sep < 0 || sep + 2 > data.length) return null

      const keywordBytes = data.slice(0, sep)
      const keyword = new TextDecoder('latin1').decode(keywordBytes)

      const compressionMethod = data[sep + 1]
      if (compressionMethod !== 0) return null

      const compressed = data.slice(sep + 2)

      // 解压
      try {
        const ds = new DecompressionStream('deflate')
        const writer = ds.writable.getWriter()
        await writer.write(compressed)
        await writer.close()

        const reader = ds.readable.getReader()
        const chunks: Uint8Array[] = []
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
        }

        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
        const decompressed = new Uint8Array(totalLength)
        let pos = 0
        for (const chunk of chunks) {
          decompressed.set(chunk, pos)
          pos += chunk.length
        }

        return {
          keyword,
          value: new TextDecoder().decode(decompressed)
        }
      } catch {
        return null
      }
    }

    if (type === 'iTXt') {
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

      if (compressionFlag === 1) {
        if (compressionMethod !== 0) return null

        try {
          const ds = new DecompressionStream('deflate')
          const writer = ds.writable.getWriter()
          await writer.write(textBytes)
          await writer.close()

          const reader = ds.readable.getReader()
          const chunks: Uint8Array[] = []
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
          }

          const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
          const decompressed = new Uint8Array(totalLength)
          let pos = 0
          for (const chunk of chunks) {
            decompressed.set(chunk, pos)
            pos += chunk.length
          }

          return {
            keyword,
            value: new TextDecoder('utf-8').decode(decompressed)
          }
        } catch {
          return null
        }
      } else {
        return {
          keyword,
          value: new TextDecoder('utf-8').decode(textBytes)
        }
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * 格式化诊断结果为可读文本
 */
export function formatDiagnosticResult(result: PngDiagnosticResult): string {
  const lines: string[] = []

  lines.push('=== PNG文件诊断报告 ===\n')

  lines.push('【文件信息】')
  lines.push(`  大小: ${result.文件信息.大小MB} MB (${result.文件信息.大小} 字节)`)
  lines.push('')

  lines.push('【PNG结构】')
  lines.push(`  有效: ${result.PNG结构.有效 ? '✅' : '❌'}`)
  lines.push(`  签名: ${result.PNG结构.签名}`)
  lines.push(`  块数量: ${result.PNG结构.块数量}`)

  if (result.PNG结构.块列表.length > 0) {
    lines.push('  块列表:')
    result.PNG结构.块列表.forEach(chunk => {
      lines.push(`    - ${chunk.类型} (${chunk.长度} 字节, 偏移 ${chunk.偏移})`)
    })
  }
  lines.push('')

  lines.push('【元数据】')
  lines.push(`  总数: ${result.元数据.总数}`)
  if (result.元数据.关键字.length > 0) {
    lines.push(`  关键字: ${result.元数据.关键字.join(', ')}`)
    lines.push('  详细信息:')
    result.元数据.详细信息.forEach(info => {
      lines.push(`    - ${info.关键字}:`)
      lines.push(`        来源: ${info.来源}`)
      lines.push(`        长度: ${info.长度} 字符`)
      lines.push(`        前缀: ${info.前缀}...`)
    })
  }
  lines.push('')

  lines.push('【角色卡数据】')
  if (result.角色卡数据.存在) {
    lines.push(`  ✅ 找到角色卡数据`)
    lines.push(`  来源: ${result.角色卡数据.来源}`)
    lines.push(`  大小: ${result.角色卡数据.大小} 字符`)
  } else {
    lines.push(`  ❌ 未找到角色卡数据`)
    if (result.角色卡数据.错误) {
      lines.push(`  错误: ${result.角色卡数据.错误}`)
    }
  }
  lines.push('')

  lines.push('【建议】')
  result.建议.forEach(suggestion => {
    lines.push(`  ${suggestion}`)
  })

  return lines.join('\n')
}
