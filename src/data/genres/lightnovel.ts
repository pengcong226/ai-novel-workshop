import { GenreProfile } from '@/types/genreProfile'

export const lightnovelProfile: GenreProfile = {
  id: 'lightnovel',
  name: '轻小说',
  description: '以轻松、有趣为基调，融合奇幻、校园、恋爱等元素，面向年轻读者，强调角色魅力和趣味性，通常有萌系或中二元素。',

  writingRules: [
    '角色需有鲜明特色，每个角色需有独特的口头禅、性格特点或萌点',
    '对话需有趣，角色之间的互动需有化学反应，吐槽和搞笑需有节奏',
    '节奏需轻快，不可过于沉重或严肃，保持轻松愉快的基调',
    '萌点需有体现，傲娇、天然呆、病娇等属性需有自然展现',
    '中二元素可适度使用，但需有自嘲或反差萌',
    '校园生活需真实，教室、社团、学园祭等场景需有氛围',
    '异世界设定需有趣，不可过于复杂或黑暗',
    '主线剧情需有，不可纯粹日常流水账，需有推动剧情的冲突',
    '配角需有魅力，不可纯粹为主角服务，需有自己的故事',
    '插画感需有，文字描写需有画面感，方便读者想象',
    '流行文化需有体现，动漫、游戏、偶像等元素可融入',
    '恋爱元素可有，但需符合角色设定和年龄',
    '战斗场景可有，但需有趣味性，不可过于血腥',
    '结局需令人满意，轻小说通常需要圆满或开放式结局',
  ],

  genreRules: [
    '角色属性需有反差，表面设定与内在性格的反差需有萌点',
    '吐槽需有节奏，吐槽役角色需有存在感',
    '颜艺可适度描写，夸张的表情和反应可增加趣味性',
    '日常与主线需有平衡，不可完全日常或完全主线',
    '恋爱喜剧需有误会和进展，不可原地踏步',
    '异世界转生需有金手指，但金手指需有趣味性',
    '学园设定需有社团活动，社团是重要的故事舞台',
  ],

  prohibitions: [
    '禁止过于黑暗或沉重的剧情',
    '禁止角色设定过于复杂或难以理解',
    '禁止对话过于无聊或毫无笑点',
    '禁止节奏过于缓慢或拖沓',
    '禁止出现严重的逻辑漏洞',
    '禁止角色行为过于成熟或不符合年龄',
    '禁止纯粹卖萌而无剧情推动',
    '禁止结局过于悲伤或致郁',
  ],

  auditDimensions: [
    {
      id: 'character-charm',
      name: '角色魅力',
      severity: 'critical',
      weight: 10,
      checkInstruction: '检查角色是否有鲜明特色，是否有萌点，是否有吸引力',
    },
    {
      id: 'dialogue-entertainment',
      name: '对话趣味性',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查对话是否有趣，吐槽是否到位，互动是否有化学反应',
    },
    {
      id: 'pacing-lightness',
      name: '节奏轻快度',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查节奏是否轻快，是否过于沉重或拖沓',
    },
    {
      id: 'moe-elements',
      name: '萌元素',
      severity: 'warning',
      weight: 8,
      checkInstruction: '检查萌元素是否自然，是否过于刻意或尴尬',
    },
    {
      id: 'plot-interest',
      name: '剧情趣味性',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查剧情是否有趣，是否有推动剧情的冲突',
    },
    {
      id: 'ending-satisfaction',
      name: '结局满意度',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查结局是否令人满意，是否符合轻小说的基调',
    },
  ],

  pacingTemplate: [
    {
      phase: '开局',
      description: '主角登场，展现日常世界或穿越到异世界',
      wordCountRatio: 0.15,
      tensionLevel: 'low',
    },
    {
      phase: '相遇',
      description: '主角与重要角色相遇，建立基本关系',
      wordCountRatio: 0.2,
      tensionLevel: 'low',
    },
    {
      phase: '日常',
      description: '有趣的日常生活，建立角色关系和世界观',
      wordCountRatio: 0.2,
      tensionLevel: 'low',
    },
    {
      phase: '事件',
      description: '出现推动剧情的事件，可能是比赛、危机或冲突',
      wordCountRatio: 0.2,
      tensionLevel: 'medium',
    },
    {
      phase: '高潮',
      description: '事件达到高潮，角色面临挑战或做出重要决定',
      wordCountRatio: 0.15,
      tensionLevel: 'high',
    },
    {
      phase: '收尾',
      description: '事件解决，角色关系有所进展，回归日常',
      wordCountRatio: 0.1,
      tensionLevel: 'low',
    },
  ],

  characterTypes: [
    {
      type: '主角',
      description: '普通的少年/少女，通常有隐藏的特殊能力或身世',
      requiredTraits: ['性格温和', '有正义感', '有隐藏实力', '受欢迎'],
      avoidTraits: ['过于被动', '毫无特点', '过于中二', '毫无成长'],
    },
    {
      type: '傲娇',
      description: '表面冷漠或毒舌，内心温柔的角色，通常是女主角之一',
      requiredTraits: ['口是心非', '关键时刻温柔', '有反差萌', '有魅力'],
      avoidTraits: ['纯粹毒舌', '毫无可爱之处', '过于刻薄', '毫无成长'],
    },
    {
      type: '天然呆',
      description: '性格天然、反应迟钝但可爱的角色',
      requiredTraits: ['天真可爱', '反应迟钝', '有治愈力', '偶尔有惊人之举'],
      avoidTraits: ['纯粹愚蠢', '毫无存在感', '过于做作', '纯粹工具人'],
    },
    {
      type: '中二病',
      description: '有中二病症状的角色，通常有独特的世界观和口头禅',
      requiredTraits: ['有独特设定', '有反差萌', '关键时刻靠谱', '有成长'],
      avoidTraits: ['纯粹尴尬', '毫无可爱之处', '过于脱离现实', '毫无成长'],
    },
    {
      type: '青梅竹马',
      description: '主角从小一起长大的朋友，通常暗恋主角',
      requiredTraits: ['了解主角', '有默契', '有感情基础', '有独立人格'],
      avoidTraits: ['纯粹备胎', '毫无特点', '过于被动', '纯粹工具人'],
    },
  ],

  styleConstraints: {
    tone: ['轻松愉快', '幽默搞笑', '青春活力', '温暖治愈'],
    vocabulary: ['网络流行语', '动漫用语', '萌系词汇', '吐槽用语'],
    sentenceStyle: ['短句为主，节奏轻快', '对话推动剧情', '吐槽和内心独白', '场景描写有画面感'],
    forbiddenWords: ['之乎者也', '吾', '汝', '尔等', '岂非', '何故'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
