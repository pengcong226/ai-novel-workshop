/**
 * 人物识别Prompt模板
 */

/**
 * 第一轮：识别主要人物
 */
export function getCharacterExtractionPrompt(text: string): string {
  return `你是一位专业的小说分析专家。请分析以下小说文本，识别其中的主要人物。

文本：
${text}

请识别所有出现的人物。要求：
1. 只返回真正的角色人物，不要返回"说道"、"点头"、"起来"、"的时候"等动词、助词或代词
2. 为每个人物提供：姓名、角色定位、性格特征、首次出现章节、简要描述
3. 按重要程度排序（主角、配角、反派、路人）

请以JSON格式返回：
[
  {
    "name": "张三",
    "role": "protagonist",
    "personality": ["勇敢", "正直", "善良"],
    "firstAppearance": "第一章",
    "description": "故事主角，一个年轻的修士",
    "confidence": 0.95
  },
  ...
]

角色定位说明：
- protagonist: 主角
- supporting: 重要配角
- antagonist: 反派
- minor: 小配角/路人

重要提示：
- name必须是真正的角色姓名，2-4个字
- confidence表示你对识别结果的信心程度（0-1）
- 只返回JSON数组，不要有任何其他说明文字
- 确保返回的人物都是真正的角色，而不是普通词语`
}

/**
 * 第二轮：提取人物关系
 */
export function getRelationshipExtractionPrompt(
  characters: Array<{ name: string; role: string }>,
  text: string
): string {
  return `你是一位专业的小说分析专家。请分析以下人物之间的关系。

人物列表：
${characters.map((c, i) => `${i + 1}. ${c.name} (${c.role})`).join('\n')}

文本：
${text}

请分析这些人物之间的关系。要求：
1. 只分析已识别人物之间的关系
2. 明确关系类型和描述
3. 只返回确实存在的关系

请以JSON格式返回：
[
  {
    "from": "张三",
    "to": "李四",
    "relation": "师徒",
    "description": "李四是张三的师父"
  },
  ...
]

关系类型示例：
- 家人：父子、母女、兄弟、姐妹等
- 师徒：师父、徒弟
- 朋友：好友、兄弟
- 敌人：仇人、对手
- 恋人：恋人、夫妻
- 其他：主仆、同门等

重要提示：
- 只返回确实在文本中体现的关系
- 不要推测或虚构关系
- 只返回JSON数组，不要有任何其他说明文字`
}
