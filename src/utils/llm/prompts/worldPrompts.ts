/**
 * 世界观提取Prompt模板
 */

export function getWorldExtractionPrompt(text: string): string {
  return `你是一位专业的小说世界观分析专家。请分析以下小说文本的世界设定。

文本：
${text}

请分析小说的世界设定，提取以下信息：

请以JSON格式返回：
{
  "worldType": "修仙世界",
  "era": "古代仙侠时代",
  "powerSystem": "炼气→筑基→金丹→元婴→化神",
  "majorFactions": ["天剑宗", "万魔门", "散修联盟"],
  "keyLocations": ["天剑山", "万魔谷", "青云城"],
  "description": "一个修仙者的世界，强者为尊..."
}

世界类型说明：
- 修仙世界：修仙、仙侠、玄幻
- 武侠世界：武侠、江湖
- 科幻世界：科幻、未来、星际
- 现代都市：都市、现代
- 历史世界：历史、古代
- 奇幻世界：奇幻、魔法

重要提示：
- powerSystem可选，如果没有明确的修炼体系可以省略
- majorFactions和keyLocations应列出3-5个重要的
- description应概括世界的核心特征
- 只返回JSON对象，不要有任何其他说明文字`
}
