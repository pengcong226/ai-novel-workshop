import { GenreProfile } from '@/types/genreProfile'

export const historyProfile: GenreProfile = {
  id: 'history',
  name: '历史军事',
  description: '以真实历史为背景或架空历史世界，描写战争、权谋、英雄崛起的故事，注重历史细节和军事策略的准确性。',

  writingRules: [
    '历史背景需有据可查，涉及真实历史事件和人物时需符合史实或有合理的艺术加工',
    '军事描写需专业，阵法、战术、武器装备需符合时代特征',
    '政治权谋需有深度，朝堂斗争、派系争权需有逻辑支撑',
    '人物塑造需立体，历史人物需有其真实性格特征，虚构人物需有时代烙印',
    '战争场面需有全局视角，既要有宏观的战略布局，也要有微观的战斗细节',
    '社会风貌需真实，衣食住行、礼仪习俗、文化特色需有考据',
    '语言风格需符合时代，古代背景需适度使用文言，但以现代读者能理解为准',
    '主角的崛起需有过程，从默默无闻到权倾天下需有合理的成长路径',
    '配角需有各自立场，不同阵营的人物需有其合理性，不可脸谱化',
    '历史走向需有敬畏，重大历史事件不可随意篡改，架空需有明确说明',
    '经济基础需合理，古代的农业、手工业、商业运作需有基本了解',
    '地理环境需准确，涉及真实地名时需符合实际地理特征',
    '文化传承需有体现，诗词歌赋、哲学思想、科技发展需融入故事',
  ],

  genreRules: [
    '架空历史需建立完整的世界观，包括朝代、制度、疆域等设定',
    '战争描写需考虑后勤补给、士气、地形等因素，不可纯粹比拼武力',
    '政治斗争需有派系支撑，不可一人之力改变朝堂格局',
    '主角需有政治智慧，单纯的武力值在权谋斗争中作用有限',
    '历史转折点需有多种因素共同作用，不可归因于单一事件',
    '女性角色需符合时代背景，但也可突破时代限制展现其独特价值',
    '少数民族或周边国家的描写需客观公正，避免民族主义偏见',
  ],

  prohibitions: [
    '禁止严重歪曲历史事实（除非明确标注架空）',
    '禁止出现穿越者的现代知识碾压古人智商的情节',
    '禁止出现不符合时代的科技或物品',
    '禁止战争描写过于儿戏，需有战略战术思考',
    '禁止政治斗争过于简单化，需有复杂的利益博弈',
    '禁止出现民族歧视或历史虚无主义',
    '禁止人物行为不符合其时代背景和身份',
    '禁止过度美化战争或暴力',
  ],

  auditDimensions: [
    {
      id: 'historical-accuracy',
      name: '历史准确性',
      severity: 'critical',
      weight: 10,
      checkInstruction: '检查历史背景、事件、人物是否准确，艺术加工是否合理',
    },
    {
      id: 'military-logic',
      name: '军事逻辑',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查战争描写是否专业，战术战略是否合理，是否考虑后勤、地形等因素',
    },
    {
      id: 'political-depth',
      name: '政治深度',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查政治斗争是否有深度，派系博弈是否合理，权谋是否高明',
    },
    {
      id: 'social-portrayal',
      name: '社会风貌',
      severity: 'warning',
      weight: 8,
      checkInstruction: '检查社会描写是否真实，衣食住行、礼仪习俗是否符合时代',
    },
    {
      id: 'character-authenticity',
      name: '人物真实性',
      severity: 'warning',
      weight: 8,
      checkInstruction: '检查人物是否符合时代特征，历史人物是否保持其真实性格',
    },
    {
      id: 'cultural-integration',
      name: '文化融入',
      severity: 'info',
      weight: 7,
      checkInstruction: '检查文化元素是否自然融入，诗词、哲学、科技是否有体现',
    },
  ],

  pacingTemplate: [
    {
      phase: '开局',
      description: '主角登场，展现其身份和所处的历史环境',
      wordCountRatio: 0.1,
      tensionLevel: 'low',
    },
    {
      phase: '崛起',
      description: '主角开始崭露头角，获得第一个胜利或成就',
      wordCountRatio: 0.2,
      tensionLevel: 'medium',
    },
    {
      phase: '权谋',
      description: '主角卷入政治斗争，开始学习权谋之道',
      wordCountRatio: 0.2,
      tensionLevel: 'medium',
    },
    {
      phase: '危机',
      description: '主角遭遇重大政治或军事危机，面临生死存亡',
      wordCountRatio: 0.2,
      tensionLevel: 'high',
    },
    {
      phase: '决战',
      description: '主角迎来最终的军事或政治决战，决定天下归属',
      wordCountRatio: 0.2,
      tensionLevel: 'climax',
    },
    {
      phase: '收尾',
      description: '主角胜利，建立新秩序，展望未来',
      wordCountRatio: 0.1,
      tensionLevel: 'low',
    },
  ],

  characterTypes: [
    {
      type: '主角',
      description: '具有雄才大略的领袖人物，可能是帝王、将军或谋士',
      requiredTraits: ['雄才大略', '知人善任', '坚韧不拔', '有战略眼光'],
      avoidTraits: ['优柔寡断', '刚愎自用', '残暴不仁', '目光短浅'],
    },
    {
      type: '谋士/军师',
      description: '为主角出谋划策的智囊，通常足智多谋',
      requiredTraits: ['足智多谋', '洞察人心', '忠诚可靠', '善于布局'],
      avoidTraits: ['卖主求荣', '嫉贤妒能', '纸上谈兵', '毫无原则'],
    },
    {
      type: '猛将',
      description: '为主角冲锋陷阵的武将，武力值极高',
      requiredTraits: ['勇猛善战', '忠心耿耿', '有军事才能', '重情重义'],
      avoidTraits: ['有勇无谋', '桀骜不驯', '残暴嗜杀', '背叛成性'],
    },
    {
      type: '对手/枭雄',
      description: '与主角争霸天下的对手，通常也是雄才大略之人',
      requiredTraits: ['雄才大略', '有魅力', '有手段', '有底线'],
      avoidTraits: ['愚蠢至极', '残暴无度', '纯粹恶人', '不堪一击'],
    },
    {
      type: '红颜/贤内助',
      description: '主角背后支持的女性，可能是皇后、才女或奇女子',
      requiredTraits: ['智慧过人', '有政治眼光', '贤良淑德', '关键时刻能帮忙'],
      avoidTraits: ['干政乱权', '嫉妒成性', '花瓶摆设', '毫无主见'],
    },
  ],

  styleConstraints: {
    tone: ['厚重深沉', '大气磅礴', '热血激昂', '权谋深邃'],
    vocabulary: ['古风用语', '军事术语', '政治术语', '历史典故'],
    sentenceStyle: ['长短句结合', '多用四字成语', '对话体现人物身份', '战争场面用短句增强节奏感'],
    forbiddenWords: ['卧槽', '牛逼', '我去', '666', '老铁', '扎心了', '奥利给'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
