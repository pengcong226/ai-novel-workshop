/**
 * 表格记忆系统 - 完全借鉴 st-memory-enhancement 实现
 *
 * 核心特性：
 * 1. CSV 格式（不是 Markdown）- rowIndex 使每行独立可定位
 * 2. AI 可执行更新命令 - updateRow/insertRow/deleteRow
 * 3. 触发式过滤 - 只发送相关行，节省 tokens
 * 4. 占位符系统 - 表格间引用
 */

import type { Project, Chapter} from '@/types'

/**
 * 表格类型
 */
export type SheetType = 'character' | 'item' | 'event' | 'relationship' | 'foreshadowing' | 'custom'

/**
 * 单元格数据
 */
export interface Cell {
  uid: string
  value: string
  metadata?: Record<string, any>
}

/**
 * 表格（Sheet）
 */
export interface Sheet {
  uid: string
  name: string
  type: SheetType
  domain: 'global' | 'role' | 'chat'  // 作用域
  enable: boolean
  required: boolean
  tochat: boolean  // 是否发送到上下文

  // 表格结构
  hashSheet: string[][]   // 二维数组存储 cellUid
  cells: Map<string, Cell>  // cellUid -> Cell

  // 提示词配置
  note: string  // 表格说明
  initNode: string  // 初始化提示词
  insertNode: string  // 插入提示词
  updateNode: string  // 更新提示词
  deleteNode: string  // 删除提示词

  // 触发式更新
  triggerSend: boolean  // 是否启用触发式更新
  triggerSendDeep: number  // 检查最近几条消息
}

/**
 * 表格记忆系统
 */
export interface MemorySystem {
  sheets: Sheet[]
  lastUpdated: number
  currentChapter: number
  currentLocation: string
}

/**
 * 创建空表格
 */
