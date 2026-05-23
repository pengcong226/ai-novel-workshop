/**
 * JSON验证器
 * 验证LLM输出的JSON格式
 */

import Ajv from 'ajv'
import type { AnySchema } from 'ajv'

export interface ValidationResult {
  valid: boolean
  data?: any
  error?: string
}

/**
 * 验证LLM输出的JSON
 * @param response LLM返回的原始文本
 * @param schema JSON Schema
 * @returns 验证结果
 */
export interface ValidationOptions {
  /** 仅在最后兜底时启用暴力闭合修复，默认关闭 */
  allowAggressiveRepair?: boolean
}

export function validateLLMOutput(
  response: string,
  schema: AnySchema,
  options: ValidationOptions = {}
): ValidationResult {
  try {
    // 清理响应文本
    let cleaned = response.trim()

    // 移除markdown代码块标记
    cleaned = cleaned.replace(/```json\s*/gi, '')
    cleaned = cleaned.replace(/```\s*/g, '')
    cleaned = cleaned.trim()

    // 尝试多种JSON提取策略
    let data: any = null
    let extractionError: string | null = null

    // 根据schema类型决定提取顺序
    const schemaType = typeof schema === 'object' ? (schema as any).type : undefined;
    const expectsArray = schemaType === 'array'
    const expectsObject = schemaType === 'object'

    // 策略1: 直接解析整个响应
    try {
      data = JSON.parse(cleaned)
    } catch {
      // 默认不做暴力闭合，优先走“提取失败 -> 上层重试”策略
      if (options.allowAggressiveRepair) {
        try {
          let fixed = cleaned
          if (fixed.trim().endsWith(',')) fixed = fixed.trim().slice(0, -1)

          const openBraces = (fixed.match(/\{/g) || []).length
          const closeBraces = (fixed.match(/\}/g) || []).length
          const openBrackets = (fixed.match(/\[/g) || []).length
          const closeBrackets = (fixed.match(/\]/g) || []).length

          let suffix = ''
          if (openBraces > closeBraces) suffix += '}'.repeat(openBraces - closeBraces)
          if (openBrackets > closeBrackets) suffix += ']'.repeat(openBrackets - closeBrackets)

          if (suffix) {
            data = JSON.parse(fixed + suffix)
          }
        } catch {
          // 忽略兜底修复错误，继续进入提取策略
        }
      }

      if (data === null) {
        // 策略2: 如果期望数组，优先提取数组
        if (expectsArray) {
          const arrayResult = extractFirstJSONArray(cleaned)
          if (arrayResult.valid) {
            data = arrayResult.data
          } else {
            extractionError = arrayResult.error || '提取数组失败'
          }
        }
        // 如果期望对象，优先提取对象
        else if (expectsObject) {
          const objectResult = extractFirstJSONObject(cleaned)
          if (objectResult.valid) {
            data = objectResult.data
          } else {
            extractionError = objectResult.error || '提取对象失败'
          }
        }
        // 如果schema没有指定类型，尝试两种
        else {
          const arrayResult = extractFirstJSONArray(cleaned)
          if (arrayResult.valid) {
            data = arrayResult.data
          } else {
            const objectResult = extractFirstJSONObject(cleaned)
            if (objectResult.valid) {
              data = objectResult.data
            } else {
              extractionError = objectResult.error || arrayResult.error || '提取失败'
            }
          }
        }
      }
    }

    if (data === null) {
      return {
        valid: false,
        error: extractionError || "未找到有效的JSON数据。请确保返回JSON格式的数组或对象。"
      }
    }

    // 检查类型是否匹配
    if (expectsArray && !Array.isArray(data)) {
      return {
        valid: false,
        error: `数据类型错误：期望数组，但得到${typeof data}。请返回JSON数组格式 [...]`,
        data
      }
    }

    if (expectsObject && (typeof data !== 'object' || Array.isArray(data))) {
      return {
        valid: false,
        error: `数据类型错误：期望对象，但得到${Array.isArray(data) ? '数组' : typeof data}。请返回JSON对象格式 {...}`,
        data
      }
    }

    // 使用Ajv验证schema
    const ajv = new Ajv({
      allErrors: true,
      verbose: true
    })

    const validate = ajv.compile(schema)
    const valid = validate(data)

    if (valid) {
      return { valid: true, data }
    } else {
      const errors = ajv.errorsText(validate.errors)
      return {
        valid: false,
        error: `JSON验证失败: ${errors}`,
        data  // 也返回数据，方便调试
      }
    }
  } catch (error) {
    return {
      valid: false,
      error: `验证过程出错: ${error instanceof Error ? error.message : '未知错误'}`
    }
  }
}

