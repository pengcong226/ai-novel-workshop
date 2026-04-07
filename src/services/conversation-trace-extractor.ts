/**
 * 会话轨迹抽取服务
 * @module services/conversation-trace-extractor
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  TraceExtractedArtifact,
  TraceExtractResult,
  TraceMessage,
  TraceSourceRef,
} from '@/types/conversation-trace'

export interface TraceExtractorOptions {
  minContentLength?: number
  maxArtifactsPerMessage?: number
  regexManager?: {
    execute: (text: string) => unknown
  }
}

const KNOWLEDGE_HINTS = ['设定', '规则', '背景', '关系', '宗门', '门规', '世界观', '地点']
const CHARACTER_HINTS = ['角色', '人设', '性格', '口癖', '厌恶', '喜好', '行为']
const WORLD_HINTS = ['世界观', '宗门', '王朝', '门规', '法则', '历史', '地理', '势力']
const TIMELINE_HINTS = ['第', '章', '事件', '后来', '之前', '随后', '当天']

function hasAnyHint(text: string, hints: string[]): boolean {
  return hints.some(hint => text.includes(hint))
}

function normalizeSpace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractKeywords(text: string, max = 5): string[] {
  const tokens = text.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}/g) || []
  const deny = new Set(['我们', '你们', '他们', '这个', '那个', '进行', '需要', '可以', '应该'])

  const unique = Array.from(new Set(tokens.filter(token => !deny.has(token))))
  return unique.slice(0, max)
}

function sourceRefFromMessage(message: TraceMessage, content: string): TraceSourceRef {
  return {
    line: message.sourceLine,
    role: message.role,
    snippet: content.slice(0, 120),
  }
}

function extractPreprocessedText(value: any, original: string): string {
  if (!value || typeof value !== 'object') {
    return original
  }

  const record = value as Record<string, unknown>
  if (typeof record.replacedText === 'string' && record.replacedText.trim()) {
    return record.replacedText
  }

  const results = record.results
  if (Array.isArray(results) && results.length > 0) {
    const matched = results.find(item => item && typeof item === 'object' && (item as Record<string, unknown>).matched)
    const target = (matched || results[results.length - 1]) as Record<string, unknown>
    if (typeof target?.replacedText === 'string' && target.replacedText.trim()) {
      return target.replacedText
    }
  }

  return original
}

function preprocessContent(content: string, options: TraceExtractorOptions): string {
  const normalized = normalizeSpace(content)

  if (!options.regexManager) {
    return normalized
  }

  const result = options.regexManager.execute(normalized)
  return normalizeSpace(extractPreprocessedText(result, normalized))
}

function createKnowledgeArtifact(content: string, message: TraceMessage): TraceExtractedArtifact {
  return {
    id: uuidv4(),
    type: 'knowledge',
    title: `知识片段-L${message.sourceLine}`,
    confidence: 0.72,
    source: [sourceRefFromMessage(message, content)],
    payload: {
      content,
      comment: `来源: 会话轨迹第${message.sourceLine}行`,
      tags: extractKeywords(content, 6),
      constant: true,
      disable: true,
    },
  }
}

function createWorldbookArtifact(content: string, message: TraceMessage): TraceExtractedArtifact {
  const keys = extractKeywords(content, 5)

  return {
    id: uuidv4(),
    type: 'worldbook',
    title: `世界书候选-L${message.sourceLine}`,
    confidence: 0.77,
    source: [sourceRefFromMessage(message, content)],
    payload: {
      key: keys,
      content,
      comment: `会话轨迹抽取: 第${message.sourceLine}行`,
      constant: false,
      disable: false,
      order: 100,
      position: 'before_char',
    },
  }
}

function createCharacterArtifact(content: string, message: TraceMessage): TraceExtractedArtifact {
  const probableName = (content.match(/[\u4e00-\u9fa5]{2,4}/) || ['角色'])[0]

  return {
    id: uuidv4(),
    type: 'character_profile',
    title: `角色画像-${probableName}`,
    confidence: 0.75,
    source: [sourceRefFromMessage(message, content)],
    payload: {
      name: probableName,
      profile: content,
      personality: content,
    },
  }
}

function createWorldFactArtifact(content: string, message: TraceMessage): TraceExtractedArtifact {
  return {
    id: uuidv4(),
    type: 'world_fact',
    title: `世界事实-L${message.sourceLine}`,
    confidence: 0.7,
    source: [sourceRefFromMessage(message, content)],
    payload: {
      content,
      category: 'world_fact',
    },
  }
}

function createTimelineArtifact(content: string, message: TraceMessage): TraceExtractedArtifact {
  return {
    id: uuidv4(),
    type: 'timeline_event',
    title: `时间线事件-L${message.sourceLine}`,
    confidence: 0.66,
    source: [sourceRefFromMessage(message, content)],
    payload: {
      content,
      category: 'timeline',
    },
  }
}

export async function extractTraceArtifacts(
  messages: TraceMessage[],
  options: TraceExtractorOptions = {}
): Promise<TraceExtractResult> {
  const minContentLength = options.minContentLength ?? 12
  const maxArtifactsPerMessage = options.maxArtifactsPerMessage ?? 5

  const artifacts: TraceExtractedArtifact[] = []
  const warnings: string[] = []

  let processedMessages = 0
  let skippedMessages = 0

  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') {
      skippedMessages++
      continue
    }

    const content = preprocessContent(message.content, options)

    if (content.length < minContentLength) {
      skippedMessages++
      continue
    }

    processedMessages++

    const messageArtifacts: TraceExtractedArtifact[] = []

    // 每条有效消息最少生成一个知识片段
    messageArtifacts.push(createKnowledgeArtifact(content, message))

    if (hasAnyHint(content, KNOWLEDGE_HINTS)) {
      messageArtifacts.push(createWorldbookArtifact(content, message))
    }

    if (hasAnyHint(content, CHARACTER_HINTS)) {
      messageArtifacts.push(createCharacterArtifact(content, message))
    }

    if (hasAnyHint(content, WORLD_HINTS)) {
      messageArtifacts.push(createWorldFactArtifact(content, message))
    }

    if (hasAnyHint(content, TIMELINE_HINTS)) {
      messageArtifacts.push(createTimelineArtifact(content, message))
    }

    if (messageArtifacts.length > maxArtifactsPerMessage) {
      warnings.push(`第${message.sourceLine}行抽取结果超过限制，已截断`)
    }

    artifacts.push(...messageArtifacts.slice(0, maxArtifactsPerMessage))
  }

  return {
    artifacts,
    stats: {
      totalMessages: messages.length,
      processedMessages,
      artifacts: artifacts.length,
      skippedMessages,
    },
    warnings,
  }
}
