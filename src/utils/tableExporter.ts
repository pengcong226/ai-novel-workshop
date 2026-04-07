/**
 * 表格导入导出工具
 * 支持 Excel、CSV、JSON 格式
 */

import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import type { Sheet, MemorySystem } from './tableMemory'

/**
 * 导出选项
 */
export interface ExportOptions {
  format: 'xlsx' | 'csv' | 'json'
  includeMetadata?: boolean
  sheets?: string[]  // 指定导出的表格名称，为空则导出全部
}

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean
  sheets: Sheet[]
  errors: string[]
}

/**
 * 表格数据转工作表
 */
function sheetToWorksheet(sheet: Sheet): XLSX.WorkSheet {
  const data: any[][] = []

  // 添加表头
  const headerRow: string[] = []
  for (let i = 0; i < sheet.hashSheet[0].length; i++) {
    if (i === 0) {
      headerRow.push('#')  // rowIndex 列
    } else {
      const cellUid = sheet.hashSheet[0][i]
      const cell = sheet.cells.get(cellUid)
      headerRow.push(cell?.value || '')
    }
  }
  data.push(headerRow)

  // 添加数据行
  for (let rowIndex = 1; rowIndex < sheet.hashSheet.length; rowIndex++) {
    const rowData: string[] = []
    const row = sheet.hashSheet[rowIndex]

    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      if (colIndex === 0) {
        rowData.push(`${rowIndex}`)  // rowIndex
      } else {
        const cellUid = row[colIndex]
        const cell = sheet.cells.get(cellUid)
        rowData.push(cell?.value || '')
      }
    }
    data.push(rowData)
  }

  return XLSX.utils.aoa_to_sheet(data)
}

/**
 * 工作表转表格数据
 */
function worksheetToSheet(
  worksheet: XLSX.WorkSheet,
  name: string,
  type: Sheet['type'] = 'custom'
): Sheet {
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

  if (data.length === 0) {
    throw new Error('工作表为空')
  }

  const uid = `sheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  // 解析表头（跳过第一列 #）
  const headerRow = data[0] as string[]
  const columns = headerRow.slice(1)
  const headerUids = ['rowIndex', ...columns.map((_, i) => `${i}`)].map(
    (_, i) => `cell-${uid}-0-${i}`
  )

  // 初始化 hashSheet 和 cells
  const hashSheet: string[][] = [headerUids]
  const cells = new Map<string, { uid: string; value: string }>()

  // 添加表头 cells
  headerRow.forEach((value, i) => {
    const cellUid = headerUids[i]
    cells.set(cellUid, {
      uid: cellUid,
      value: i === 0 ? '#' : (value || '')
    })
  })

  // 添加数据行
  for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex] as any[]
    const rowUids: string[] = []

    for (let colIndex = 0; colIndex < headerRow.length; colIndex++) {
      const cellUid = `cell-${uid}-${rowIndex}-${colIndex}`
      rowUids.push(cellUid)

      const value = colIndex === 0 ? `${rowIndex}` : String(row?.[colIndex] || '')
      cells.set(cellUid, {
        uid: cellUid,
        value
      })
    }

    hashSheet.push(rowUids)
  }

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
    triggerSendDeep: 5
  }
}

/**
 * 导出单个表格为 Excel
 */
export function exportSheetToExcel(sheet: Sheet, filename?: string): void {
  const workbook = XLSX.utils.book_new()
  const worksheet = sheetToWorksheet(sheet)
  XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name)

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

  saveAs(blob, filename || `${sheet.name}-${Date.now()}.xlsx`)
}

/**
 * 导出整个记忆系统为 Excel
 */
export function exportMemoryToExcel(
  memory: MemorySystem,
  options: ExportOptions = { format: 'xlsx' }
): void {
  const workbook = XLSX.utils.book_new()

  // 过滤要导出的表格
  const sheetsToExport = options.sheets
    ? memory.sheets.filter(s => options.sheets!.includes(s.name))
    : memory.sheets

  sheetsToExport.forEach(sheet => {
    const worksheet = sheetToWorksheet(sheet)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name)
  })

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

  saveAs(blob, `memory-${Date.now()}.xlsx`)
}

/**
 * 导出单个表格为 CSV
 */
export function exportSheetToCSV(sheet: Sheet, filename?: string): void {
  const data: string[] = []

  // 添加表头
  const headerRow: string[] = []
  for (let i = 0; i < sheet.hashSheet[0].length; i++) {
    if (i === 0) {
      headerRow.push('#')
    } else {
      const cellUid = sheet.hashSheet[0][i]
      const cell = sheet.cells.get(cellUid)
      headerRow.push(escapeCSV(cell?.value || ''))
    }
  }
  data.push(headerRow.join(','))

  // 添加数据行
  for (let rowIndex = 1; rowIndex < sheet.hashSheet.length; rowIndex++) {
    const rowData: string[] = []
    const row = sheet.hashSheet[rowIndex]

    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      if (colIndex === 0) {
        rowData.push(`${rowIndex}`)
      } else {
        const cellUid = row[colIndex]
        const cell = sheet.cells.get(cellUid)
        rowData.push(escapeCSV(cell?.value || ''))
      }
    }
    data.push(rowData.join(','))
  }

  const csv = '\uFEFF' + data.join('\n')  // 添加 BOM 以支持中文
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })

  saveAs(blob, filename || `${sheet.name}-${Date.now()}.csv`)
}

/**
 * CSV 字段转义
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * 导入 Excel 文件
 */
export async function importFromExcel(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })

        const sheets: Sheet[] = []
        const errors: string[] = []

        workbook.SheetNames.forEach(name => {
          try {
            const worksheet = workbook.Sheets[name]
            const sheet = worksheetToSheet(worksheet, name)
            sheets.push(sheet)
          } catch (error) {
            errors.push(`工作表 "${name}" 导入失败: ${error}`)
          }
        })

        resolve({ success: errors.length === 0, sheets, errors })
      } catch (error) {
        resolve({
          success: false,
          sheets: [],
          errors: [`解析 Excel 文件失败: ${error}`]
        })
      }
    }

    reader.onerror = () => {
      resolve({
        success: false,
        sheets: [],
        errors: ['读取文件失败']
      })
    }

    reader.readAsArrayBuffer(file)
  })
}

/**
 * 导入 CSV 文件
 */
export async function importFromCSV(
  file: File,
  sheetName?: string
): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const lines = text.split(/\r?\n/).filter(line => line.trim())

        if (lines.length === 0) {
          resolve({
            success: false,
            sheets: [],
            errors: ['CSV 文件为空']
          })
          return
        }

        // 解析 CSV
        const data: string[][] = []
        lines.forEach(line => {
          data.push(parseCSVLine(line))
        })

        // 转换为 Sheet
        const uid = `sheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const headerRow = data[0]
        const columns = headerRow.slice(1)
        const headerUids = ['rowIndex', ...columns.map((_, i) => `${i}`)].map(
          (_, i) => `cell-${uid}-0-${i}`
        )

        const hashSheet: string[][] = [headerUids]
        const cells = new Map<string, { uid: string; value: string }>()

        // 添加表头
        headerRow.forEach((value, i) => {
          const cellUid = headerUids[i]
          cells.set(cellUid, {
            uid: cellUid,
            value: i === 0 ? '#' : value
          })
        })

        // 添加数据行
        for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
          const row = data[rowIndex]
          const rowUids: string[] = []

          for (let colIndex = 0; colIndex < headerRow.length; colIndex++) {
            const cellUid = `cell-${uid}-${rowIndex}-${colIndex}`
            rowUids.push(cellUid)

            const value = colIndex === 0 ? `${rowIndex}` : (row?.[colIndex] || '')
            cells.set(cellUid, {
              uid: cellUid,
              value
            })
          }

          hashSheet.push(rowUids)
        }

        const sheet: Sheet = {
          uid,
          name: sheetName || file.name.replace(/\.csv$/i, ''),
          type: 'custom',
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
          triggerSendDeep: 5
        }

        resolve({ success: true, sheets: [sheet], errors: [] })
      } catch (error) {
        resolve({
          success: false,
          sheets: [],
          errors: [`解析 CSV 文件失败: ${error}`]
        })
      }
    }

    reader.onerror = () => {
      resolve({
        success: false,
        sheets: [],
        errors: ['读取文件失败']
      })
    }

    reader.readAsText(file, 'UTF-8')
  })
}