/**
 * 提取第一个完整的JSON对象（非贪婪）
 */
function extractFirstJSONObject(text: string): ValidationResult {
  // 找到第一个 { 和最后一个匹配的 }
  const start = text.indexOf('{')
  if (start === -1) {
    return { valid: false, error: "未找到JSON对象" }
  }

  // 使用括号匹配来找到完整的JSON对象
  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const char = text[i]

    if (escape) {
      escape = false
      continue
    }

    if (char === '\\') {
      escape = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{') depth++
      if (char === '}') {
        depth--
        if (depth === 0) {
          // 找到匹配的闭合括号
          try {
            const jsonStr = text.slice(start, i + 1)
            const data = JSON.parse(jsonStr)
            return { valid: true, data }
          } catch (error) {
            return {
              valid: false,
              error: `JSON解析失败: ${error instanceof Error ? error.message : '未知错误'}`
            }
          }
        }
      }
    }
  }

  return { valid: false, error: "未找到完整的JSON对象" }
}

/**
 * 提取第一个完整的JSON数组（非贪婪）
 */
function extractFirstJSONArray(text: string): ValidationResult {
  // 找到第一个 [ 和最后一个匹配的 ]
  const start = text.indexOf('[')
  if (start === -1) {
    return { valid: false, error: "未找到JSON数组" }
  }

  // 使用括号匹配来找到完整的JSON数组
  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const char = text[i]

    if (escape) {
      escape = false
      continue
    }

    if (char === '\\') {
      escape = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '[') depth++
      if (char === ']') {
        depth--
        if (depth === 0) {
          // 找到匹配的闭合括号
          try {
            const jsonStr = text.slice(start, i + 1)
            const data = JSON.parse(jsonStr)
            return { valid: true, data }
          } catch (error) {
            return {
              valid: false,
              error: `JSON解析失败: ${error instanceof Error ? error.message : '未知错误'}`
            }
          }
        }
      }
    }
  }

  return { valid: false, error: "未找到完整的JSON数组" }
}

/**
 * 提取并验证JSON数组
 */
export function extractJSONArray(response: string): ValidationResult {
  // 清理响应
  let cleaned = response.trim()
  cleaned = cleaned.replace(/```json\s*/gi, '')
  cleaned = cleaned.replace(/```\s*/g, '')
  cleaned = cleaned.trim()

  return extractFirstJSONArray(cleaned)
}

/**
 * 提取并验证JSON对象
 */
export function extractJSONObject(response: string): ValidationResult {
  // 清理响应
  let cleaned = response.trim()
  cleaned = cleaned.replace(/```json\s*/gi, '')
  cleaned = cleaned.replace(/```\s*/g, '')
  cleaned = cleaned.trim()

  return extractFirstJSONObject(cleaned)
}

/**
 * 清理JSON字符串
 * 移除Markdown代码块标记
 */
export function cleanJSONString(jsonStr: string): string {
  // 移除Markdown代码块标记
  let cleaned = jsonStr.replace(/```json\s*/gi, '')
  cleaned = cleaned.replace(/```\s*/g, '')

  // 移除前后的空白字符
  cleaned = cleaned.trim()

  return cleaned
}
