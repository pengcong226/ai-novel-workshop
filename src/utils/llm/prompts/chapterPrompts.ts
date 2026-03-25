/**
 * 章节检测Prompt模板
 */

/**
 * 第一轮：识别章节模式
 */
export function getChapterPatternPrompt(text: string): string {
  return `你是一位专业的小说编辑。请分析以下小说文本的章节结构。

文本：
${text}

请识别章节标题的模式。要求：
1. 找出所有章节标题的示例
2. 描述章节标题的特征模式
3. 估算总章节数
4. 给出置信度（0-1）

请以JSON格式返回：
{
  "pattern": "章节标题的特征描述（例如：以'第'开头，后跟中文数字，再跟'章'，最后是标题）",
  "examples": ["第一章 开端", "第二章 初遇", ...],
  "estimatedTotal": 预估章节数（整数）,
  "confidence": 0.95
}

重要提示：
- 只返回JSON对象，不要有任何其他说明文字
- examples数组应包含3-10个示例
- confidence表示你对识别结果的信心程度`
}

/**
 * 第二轮：提取章节列表
 */
export function getChapterListPrompt(pattern: string, text: string): string {
  return `你是一位专业的小说编辑。根据已识别的章节模式，列出所有章节的标题和位置。

章节模式：${pattern}

文本：
${text}

请精确列出每个章节的：
1. 章节号
2. 标题（完整标题）
3. 在文本中的起止位置（字符索引）

请以JSON格式返回：
[
  {
    "number": 1,
    "title": "第一章 开端",
    "startPosition": 0,
    "endPosition": 3500
  },
  ...
]

重要提示：
- startPosition和endPosition必须是文本中的精确字符索引
- 每个章节的endPosition应该是下一个章节的startPosition
- 最后一个章节的endPosition应该是文本的总长度
- 只返回JSON数组，不要有任何其他说明文字`
}

/**
 * 第三轮：验证和修正章节
 */
export function getChapterValidationPrompt(
  chapters: Array<{ number: number; title: string; startPosition: number; endPosition: number }>,
  issues: string[]
): string {
  return `你是一位专业的小说编辑。请检查以下章节列表是否有遗漏或错误，并修正问题。

章节列表：
${JSON.stringify(chapters, null, 2)}

发现的问题：
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

请检查并修正以下问题：
1. 是否有遗漏的章节
2. 章节号是否连续
3. 起止位置是否正确
4. 是否有重复章节

请以JSON格式返回修正后的完整章节列表：
[
  {
    "number": 1,
    "title": "第一章 开端",
    "startPosition": 0,
    "endPosition": 3500
  },
  ...
]

重要提示：
- 如果列表正确无误，直接返回原列表
- 只返回JSON数组，不要有任何其他说明文字`
}
