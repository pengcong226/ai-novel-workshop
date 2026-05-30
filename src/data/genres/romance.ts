import { GenreProfile } from '@/types/genreProfile'

export const romanceProfile: GenreProfile = {
  id: 'romance',
  name: '言情',
  description: '以爱情为核心，描写男女主角从相识、相知到相爱的过程，注重情感描写和人物关系发展，可以是现代或古代背景。',

  writingRules: [
    '情感发展需有层次，从初识的好感、暧昧、心动到确定关系需有过程',
    '人物魅力需突出，男女主角需有独特的吸引力，让读者能理解为什么会爱上',
    '互动细节需丰富，眼神、肢体语言、小动作等细节需有体现',
    '误会和矛盾需合理，推动情节的误会需有现实基础，不可过于狗血',
    '情感高潮需有铺垫，表白、初吻、确认关系等关键场景需有充分铺垫',
    '配角感情线需有节制，不可喧宾夺主，需为主线服务',
    '人物成长需与感情同步，角色需在感情中成长和改变',
    '甜蜜场景需有节制，不可一味发糖，需有张有弛',
    '虐心场景需有分寸，过度虐心会让读者弃文，需有希望和温暖',
    '第三者设定需有新意，不可简单脸谱化，需有其合理性',
    '家庭因素需有考虑，门第、父母态度等现实因素需有体现',
    '职业设定需专业，涉及特定职业时需有基本了解',
    '结局需令人满意，言情小说结局通常需要圆满，悲剧需有充分铺垫',
    '系列作品需保持人物性格一致性',
  ],

  genreRules: [
    '主角需有CP感，两人的互动需有化学反应',
    '情感线需清晰，不可同时暧昧多人（除非设定如此）',
    '亲密场景需有情感基础，不可为了发糖而发糖',
    '误会需及时解除，不可拖沓让读者烦躁',
    '配角需有边界感，不可过度介入主角感情',
    '情感转变需有理由，从讨厌到喜欢需有合理的转折点',
    '现代言情需有现实感，古代言情需有时代特色',
  ],

  prohibitions: [
    '禁止情感发展过于突兀或毫无铺垫',
    '禁止出现违反伦理道德的情感关系',
    '禁止过度美化病态关系（如家暴、控制狂等）',
    '禁止配角感情线完全复制主角感情线',
    '禁止为了制造冲突而强行降智',
    '禁止出现严重的价值观问题',
    '禁止亲密场景过于露骨或低俗',
    '禁止结局草率收场或烂尾',
  ],

  auditDimensions: [
    {
      id: 'emotional-development',
      name: '情感发展',
      severity: 'critical',
      weight: 10,
      checkInstruction: '检查情感发展是否自然，是否有充分铺垫，是否过于突兀或狗血',
    },
    {
      id: 'character-chemistry',
      name: 'CP感',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查男女主角是否有化学反应，互动是否有趣或感人',
    },
    {
      id: 'emotional-depth',
      name: '情感深度',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查情感描写是否细腻，是否能引起读者共鸣',
    },
    {
      id: 'pacing-balance',
      name: '甜虐平衡',
      severity: 'warning',
      weight: 8,
      checkInstruction: '检查甜蜜和虐心场景的比例是否合理，节奏是否张弛有度',
    },
    {
      id: 'character-growth',
      name: '角色成长',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查角色是否在感情中成长，是否有变化和发展',
    },
    {
      id: 'ending-satisfaction',
      name: '结局满意度',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查结局是否令人满意，是否符合读者期待，是否有升华',
    },
  ],

  pacingTemplate: [
    {
      phase: '初遇',
      description: '男女主角初次相遇，留下第一印象，可能美好也可能糟糕',
      wordCountRatio: 0.15,
      tensionLevel: 'low',
    },
    {
      phase: '互动',
      description: '两人因各种原因频繁接触，逐渐了解彼此',
      wordCountRatio: 0.25,
      tensionLevel: 'low',
    },
    {
      phase: '心动',
      description: '两人开始对对方产生好感，但可能还未意识到或不敢承认',
      wordCountRatio: 0.15,
      tensionLevel: 'medium',
    },
    {
      phase: '波折',
      description: '出现误会、第三者或外部阻碍，两人关系面临考验',
      wordCountRatio: 0.2,
      tensionLevel: 'high',
    },
    {
      phase: '确认',
      description: '误会解除，两人确认关系，感情升温',
      wordCountRatio: 0.15,
      tensionLevel: 'medium',
    },
    {
      phase: '圆满',
      description: '两人克服所有困难，迎来幸福结局',
      wordCountRatio: 0.1,
      tensionLevel: 'low',
    },
  ],

  characterTypes: [
    {
      type: '男主角',
      description: '女主的真命天子，通常有独特的魅力和背景',
      requiredTraits: ['有魅力', '有能力', '对女主专一', '有担当'],
      avoidTraits: ['渣男', '中央空调', '毫无担当', '过于完美'],
    },
    {
      type: '女主角',
      description: '故事的核心视角，通常有自己的目标和成长',
      requiredTraits: ['有独立人格', '有成长弧线', '有吸引力', '有智慧'],
      avoidTraits: ['恋爱脑', '毫无主见', '过于软弱', '纯粹花瓶'],
    },
    {
      type: '情敌/第三者',
      description: '与主角争夺爱情的对手，可能是青梅竹马或新出现的角色',
      requiredTraits: ['有魅力', '有合理动机', '有复杂性', '推动剧情'],
      avoidTraits: ['纯粹恶毒', '毫无底线', '动机牵强', '纯粹工具人'],
    },
    {
      type: '闺蜜/兄弟',
      description: '主角的亲密朋友，提供情感支持和建议',
      requiredTraits: ['忠诚可靠', '有幽默感', '有洞察力', '有自己的生活'],
      avoidTraits: ['背叛成性', '八卦过度', '毫无存在感', '纯粹搞笑'],
    },
    {
      type: '家长/长辈',
      description: '影响主角感情的重要长辈，可能是支持者或阻碍者',
      requiredTraits: ['有立场', '有合理性', '有影响力', '推动剧情'],
      avoidTraits: ['纯粹恶人', '毫无逻辑', '过于开明', '毫无存在感'],
    },
  ],

  styleConstraints: {
    tone: ['甜蜜温馨', '虐心感人', '轻松幽默', '温暖治愈'],
    vocabulary: ['情感描写词汇', '日常生活用语', '浪漫表达', '心理描写'],
    sentenceStyle: ['细腻的心理描写', '对话推动感情发展', '细节描写增强代入感', '场景描写烘托氛围'],
    forbiddenWords: ['卧槽', '牛逼', '我去', '666', '老铁', '扎心了', '奥利给'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
