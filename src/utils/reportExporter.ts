import DOMPurify from "dompurify"
/**
 * 质量报告导出工具
 * 支持导出为 PDF 和 JSON 格式
 */

import type { QualityReport } from './qualityChecker'
import html2canvas from 'html2canvas'
import { saveAs } from 'file-saver'
import { getLogger } from '@/utils/logger'
const logger = getLogger('utils:reportExporter')

/**
 * 导出质量报告为 PDF
 */
export async function exportQualityReportAsPDF(
  reports: QualityReport[],
  projectName: string
): Promise<void> {
  try {
    // 创建临时容器
    const container = document.createElement('div')
    container.style.position = 'absolute'
    container.style.left = '-9999px'
    container.style.top = '-9999px'
    container.style.width = '800px'
    container.style.background = 'white'
    container.style.padding = '20px'
    document.body.appendChild(container)

    // 生成报告内容
    const html = generateReportHTML(reports, projectName)
    container.innerHTML = DOMPurify.sanitize(html)

    // 使用 html2canvas 转换为图片
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false
    })

    // 移除临时容器
    document.body.removeChild(container)

    // 转换为 Blob 并下载
    canvas.toBlob((blob) => {
      if (blob) {
        saveAs(blob, `质量报告_${projectName}_${new Date().toISOString().split('T')[0]}.png`)
      }
    })
  } catch (error) {
    logger.error('导出 PDF 失败:', error)
    throw new Error('导出 PDF 失败：' + (error as Error).message)
  }
}

/**
 * 导出质量报告为 JSON
 */
export function exportQualityReportAsJSON(
  reports: QualityReport[],
  projectName: string,
  trendAnalysis?: any
): void {
  const reportData = {
    projectName,
    exportTime: new Date().toISOString(),
    summary: {
      totalChapters: reports.length,
      averageScore: trendAnalysis?.averageScore || calculateAverageScore(reports),
      scoreTrend: trendAnalysis?.scoreTrend || 'stable',
      needImprovement: reports.filter(r => r.overallScore < 7).length
    },
    trendAnalysis: trendAnalysis || null,
    reports: reports.map(r => ({
      chapterId: r.chapterId,
      chapterNumber: r.chapterNumber,
      timestamp: r.timestamp,
      overallScore: r.overallScore,
      dimensions: r.dimensions,
      summary: r.summary,
      improvements: r.improvements
    }))
  }

  const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
  saveAs(blob, `质量报告_${projectName}_${new Date().toISOString().split('T')[0]}.json`)
}

/**
 * 导出质量报告为 Markdown
 */
export function exportQualityReportAsMarkdown(
  reports: QualityReport[],
  projectName: string
): void {
  let markdown = `# ${projectName} 质量报告\n\n`
  markdown += `导出时间：${new Date().toLocaleString('zh-CN')}\n\n`
  markdown += `---\n\n`

  // 总体统计
  const avgScore = calculateAverageScore(reports)
  markdown += `## 总体统计\n\n`
  markdown += `- 检查章节数：${reports.length} 章\n`
  markdown += `- 平均质量分：${avgScore.toFixed(1)} / 10\n`
  markdown += `- 优秀章节（>=8分）：${reports.filter(r => r.overallScore >= 8).length} 章\n`
  markdown += `- 需改进章节（<7分）：${reports.filter(r => r.overallScore < 7).length} 章\n\n`

  // 章节详情
  markdown += `## 章节详情\n\n`
  reports.forEach((report, _index) => {
    markdown += `### 第 ${report.chapterNumber} 章\n\n`
    markdown += `**总体评分**：${report.overallScore.toFixed(1)} / 10\n\n`

    if (report.dimensions.length > 0) {
      markdown += `**维度评分**：\n\n`
      report.dimensions.forEach(dim => {
        markdown += `- ${dim.name}：${dim.score.toFixed(1)} / 10\n`
        if (dim.issues.length > 0) {
          dim.issues.slice(0, 3).forEach(issue => {
            markdown += `  - [${issue.type}] ${issue.message}\n`
          })
        }
      })
      markdown += `\n`
    }

    if (report.improvements.length > 0) {
      markdown += `**改进建议**：\n\n`
      report.improvements.forEach((improvement, idx) => {
        markdown += `${idx + 1}. ${improvement}\n`
      })
      markdown += `\n`
    }

    markdown += `---\n\n`
  })

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  saveAs(blob, `质量报告_${projectName}_${new Date().toISOString().split('T')[0]}.md`)
}