export function createSheet(
  name: string,
  type: SheetType,
  columns: string[],
  options: Partial<Sheet> = {}
): Sheet {
  const uid = `sheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  // 创建列头（第一行）
  const headerRow = ['rowIndex', ...columns.map((_, i) => `${i}`)]
  const headerUids = headerRow.map((_, i) => `cell-${uid}-0-${i}`)

  // 初始化 hashSheet（只有列头）
  const hashSheet: string[][] = [headerUids]

  // 初始化 cells
  const cells = new Map<string, Cell>()
  headerRow.forEach((value, i) => {
    const cellUid = headerUids[i]
    cells.set(cellUid, {
      uid: cellUid,
      value: i === 0 ? 'rowIndex' : columns[i - 1]
    })
  })

  return {
    uid,
    name,
    type,
    domain: 'chat',
    enable: true,
    required: false,
    tochat: true,
    hashSheet,
    cells,
    note: '',
    initNode: '',
    insertNode: '',
    updateNode: '',
    deleteNode: '',
    triggerSend: false,
    triggerSendDeep: 5,
    ...options
  }
}

/**
 * 添加行
 */
export function insertRow(sheet: Sheet, values: string[]): Sheet {
  const rowIndex = sheet.hashSheet.length
  const colCount = sheet.hashSheet[0].length

  // 创建新行
  const rowUids: string[] = []
  for (let i = 0; i < colCount; i++) {
    const cellUid = `cell-${sheet.uid}-${rowIndex}-${i}`
    rowUids.push(cellUid)

    const value = i === 0 ? `${rowIndex}` : (values[i - 1] || '')
    sheet.cells.set(cellUid, {
      uid: cellUid,
      value
    })
  }

  sheet.hashSheet.push(rowUids)
  return sheet
}

/**
 * 更新行
 */
export function updateRow(sheet: Sheet, rowIndex: number, values: string[]): Sheet {
  if (rowIndex <= 0 || rowIndex >= sheet.hashSheet.length) {
    throw new Error(`Invalid row index: ${rowIndex}`)
  }

  const rowUids = sheet.hashSheet[rowIndex]
  for (let i = 1; i < rowUids.length; i++) {
    const cellUid = rowUids[i]
    const cell = sheet.cells.get(cellUid)
    if (cell) {
      cell.value = values[i - 1] || ''
    }
  }

  return sheet
}

/**
 * 删除行
 */
export function deleteRow(sheet: Sheet, rowIndex: number): Sheet {
  if (rowIndex <= 0 || rowIndex >= sheet.hashSheet.length) {
    throw new Error(`Invalid row index: ${rowIndex}`)
  }

  // 删除 cells
  const rowUids = sheet.hashSheet[rowIndex]
  rowUids.forEach(uid => sheet.cells.delete(uid))

  // 删除行
  sheet.hashSheet.splice(rowIndex, 1)

  // 更新后续行的 rowIndex
  for (let i = rowIndex; i < sheet.hashSheet.length; i++) {
    const cellUid = sheet.hashSheet[i][0]
    const cell = sheet.cells.get(cellUid)
    if (cell) {
      cell.value = `${i}`
    }
  }

  return sheet
}

/**
 * 获取表格 CSV 格式（借鉴 st-memory-enhancement）
 */
export function getSheetCSV(sheet: Sheet): string {
  const rows: string[] = []

  for (let i = 1; i < sheet.hashSheet.length; i++) {
    const rowUids = sheet.hashSheet[i]
    const values = rowUids.map(uid => {
      const cell = sheet.cells.get(uid)
      return cell?.value || ''
    })
    rows.push(values.join(','))
  }

  return rows.join('\n')
}

/**
 * 获取表格提示词格式（完全按照 st-memory-enhancement）
 */
export function getSheetPrompt(
  sheet: Sheet,
  index: number,
  customParts: string[] = ['title', 'node', 'headers', 'rows', 'editRules']
): string {
  let result = ''

  // 1. 标题
  if (customParts.includes('title')) {
    result += `* ${index}:${sheet.name}\n`
  }

  // 2. 说明
  if (customParts.includes('node') && sheet.note) {
    result += `【说明】${sheet.note}\n`
  }

  // 3. 表头和内容
  if (customParts.includes('headers') || customParts.includes('rows')) {
    if (customParts.includes('headers')) {
      // 表头行
      const headerRow = sheet.hashSheet[0]
      const headers = headerRow.map(uid => {
        const cell = sheet.cells.get(uid)
        return cell?.value || ''
      }).join(',')
      result += '【表格内容】\n' + headers + '\n'
    }

    // 数据行
    if (customParts.includes('rows')) {
      result += getSheetCSV(sheet) + '\n'
    }
  }

  // 4. 编辑规则
  if (customParts.includes('editRules')) {
    result += getEditRules(sheet)
  }

  return result
}

/**
 * 获取编辑规则（AI 可执行的命令）
 */
function getEditRules(sheet: Sheet): string {
  const colCount = sheet.hashSheet[0].length - 1  // 减去 rowIndex 列

  let rules = '【编辑规则】\n'
  rules += `可用命令：\n`
  rules += `- updateRow(行号, "${Array(colCount).fill('值').join('", "')}")\n`
  rules += `- insertRow("${Array(colCount).fill('值').join('", "')}")  <- 注意：insertRow 绝对不要传行号！\n`
  rules += `- deleteRow(行号)\n\n`

  rules += `示例：\n`
  if (sheet.hashSheet.length > 1) {
    const exampleRow = sheet.hashSheet[1]
    const exampleValues = exampleRow.slice(1).map(uid => {
      const cell = sheet.cells.get(uid)
      return cell?.value || '值'
    })
    rules += `updateRow(1, "${exampleValues.join('", "')}")\n`
  }

  if (sheet.updateNode) {
    rules += `\n${sheet.updateNode}\n`
  }

  return rules
}

/**
 * 触发式过滤（只发送相关行）
 * 借鉴 st-memory-enhancement 的 triggerSend 机制
 */
export function filterRelevantRows(
  sheet: Sheet,
  recentContent: string,
  deep: number = 5
): string {
  if (!sheet.triggerSend) {
    // 不启用触发式，返回全部数据
    return getSheetCSV(sheet)
  }

  // 提取最近 deep 条消息中提到的关键词
  const keywords = extractKeywords(recentContent, deep)

  // 过滤相关行
  const relevantRows: string[] = []
  for (let i = 1; i < sheet.hashSheet.length; i++) {
    const rowUids = sheet.hashSheet[i]
    const values = rowUids.map(uid => {
      const cell = sheet.cells.get(uid)
      return cell?.value || ''
    })

    // 检查第一列（通常是名称）是否在关键词中
    const firstColValue = values[1] || ''
    if (keywords.some(keyword => firstColValue.includes(keyword))) {
      relevantRows.push(values.join(','))
    }
  }

  return relevantRows.join('\n')
}

/**
 * 提取关键词（简化版）
 */
function extractKeywords(content: string, deep: number): string[] {
  // 简化：按句号分割，取最后 deep 句
  const sentences = content.split(/[。！？\n]/).filter(s => s.trim())
  const recentSentences = sentences.slice(-deep * 2)  // 取最近的内容

  // 提取可能是角色名/地点的词（简化：提取2-4字的词）
  const keywords: string[] = []
  const regex = /[\u4e00-\u9fa5]{2,4}/g
  recentSentences.forEach(sentence => {
    const matches = sentence.match(regex) || []
    keywords.push(...matches)
  })

  return [...new Set(keywords)]  // 去重
}

/**
 * 初始化小说的记忆系统
 */
export function initNovelMemory(project: Project): MemorySystem {
  const sheets: Sheet[] = []

  // 1. 角色状态表
  if (project.characters && project.characters.length > 0) {
    const characterSheet = createSheet(
      '角色状态',
      'character',
      ['姓名', '身份', '位置', '状态', '装备', '当前目标'],
      {
        note: '追踪角色的当前状态，包括位置、健康、装备等信息',
        triggerSend: true,  // 启用触发式更新
        triggerSendDeep: 5
      }
    )

    // V4-③: 注入时跳过死亡/归档角色
    project.characters.forEach(char => {
      const isDead = (char.currentState?.status || '').toLowerCase().includes('死') || (char.currentState?.status || '').toLowerCase().includes('dead')
      const isArchived = (char as any).isArchived === true
      if (isDead || isArchived) return

      insertRow(characterSheet, [
        char.name,
        char.background?.substring(0, 20) || '未知身份',
        '未知',
        '正常',
        char.abilities?.map(a => a.name).join('/') || '无',
        char.motivation?.substring(0, 20) || '未知目标'
      ])
    })

    sheets.push(characterSheet)
  }

  // 2. 物品表
  const itemSheet = createSheet(
    '重要物品',
    'item',
    ['物品名', '持有者', '类型', '效果', '重要性', '备注'],
    {
      note: '追踪重要物品的归属和效果',
      triggerSend: true,
      triggerSendDeep: 3
    }
  )
  sheets.push(itemSheet)

  // 3. 关系表
  if (project.characters && project.characters.length > 0) {
    const relationshipSheet = createSheet(
      '人物关系',
      'relationship',
      ['角色1', '角色2', '关系', '亲密度', '演变'],
      {
        note: '追踪人物之间的关系变化'
      }
    )

    // 从人物设定中提取关系
    // V4-③: 关系表中跳过死亡/归档角色
    project.characters.forEach(char => {
      const isDead1 = (char.currentState?.status || '').toLowerCase().includes('死') || (char.currentState?.status || '').toLowerCase().includes('dead')
      const isArchived1 = (char as any).isArchived === true
      if (isDead1 || isArchived1) return

      if (char.relationships && char.relationships.length > 0) {
        char.relationships.forEach(rel => {
          const target = project.characters?.find(c => c.id === rel.targetId)
          if (target) {
            const isDead2 = (target.currentState?.status || '').toLowerCase().includes('死') || (target.currentState?.status || '').toLowerCase().includes('dead')
            const isArchived2 = (target as any).isArchived === true
            if (isDead2 || isArchived2) return

            insertRow(relationshipSheet, [
              char.name,
              target.name,
              rel.type,
              '50',
              ''
            ])
          }
        })
      }
    })

    sheets.push(relationshipSheet)
  }

  // 4. 事件表
  const eventSheet = createSheet(
    '重要事件',
    'event',
    ['章节', '事件', '影响', '参与者', '重要性'],
    {
      note: '记录重要事件，避免遗忘'
    }
  )
  sheets.push(eventSheet)

  // 5. 伏笔表
  const foreshadowingSheet = createSheet(
    '伏笔追踪',
    'foreshadowing',
    ['伏笔内容', '埋下章节', '揭示章节', '状态', '相关人物'],
    {
      note: '追踪伏笔的埋设和揭示'
    }
  )
  sheets.push(foreshadowingSheet)

  return {
    sheets,
    lastUpdated: Date.now(),
    currentChapter: 1,
    currentLocation: project.world?.geography?.locations?.[0]?.name || '未知'
  }
}

/**
 * 解析 AI 返回的表格命令
 */
export function parseTableCommand(command: string): {
  type: 'update' | 'insert' | 'delete'
  rowIndex?: number
  values?: string[]
} | null {
  // 匹配 updateRow(1, "值1", "值2", ...)
  const updateMatch = command.match(/updateRow\((\d+),\s*(.+)\)/)
  if (updateMatch) {
    const rowIndex = parseInt(updateMatch[1])
    const valuesStr = updateMatch[2]
    const values = valuesStr.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''))
    return { type: 'update', rowIndex, values }
  }

  // 匹配 insertRow("值1", "值2", ...)
  const insertMatch = command.match(/insertRow\((.+)\)/)
  if (insertMatch) {
    const valuesStr = insertMatch[1]
    const values = valuesStr.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''))
    return { type: 'insert', values }
  }

  // 匹配 deleteRow(1)
  const deleteMatch = command.match(/deleteRow\((\d+)\)/)
  if (deleteMatch) {
    const rowIndex = parseInt(deleteMatch[1])
    return { type: 'delete', rowIndex }
  }

  return null
}

/**
 * 执行表格命令
 */
export function executeTableCommand(memory: MemorySystem, sheetName: string, command: string): MemorySystem {
  const parsed = parseTableCommand(command)
  if (!parsed) {
    console.warn('无法解析表格命令:', command)
    return memory
  }

  const sheet = memory.sheets.find(s => s.name === sheetName)
  if (!sheet) {
    console.warn('找不到表格:', sheetName)
    return memory
  }

  switch (parsed.type) {
    case 'update':
      if (parsed.rowIndex !== undefined && parsed.values) {
        const values = parsed.values;
        const expectedColCount = sheet.hashSheet[0].length - 1;
        // 自动纠错：如果AI错误地把序号当作第一个参数传进来了
        if (values.length > expectedColCount && /^\d+$/.test(values[0])) {
          values.shift();
        }
        
        // 根据复合主键来矫正 rowIndex
        const primaryKey = getPrimaryKey(sheet, values);
        let correctRowIndex = parsed.rowIndex;
        let found = false;
        
        if (primaryKey) {
          for (let i = 1; i < sheet.hashSheet.length; i++) {
            const rowUids = sheet.hashSheet[i];
            const rowPK = getRowPrimaryKey(sheet, rowUids);
            if (rowPK === primaryKey) {
              correctRowIndex = i;
              found = true;
              break;
            }
          }
        }
        
        if (found) {
          updateRow(sheet, correctRowIndex, values);
        } else {
          // 如果找不到该主键，说明是新内容，静默转为 insert
          insertRow(sheet, values);
        }
      }
      break

    case 'insert':
      if (parsed.values) {
        const values = parsed.values;
        const expectedColCount = sheet.hashSheet[0].length - 1;
        // 自动纠错：如果AI错误地把序号当作第一个参数传进来了
        if (values.length > expectedColCount && /^\d+$/.test(values[0])) {
          values.shift();
        }

        // 自动去重 (Upsert)：检查复合主键是否已存在
        const primaryKey = getPrimaryKey(sheet, values);
        let foundRowIndex = -1;
        
        if (primaryKey) {
          for (let i = 1; i < sheet.hashSheet.length; i++) {
            const rowUids = sheet.hashSheet[i];
            const rowPK = getRowPrimaryKey(sheet, rowUids);
            if (rowPK === primaryKey) {
              foundRowIndex = i;
              break;
            }
          }
        }

        if (foundRowIndex !== -1) {
          // 存在则转为更新
          updateRow(sheet, foundRowIndex, values);
        } else {
          // 不存在则插入
          insertRow(sheet, values);
        }
      }
      break

    case 'delete':
      if (parsed.rowIndex !== undefined) {
        deleteRow(sheet, parsed.rowIndex)
      }
      break
  }

  memory.lastUpdated = Date.now()
  return memory
}

/**
 * 获取指定表格和数据的主键标识，用于去重
 */
function getPrimaryKey(sheet: Sheet, values: string[]): string {
  if (!values || values.length === 0) return '';
  
  if (sheet.name === '人物关系' || sheet.type === 'relationship') {
    // 关系表的主键是 角色1 + 角色2 (双向关联)
    const char1 = values[0] || '';
    const char2 = values[1] || '';
    // 排序后拼接，确保 A-B 和 B-A 被识别为同一关系
    return [char1, char2].sort().join('|');
  } else if (sheet.name === '重要事件' || sheet.type === 'event') {
    // 事件表的主键是 事件内容本身 (第二列)
    return values[1] || values[0];
  } else {
    // 角色、物品、伏笔等，主键都是第一列 (姓名/物品名/伏笔内容)
    return values[0];
  }
}

/**
 * 获取现有行的主键标识
 */
function getRowPrimaryKey(sheet: Sheet, rowUids: string[]): string {
  if (rowUids.length <= 1) return '';
  
  if (sheet.name === '人物关系' || sheet.type === 'relationship') {
    const char1 = sheet.cells.get(rowUids[1])?.value || '';
    const char2 = sheet.cells.get(rowUids[2])?.value || '';
    return [char1, char2].sort().join('|');
  } else if (sheet.name === '重要事件' || sheet.type === 'event') {
    return sheet.cells.get(rowUids[2])?.value || sheet.cells.get(rowUids[1])?.value || '';
  } else {
    return sheet.cells.get(rowUids[1])?.value || '';
  }
}
export function generateMemoryPrompt(
  memory: MemorySystem,
  recentContent?: string
): string {
  const parts: string[] = []

  // 添加状态说明
  parts.push(`【当前状态】`)
  parts.push(`章节：第${memory.currentChapter}章`)
  parts.push(`地点：${memory.currentLocation}`)
  parts.push('')

  // 添加各表格
  memory.sheets.forEach((sheet, index) => {
    if (!sheet.enable || !sheet.tochat) {
      return  // 跳过禁用或不需要发送的表格
    }

    // 如果启用触发式更新且有最近内容，则过滤
    if (sheet.triggerSend && recentContent) {
      const filteredCSV = filterRelevantRows(sheet, recentContent, sheet.triggerSendDeep)
      if (!filteredCSV) {
        return  // 跳过没有相关数据的表格
      }

      // 生成过滤后的提示词
      let sheetPrompt = `* ${index}:${sheet.name}\n`
      if (sheet.note) {
        sheetPrompt += `【说明】${sheet.note}\n`
      }

      // 添加表头
      const headerRow = sheet.hashSheet[0]
      const headers = headerRow.map(uid => {
        const cell = sheet.cells.get(uid)
        return cell?.value || ''
      }).join(',')
      sheetPrompt += '【表格内容】\n' + headers + '\n'

      // 添加过滤后的数据
      sheetPrompt += filteredCSV + '\n'

      parts.push(sheetPrompt)
    } else {
      // 不启用触发式，发送完整表格
      const sheetPrompt = getSheetPrompt(sheet, index)
      parts.push(sheetPrompt)
    }
  })

  return parts.join('\n')
}

/**
 * 从章节内容更新记忆（使用 AI 提取）
 */
export async function updateMemoryFromChapter(
  memory: MemorySystem,
  chapter: Chapter,
  aiExtractFunction?: (content: string, memory: MemorySystem) => Promise<string[]>
): Promise<MemorySystem> {
  // 更新当前章节和位置
  memory.currentChapter = chapter.number

  if (aiExtractFunction) {
    // 使用 AI 提取更新命令
    const commands = await aiExtractFunction(chapter.content, memory)

    // 执行命令
    commands.forEach(cmd => {
      // 假设命令格式为 "表格名:命令"
      const [sheetName, ...commandParts] = cmd.split(':')
      const command = commandParts.join(':').trim()
      executeTableCommand(memory, sheetName.trim(), command)
    })
  }

  memory.lastUpdated = Date.now()
  return memory
}

/**
 * 导出记忆系统为 JSON
 */
export function exportMemory(memory: MemorySystem): string {
  const exportData = {
    ...memory,
    sheets: memory.sheets.map(sheet => ({
      ...sheet,
      cells: Array.from(sheet.cells.entries())  // Map 转数组
    }))
  }
  return JSON.stringify(exportData, null, 2)
}

/**
 * 从 JSON 导入记忆系统
 */
export function importMemory(json: string): MemorySystem {
  const data = JSON.parse(json)

  const sheets: Sheet[] = data.sheets.map((sheetData: any) => ({
    ...sheetData,
    cells: new Map(sheetData.cells)  // 数组转 Map
  }))

  return {
    ...data,
    sheets
  }
}
