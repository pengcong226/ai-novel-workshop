import { GenreProfile } from '@/types/genreProfile'

export const scifiProfile: GenreProfile = {
  id: 'scifi',
  name: '科幻未来',
  description: '以科学技术或未来世界为背景，探讨科技发展对人类社会、文明和个体的影响，强调科学逻辑和想象力的结合。',

  writingRules: [
    '科技设定需有科学基础，即使是软科幻也需有自洽的理论体系',
    '世界观需宏大且完整，未来社会的政治、经济、文化、科技需有全面设定',
    '科技发展需有逻辑，技术突破需有铺垫，不可凭空出现黑科技',
    '社会影响需有体现，科技对人类生活方式、价值观、伦理的影响需有探讨',
    '人物需有科技背景，科学家、工程师、宇航员等角色需有专业素养',
    '冲突来源需多样，科技伦理、资源争夺、外星威胁、AI觉醒等都可作为冲突',
    '硬科幻需有专业支撑，涉及物理、天文、生物等学科时需有准确描述',
    '软科幻可侧重哲学思考，探讨人类本质、意识、自由意志等议题',
    '未来科技产品需有设计理念，不可仅仅是现有产品的升级版',
    '太空描写需有真实感，失重、辐射、距离等太空环境需有体现',
    '人工智能需有深度，不可仅仅是工具，需有其发展逻辑和可能的问题',
    '时间旅行需有规则，祖父悖论等问题需有解决方案或设定',
    '平行宇宙需有理论基础，不可随意穿越或切换',
    '结局需有思考，科技发展的终极问题需有探讨或留白',
  ],

  genreRules: [
    '硬科幻的科技设定需经得起科学推敲，软科幻需有自洽的理论体系',
    '外星文明需有独特性，不可照搬人类社会结构',
    '人工智能觉醒需有过程，不可突然产生意识',
    '太空旅行需考虑相对论效应，超光速需有理论支撑或设定',
    '基因改造需有伦理探讨，不可纯粹作为能力提升手段',
    '虚拟现实需有与现实的区分机制，不可让人迷失',
    '末日设定需有原因，自然灾害、科技失控、外星入侵等需有合理起因',
  ],

  prohibitions: [
    '禁止科技设定前后矛盾',
    '禁止出现违背已知物理定律的情节（除非有充分的理论支撑）',
    '禁止外星人形象过于人类化（除非有进化论解释）',
    '禁止人工智能的表现不符合其设定的智能水平',
    '禁止太空战斗像海战或空战一样简单',
    '禁止基因改造毫无副作用或伦理问题',
    '禁止时间旅行设定随意更改或矛盾',
    '禁止科技成为纯粹的魔法替代品',
  ],

  auditDimensions: [
    {
      id: 'scientific-logic',
      name: '科学逻辑',
      severity: 'critical',
      weight: 10,
      checkInstruction: '检查科技设定是否符合科学逻辑，是否有自洽的理论体系',
    },
    {
      id: 'worldbuilding',
      name: '世界观构建',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查未来世界设定是否完整，社会、科技、文化是否协调一致',
    },
    {
      id: 'tech-impact',
      name: '科技影响',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查科技对社会、伦理、人类的影响是否有深入探讨',
    },
    {
      id: 'character-professionalism',
      name: '角色专业度',
      severity: 'warning',
      weight: 8,
      checkInstruction: '检查科技从业者的言行是否专业，是否符合其背景设定',
    },
    {
      id: 'imagination-originality',
      name: '想象力原创性',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查科技设定是否有原创性，是否仅仅是现有概念的重复',
    },
    {
      id: 'philosophical-depth',
      name: '哲学深度',
      severity: 'info',
      weight: 7,
      checkInstruction: '检查是否有人文思考和哲学探讨，是否超越纯粹的科技描写',
    },
  ],

  pacingTemplate: [
    {
      phase: '开局',
      description: '展现未来世界的基本设定，引入主角和核心科技概念',
      wordCountRatio: 0.15,
      tensionLevel: 'low',
    },
    {
      phase: '探索',
      description: '主角深入探索科技或外星世界，发现不为人知的秘密',
      wordCountRatio: 0.2,
      tensionLevel: 'medium',
    },
    {
      phase: '危机',
      description: '科技失控、外星威胁或社会危机出现，主角面临重大挑战',
      wordCountRatio: 0.2,
      tensionLevel: 'high',
    },
    {
      phase: '抗争',
      description: '主角与团队努力解决危机，面临伦理抉择和牺牲',
      wordCountRatio: 0.2,
      tensionLevel: 'high',
    },
    {
      phase: '高潮',
      description: '最终决战或关键决策，决定人类或文明的命运',
      wordCountRatio: 0.15,
      tensionLevel: 'climax',
    },
    {
      phase: '收尾',
      description: '危机解决，留下对科技发展的思考和展望',
      wordCountRatio: 0.1,
      tensionLevel: 'low',
    },
  ],

  characterTypes: [
    {
      type: '科学家/工程师',
      description: '推动科技发展的核心人物，可能是主角或重要配角',
      requiredTraits: ['专业能力强', '求知欲旺盛', '有责任感', '理性思考'],
      avoidTraits: ['疯狂科学家', '毫无伦理底线', '纸上谈兵', '纯粹工具人'],
    },
    {
      type: '宇航员/探索者',
      description: '执行太空任务或探索未知领域的勇敢者',
      requiredTraits: ['勇敢无畏', '专业训练', '团队协作', '心理素质强'],
      avoidTraits: ['鲁莽冲动', '个人英雄主义', '毫无纪律', '恐惧太空'],
    },
    {
      type: 'AI/机器人',
      description: '具有高度智能的人工生命，可能有自我意识',
      requiredTraits: ['逻辑严密', '学习能力强', '有独特视角', '与人类有互动'],
      avoidTraits: ['纯粹工具', '突然觉醒', '毫无逻辑', '纯粹邪恶'],
    },
    {
      type: '反派/威胁源',
      description: '造成危机的源头，可能是人类、AI、外星人或科技本身',
      requiredTraits: ['有合理动机', '有威胁性', '有复杂性', '推动剧情'],
      avoidTraits: ['纯粹邪恶', '毫无逻辑', '动机牵强', '不堪一击'],
    },
    {
      type: '普通人类',
      description: '代表普通人视角的角色，帮助读者理解科技对人类的影响',
      requiredTraits: ['有真实感', '有情感深度', '有成长弧线', '有代表性'],
      avoidTraits: ['纯粹受害者', '毫无存在感', '过于愚蠢', '纯粹工具人'],
    },
  ],

  styleConstraints: {
    tone: ['理性冷静', '宏大叙事', '深邃思考', '紧张悬疑'],
    vocabulary: ['科技术语', '未来词汇', '专业术语', '哲学用语'],
    sentenceStyle: ['长短句结合', '描写科技时用精确语言', '探讨哲学时用思辨句式', '动作场景用快节奏短句'],
    forbiddenWords: ['卧槽', '牛逼', '我去', '666', '老铁', '扎心了', '奥利给'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