/**
 * 生成报告 HTML
 */
function generateReportHTML(reports: QualityReport[], projectName: string): string {
  const avgScore = calculateAverageScore(reports)

  return `
    <div style="font-family: 'Microsoft YaHei', Arial, sans-serif;">
      <h1 style="text-align: center; color: #303133; margin-bottom: 30px;">
        ${projectName} 质量报告
      </h1>

      <div style="text-align: center; margin-bottom: 30px; color: #909399;">
        导出时间：${new Date().toLocaleString('zh-CN')}
      </div>

      <div style="background: #f5f7fa; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
        <h2 style="margin-top: 0; color: #303133;">总体统计</h2>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px;">
          <div>
            <div style="color: #909399; font-size: 14px;">检查章节</div>
            <div style="color: #409eff; font-size: 24px; font-weight: bold;">${reports.length}</div>
          </div>
          <div>
            <div style="color: #909399; font-size: 14px;">平均分</div>
            <div style="color: #409eff; font-size: 24px; font-weight: bold;">${avgScore.toFixed(1)}</div>
          </div>
          <div>
            <div style="color: #909399; font-size: 14px;">优秀章节</div>
            <div style="color: #67c23a; font-size: 24px; font-weight: bold;">${reports.filter(r => r.overallScore >= 8).length}</div>
          </div>
          <div>
            <div style="color: #909399; font-size: 14px;">需改进</div>
            <div style="color: #f56c6c; font-size: 24px; font-weight: bold;">${reports.filter(r => r.overallScore < 7).length}</div>
          </div>
        </div>
      </div>

      ${reports.map(report => `
        <div style="border: 1px solid #e4e7ed; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #303133;">
            第 ${report.chapterNumber} 章
            <span style="font-size: 18px; color: ${getScoreColor(report.overallScore)}; margin-left: 15px;">
              ${report.overallScore.toFixed(1)} / 10
            </span>
          </h3>

          <div style="margin-bottom: 15px;">
            ${report.dimensions.map(dim => `
              <div style="display: inline-block; margin-right: 15px; margin-bottom: 10px;">
                <span style="color: #606266;">${dim.name}：</span>
                <span style="color: ${getScoreColor(dim.score)}; font-weight: bold;">
                  ${dim.score.toFixed(1)}
                </span>
              </div>
            `).join('')}
          </div>

          ${report.improvements.length > 0 ? `
            <div style="background: #f5f7fa; padding: 15px; border-radius: 4px;">
              <div style="color: #606266; font-weight: bold; margin-bottom: 10px;">改进建议：</div>
              <ul style="margin: 0; padding-left: 20px; color: #909399;">
                ${report.improvements.map(imp => `<li style="margin-bottom: 5px;">${imp}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `
}

/**
 * 计算平均分
 */
function calculateAverageScore(reports: QualityReport[]): number {
  if (reports.length === 0) return 0
  const sum = reports.reduce((total, r) => total + r.overallScore, 0)
  return sum / reports.length
}

/**
 * 获取评分颜色
 */
function getScoreColor(score: number): string {
  if (score >= 8) return '#67c23a'
  if (score >= 6) return '#e6a23c'
  return '#f56c6c'
}

/**
 * 打印质量报告
 */
export function printQualityReport(reports: QualityReport[], projectName: string): void {
  const html = generateReportHTML(reports, projectName)

  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>质量报告 - ${projectName}</title>
          <meta charset="utf-8">
        </head>
        <body>
          ${html}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
    printWindow.close()
  }
}
