import { GenreProfile } from '@/types/genreProfile'

export const urbanProfile: GenreProfile = {
  id: 'urban',
  name: '都市现实',
  description: '以现代都市为背景，描写普通人在社会中奋斗、成长的故事，注重现实主义和人性刻画，反映当代社会问题。',

  writingRules: [
    '背景设定需符合当代中国社会现实，城市、交通、生活细节需真实可信',
    '人物对话需自然口语化，符合人物身份和年龄，避免书面化或文言化',
    '职场描写需专业真实，不同行业的运作方式、术语需准确',
    '人际关系需符合现实逻辑，利益纠葛、人情世故需有真实感',
    '经济描写需合理，收入、房价、消费水平需符合现实',
    '情感发展需有铺垫，一见钟情需有合理原因，日久生情需有时间跨度',
    '冲突来源需现实，职场竞争、家庭矛盾、社会压力等需有真实感',
    '主角的成长需有代价，成功需付出努力，不可轻易获得财富或地位',
    '配角需有独立人格，不可为主角服务而存在，需有自己的目标和动机',
    '社会背景需与时俱进，使用当下的科技产品和生活方式',
    '法律和道德底线需遵守，不可美化违法行为',
    '家庭关系需真实，父母、兄弟姐妹、亲戚间的互动需符合现实',
    '疾病、意外等情节需有医学常识支撑，不可胡编乱造',
    '地域文化需有体现，不同城市的特色需有描写',
  ],

  genreRules: [
    '主角的初始设定需合理，不可一开始就是顶级富豪或权贵',
    '商业情节需有逻辑，创业、投资、经营需有基本的商业常识',
    '职场晋升需有过程，不可一步登天，需有能力和机遇的双重作用',
    '情感线需有现实基础，门当户对、三观一致等现实因素需考虑',
    '社会问题需有正面引导，不可过度渲染负面情绪',
    '反派需有合理动机，不可纯粹为恶，需有其立场和理由',
    '结局需合理，不可过于理想化，需有现实的妥协和遗憾',
  ],

  prohibitions: [
    '禁止出现超自然元素（除非明确标注是都市异能类）',
    '禁止主角无理由地获得巨额财富或权力',
    '禁止出现违反现实逻辑的情节',
    '禁止过度美化违法行为或灰色地带',
    '禁止人物行为不符合其身份设定',
    '禁止出现严重的常识性错误',
    '禁止情感发展过于突兀或狗血',
    '禁止出现严重的价值观扭曲',
  ],

  auditDimensions: [
    {
      id: 'realism',
      name: '现实合理性',
      severity: 'critical',
      weight: 10,
      checkInstruction: '检查情节是否符合现实逻辑，人物行为是否合理，是否有脱离现实的设定',
    },
    {
      id: 'character-depth',
      name: '人物深度',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查人物是否立体，性格是否鲜明，行为动机是否充分，是否有成长弧线',
    },
    {
      id: 'social-sensitivity',
      name: '社会敏感度',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查是否涉及敏感社会议题，处理方式是否得当，是否有价值观问题',
    },
    {
      id: 'dialogue-naturalness',
      name: '对话自然度',
      severity: 'warning',
      weight: 8,
      checkInstruction: '检查人物对话是否自然口语化，是否符合人物身份和年龄',
    },
    {
      id: 'professional-accuracy',
      name: '专业准确性',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查职场、商业、法律等专业描写是否准确，是否有常识性错误',
    },
    {
      id: 'emotional-resonance',
      name: '情感共鸣',
      severity: 'info',
      weight: 7,
      checkInstruction: '检查情感描写是否能引起读者共鸣，是否过于煽情或冷漠',
    },
  ],

  pacingTemplate: [
    {
      phase: '开局',
      description: '主角登场，展现当前生活状态和面临的主要问题',
      wordCountRatio: 0.15,
      tensionLevel: 'low',
    },
    {
      phase: '转折',
      description: '主角遭遇重大变故或机遇，生活轨迹发生改变',
      wordCountRatio: 0.2,
      tensionLevel: 'medium',
    },
    {
      phase: '奋斗',
      description: '主角在新的环境中努力拼搏，面临各种挑战和困难',
      wordCountRatio: 0.25,
      tensionLevel: 'medium',
    },
    {
      phase: '危机',
      description: '主角遭遇重大危机，可能是事业、情感或家庭方面的打击',
      wordCountRatio: 0.15,
      tensionLevel: 'high',
    },
    {
      phase: '突破',
      description: '主角凭借努力和智慧突破困境，迎来事业或人生的转折',
      wordCountRatio: 0.15,
      tensionLevel: 'high',
    },
    {
      phase: '收尾',
      description: '主角解决主要矛盾，生活步入正轨，展望未来',
      wordCountRatio: 0.1,
      tensionLevel: 'low',
    },
  ],

  characterTypes: [
    {
      type: '主角',
      description: '普通的都市青年，通过努力和智慧在社会中奋斗成长',
      requiredTraits: ['上进心', '适应能力', '情商在线', '有底线'],
      avoidTraits: ['懒惰成性', '好高骛远', '道德败坏', '毫无原则'],
    },
    {
      type: '职场导师',
      description: '在职场或人生道路上给予主角指导的前辈或领导',
      requiredTraits: ['经验丰富', '眼光独到', '愿意提携后辈', '有自己的原则'],
      avoidTraits: ['老谋深算', '利用后辈', '嫉贤妒能', '过于理想化'],
    },
    {
      type: '竞争对手',
      description: '与主角在职场或商场上竞争的对手',
      requiredTraits: ['能力出众', '有野心', '有底线', '有成长空间'],
      avoidTraits: ['纯粹恶人', '毫无底线', '愚蠢至极', '纯粹工具人'],
    },
    {
      type: '情感对象',
      description: '与主角产生情感纠葛的对象',
      requiredTraits: ['独立人格', '三观相符', '有吸引力', '有共同话题'],
      avoidTraits: ['花瓶摆设', '拜金主义', '毫无主见', '纯粹工具人'],
    },
    {
      type: '挚友/损友',
      description: '主角的好朋友，可能是一起长大的发小或工作后认识的',
      requiredTraits: ['重情重义', '性格互补', '关键时刻靠得住', '有幽默感'],
      avoidTraits: ['背叛成性', '嫉妒心强', '不学无术', '纯粹搞笑工具人'],
    },
  ],

  styleConstraints: {
    tone: ['现实主义', '温暖治愈', '轻松幽默', '深刻反思'],
    vocabulary: ['现代口语', '网络用语适度使用', '职场术语', '生活化表达'],
    sentenceStyle: ['对话为主推动情节', '叙述简洁明快', '心理描写细腻'],
    forbiddenWords: ['之乎者也', '吾', '汝', '尔等', '岂非', '何故'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