/**
 * 解析 CSV 行
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}

/**
 * 表格模板
 */
export const TABLE_TEMPLATES: Record<string, {
  name: string
  type: Sheet['type']
  columns: string[]
  note: string
}> = {
  character: {
    name: '角色状态',
    type: 'character',
    columns: ['姓名', '身份', '位置', '状态', '装备', '当前目标'],
    note: '追踪角色的当前状态，包括位置、健康、装备等信息'
  },
  item: {
    name: '重要物品',
    type: 'item',
    columns: ['物品名', '持有者', '类型', '效果', '重要性', '备注'],
    note: '追踪重要物品的归属和效果'
  },
  event: {
    name: '重要事件',
    type: 'event',
    columns: ['章节', '事件', '影响', '参与者', '重要性'],
    note: '记录重要事件，避免遗忘'
  },
  relationship: {
    name: '人物关系',
    type: 'relationship',
    columns: ['角色1', '角色2', '关系', '亲密度', '演变'],
    note: '追踪人物之间的关系变化'
  },
  foreshadowing: {
    name: '伏笔追踪',
    type: 'foreshadowing',
    columns: ['伏笔内容', '埋下章节', '揭示章节', '状态', '相关人物'],
    note: '追踪伏笔的埋设和揭示'
  },
  location: {
    name: '地点信息',
    type: 'custom',
    columns: ['地点名', '类型', '描述', '重要性', '相关人物'],
    note: '追踪故事中的重要地点'
  },
  timeline: {
    name: '时间线',
    type: 'custom',
    columns: ['时间', '事件', '地点', '参与人物', '影响'],
    note: '按时间顺序记录事件'
  }
}

/**
 * 从模板创建表格
 */
export function createSheetFromTemplate(
  templateKey: string,
  customName?: string
): Sheet {
  const template = TABLE_TEMPLATES[templateKey]
  if (!template) {
    throw new Error(`找不到模板: ${templateKey}`)
  }

  const uid = `sheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const headerRow = ['rowIndex', ...template.columns.map((_, i) => `${i}`)]
  const headerUids = headerRow.map((_, i) => `cell-${uid}-0-${i}`)

  const hashSheet: string[][] = [headerUids]
  const cells = new Map<string, { uid: string; value: string }>()

  headerRow.forEach((_value, i) => {
    const cellUid = headerUids[i]
    cells.set(cellUid, {
      uid: cellUid,
      value: i === 0 ? '#' : template.columns[i - 1]
    })
  })

  return {
    uid,
    name: customName || template.name,
    type: template.type,
    domain: 'chat',
    enable: true,
    required: false,
    tochat: true,
    hashSheet,
    cells,
    note: template.note,
    initNode: '',
    insertNode: '',
    updateNode: '',
    deleteNode: '',
    triggerSend: false,
    triggerSendDeep: 5
  }
}
