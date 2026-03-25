/**
 * 文本清洗处理器示例插件
 *
 * 演示如何创建数据处理器插件
 */

import type { ProcessorContribution, ProcessorContext, PluginManifest } from '../types'

/**
 * 文本清洗处理器
 *
 * 在导入前清洗文本，移除多余空格、特殊字符等
 */
const textCleanerProcessor: ProcessorContribution = {
  id: 'text-cleaner',
  name: '文本清洗处理器',
  type: 'processor',

  // 处理阶段：导入前
  stage: 'pre-import',

  /**
   * 处理方法
   *
   * @param data 输入数据（文本）
   * @param context 处理上下文
   * @returns 清洗后的文本
   */
  async process(data: any, context: ProcessorContext): Promise<any> {
    console.log('文本清洗处理器: 开始处理')

    if (typeof data !== 'string') {
      console.warn('文本清洗处理器: 输入数据不是字符串，跳过处理')
      return data
    }

    let cleanedText = data

    // 1. 移除BOM标记
    cleanedText = cleanedText.replace(/^\uFEFF/, '')

    // 2. 统一换行符
    cleanedText = cleanedText.replace(/\r\n/g, '\n')
    cleanedText = cleanedText.replace(/\r/g, '\n')

    // 3. 移除行尾空格
    cleanedText = cleanedText.replace(/[ \t]+\n/g, '\n')

    // 4. 压缩多个连续空行为两个空行
    cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n')

    // 5. 移除特殊字符（保留中文标点）
    cleanedText = cleanedText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

    // 6. 统一全角/半角标点（可选，根据配置）
    if (context.config?.normalizePunctuation) {
      // 半角转全角
      cleanedText = cleanedText.replace(/,/g, '，')
      cleanedText = cleanedText.replace(/\./g, '。')
      cleanedText = cleanedText.replace(/!/g, '！')
      cleanedText = cleanedText.replace(/\?/g, '？')
      cleanedText = cleanedText.replace(/:/g, '：')
      cleanedText = cleanedText.replace(/;/g, '；')
      cleanedText = cleanedText.replace(/\(/g, '（')
      cleanedText = cleanedText.replace(/\)/g, '）')
    }

    // 7. 移除多余的空格（保留必要的空格）
    cleanedText = cleanedText.replace(/ {2,}/g, ' ')

    // 8. 修正引号配对
    cleanedText = fixQuotePairing(cleanedText)

    console.log(`文本清洗处理器: 处理完成，原长度: ${data.length}，新长度: ${cleanedText.length}`)

    return cleanedText
  }
}

/**
 * 修正引号配对
 */
function fixQuotePairing(text: string): string {
  // 修正双引号配对
  let inQuote = false
  let result = ''
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      result += inQuote ? '"' : '"'
      inQuote = !inQuote
    } else {
      result += char
    }
  }

  // 修正单引号配对
  inQuote = false
  text = result
  result = ''
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === "'") {
      result += inQuote ? "’" : "‘"
      inQuote = !inQuote
    } else {
      result += char
    }
  }

  return result
}

/**
 * 风格转换处理器
 *
 * 在生成后转换文本风格
 */
const styleConverterProcessor: ProcessorContribution = {
  id: 'style-converter',
  name: '风格转换处理器',
  type: 'processor',

  // 处理阶段：生成后
  stage: 'post-generation',

  /**
   * 处理方法
   */
  async process(data: any, context: ProcessorContext): Promise<any> {
    console.log('风格转换处理器: 开始处理')

    if (!data || typeof data !== 'object') {
      return data
    }

    // 获取章节内容
    const chapter = data.chapter
    if (!chapter || !chapter.content) {
      return data
    }

    let content = chapter.content

    // 根据配置转换风格
    const targetStyle = context.config?.style || 'normal'

    switch (targetStyle) {
      case 'classical':
        // 转换为古风风格
        content = convertToClassicalStyle(content)
        break
      case 'modern':
        // 转换为现代风格
        content = convertToModernStyle(content)
        break
      case 'simplified':
        // 简化文本
        content = simplifyText(content)
        break
      default:
        // 保持原样
        break
    }

    return {
      ...data,
      chapter: {
        ...chapter,
        content
      }
    }
  }
}

/**
 * 转换为古风风格（示例）
 */
function convertToClassicalStyle(text: string): string {
  // 简单示例：替换一些常见词汇
  return text
    .replace(/非常/g, '甚')
    .replace(/很/g, '颇')
    .replace(/但是/g, '然')
    .replace(/因为/g, '因')
    .replace(/所以/g, '故')
    .replace(/如果/g, '若')
    .replace(/虽然/g, '虽')
    .replace(/但是/g, '然')
}

/**
 * 转换为现代风格（示例）
 */
function convertToModernStyle(text: string): string {
  // 反向转换
  return text
    .replace(/甚/g, '非常')
    .replace(/颇/g, '很')
    .replace(/然/g, '但是')
    .replace(/因/g, '因为')
    .replace(/故/g, '所以')
    .replace(/若/g, '如果')
    .replace(/虽/g, '虽然')
}

/**
 * 简化文本（示例）
 */
function simplifyText(text: string): string {
  // 移除形容词和副词
  return text
    .replace(/非常/g, '')
    .replace(/特别/g, '')
    .replace(/十分/g, '')
    .replace(/极其/g, '')
}

/**
 * 插件清单
 */
export const manifest: PluginManifest = {
  id: 'text-processor-plugin',
  name: '文本处理器',
  version: '1.0.0',
  author: 'AI Novel Workshop',
  description: '提供文本清洗和风格转换功能',

  permissions: [],

  contributes: {
    processors: [textCleanerProcessor, styleConverterProcessor]
  },

  // 插件配置Schema
  configuration: {
    normalizePunctuation: {
      type: 'boolean',
      default: false,
      description: '统一标点符号格式'
    },
    style: {
      type: 'string',
      default: 'normal',
      description: '目标风格 (normal | classical | modern | simplified)'
    }
  }
}

/**
 * 插件激活钩子
 */
export async function activate(context: any) {
  console.log('文本处理器插件已激活')

  // 注册处理器
  context.register.processor(textCleanerProcessor)
  context.register.processor(styleConverterProcessor)

  // 显示激活消息
  context.ui.showMessage('文本处理器已启用', 'success')
}

/**
 * 插件停用钩子
 */
export async function deactivate() {
  console.log('文本处理器插件已停用')
}

/**
 * 插件卸载钩子
 */
export async function uninstall() {
  console.log('文本处理器插件已卸载')
}
