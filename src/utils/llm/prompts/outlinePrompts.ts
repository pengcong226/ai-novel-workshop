/**
 * 大纲生成Prompt模板
 */

export function getOutlineGenerationPrompt(
  chapters: Array<{ number: number; title: string; content: string }>
): string {
  const chapterSummaries = chapters.map(ch =>
    `第${ch.number}章 ${ch.title}: ${ch.content.slice(0, 200)}...`
  ).join('\n')

  return `你是一位专业的小说大纲分析专家。请分析以下章节内容，生成结构化大纲。

章节内容：
${chapterSummaries}

请分析小说的主线剧情、支线剧情和关键事件。

请以JSON格式返回：
{
  "mainPlot": "主线剧情描述（50-100字）",
  "subPlots": [
    "支线剧情1：描述",
    "支线剧情2：描述"
  ],
  "keyEvents": [
    {
      "chapter": 1,
      "event": "关键事件描述"
    },
    ...
  ]
}

要求：
1. mainPlot应概括整个故事的核心发展脉络
2. subPlots应列出2-5条重要支线
3. keyEvents应选择每章最重要的1-2个事件
4. 总的keyEvents不超过20个

重要提示：
- 只返回JSON对象，不要有任何其他说明文字
- 确保描述简洁明了`
}
