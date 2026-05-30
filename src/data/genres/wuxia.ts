import { GenreProfile } from '@/types/genreProfile'

export const wuxiaProfile: GenreProfile = {
  id: 'wuxia',
  name: '武侠江湖',
  description: '以江湖为舞台，描写侠客行侠仗义、快意恩仇的故事，强调武学境界、侠义精神和江湖规矩。',

  writingRules: [
    '武学体系需完整，内功、外功、轻功、暗器等需有明确划分和等级',
    '招式描写需有画面感，每一招每一式需有攻防逻辑，不可乱打一气',
    '内力设定需合理，内力深厚程度与修炼时长、天赋、功法相关',
    '江湖规矩需有体现，门派之见、辈分尊卑、恩怨情仇需有江湖特色',
    '侠义精神需贯穿全文，主角需有"侠之大者，为国为民"的情怀',
    '门派设定需有特色，不同门派的武功风格、门规、文化需有区分',
    '江湖势力需平衡，武林盟主、各大门派、邪教魔教之间需有制衡',
    '比武场景需有层次，从切磋到生死决斗需有不同的描写方式',
    '轻功描写需有美感，飞檐走壁、水上漂等需有飘逸感',
    '点穴、解穴等江湖技艺需有基本设定，不可随意使用',
    '神兵利器需有来历，宝剑、宝刀等需有传承或特殊锻造过程',
    '江湖情报需有渠道，酒楼、茶馆、情报组织等需有设定',
    '毒药需有设定，用毒、解毒需有逻辑，不可无解或万能',
    '历史背景可虚可实，但需保持风格统一',
  ],

  genreRules: [
    '内力修炼需循序渐进，不可通过简单传授就获得深厚内力',
    '招式需有名号，"降龙十八掌"、"独孤九剑"等需有招式名',
    '轻功需有极限，不可无限飞行或瞬间移动',
    '点穴需有时间限制，被点穴者需在一定时间内解穴或自解',
    '江湖恩怨需有因果，仇恨来源需有合理性',
    '正邪之分需有探讨，不可简单脸谱化，需有灰色地带',
    '武林秘籍需有争夺，秘籍的稀有性和价值需有体现',
  ],

  prohibitions: [
    '禁止出现现代用语或科技元素',
    '禁止武学体系过于玄幻，需保持在武侠范畴内',
    '禁止内力或招式毫无限制地使用',
    '禁止江湖规矩被随意打破而无后果',
    '禁止角色行为不符合侠义精神（除非是反派）',
    '禁止战斗描写过于简单或毫无技巧',
    '禁止出现与武侠风格不符的元素',
    '禁止结局过于黑暗或毫无侠义精神',
  ],

  auditDimensions: [
    {
      id: 'martial-arts-system',
      name: '武学体系',
      severity: 'critical',
      weight: 10,
      checkInstruction: '检查武学体系是否完整自洽，内力、招式、轻功等设定是否合理',
    },
    {
      id: 'chivalry-spirit',
      name: '侠义精神',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查是否体现侠义精神，主角行为是否符合"侠"的标准',
    },
    {
      id: 'jianghu-atmosphere',
      name: '江湖氛围',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查江湖描写是否有氛围感，门派、规矩、恩怨是否立体',
    },
    {
      id: 'combat-quality',
      name: '战斗质量',
      severity: 'warning',
      weight: 8,
      checkInstruction: '检查战斗描写是否有质量，招式是否有画面感和攻防逻辑',
    },
    {
      id: 'character-distinction',
      name: '角色区分度',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查不同角色的武功风格、性格特点是否有区分度',
    },
    {
      id: 'plot-logic',
      name: '剧情逻辑',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查剧情发展是否合理，恩怨情仇是否有逻辑支撑',
    },
  ],

  pacingTemplate: [
    {
      phase: '入江湖',
      description: '主角初入江湖，拜师学艺或获得武学传承',
      wordCountRatio: 0.15,
      tensionLevel: 'low',
    },
    {
      phase: '闯江湖',
      description: '主角开始行走江湖，行侠仗义，结识朋友和敌人',
      wordCountRatio: 0.25,
      tensionLevel: 'medium',
    },
    {
      phase: '结恩怨',
      description: '主角卷入江湖恩怨，与各方势力产生冲突',
      wordCountRatio: 0.2,
      tensionLevel: 'high',
    },
    {
      phase: '悟武道',
      description: '主角在磨砺中领悟武学真谛，武功大进',
      wordCountRatio: 0.15,
      tensionLevel: 'medium',
    },
    {
      phase: '报恩仇',
      description: '主角与宿敌进行最终决战，解决所有恩怨',
      wordCountRatio: 0.15,
      tensionLevel: 'climax',
    },
    {
      phase: '隐江湖',
      description: '主角功成身退，或继续行走江湖，留下传说',
      wordCountRatio: 0.1,
      tensionLevel: 'low',
    },
  ],

  characterTypes: [
    {
      type: '侠客',
      description: '行走江湖的侠义之士，以行侠仗义为己任',
      requiredTraits: ['侠义心肠', '武功高强', '重情重义', '光明磊落'],
      avoidTraits: ['卑鄙无耻', '恃强凌弱', '贪生怕死', '背信弃义'],
    },
    {
      type: '师父',
      description: '传授主角武艺的高人，通常是隐世高手或门派长老',
      requiredTraits: ['武功深不可测', '德高望重', '慧眼识珠', '严慈相济'],
      avoidTraits: ['误人子弟', '心胸狭隘', '卖徒求荣', '毫无原则'],
    },
    {
      type: '红颜知己',
      description: '与主角有情感纠葛的江湖女子，通常武功不俗',
      requiredTraits: ['美貌与智慧并重', '武功不俗', '有独立人格', '重情重义'],
      avoidTraits: ['花瓶摆设', '无脑痴情', '拖累主角', '毫无特色'],
    },
    {
      type: '邪派高手',
      description: '与正派对立的反派，通常修炼邪功或有野心',
      requiredTraits: ['武功高强', '有野心', '有手段', '有故事背景'],
      avoidTraits: ['纯粹恶人', '毫无底线', '愚蠢至极', '不堪一击'],
    },
    {
      type: '兄弟/搭档',
      description: '与主角并肩作战的伙伴，通常性格互补',
      requiredTraits: ['重情重义', '武功不俗', '性格互补', '关键时刻靠得住'],
      avoidTraits: ['背叛成性', '嫉妒心强', '毫无主见', '纯粹工具人'],
    },
  ],

  styleConstraints: {
    tone: ['快意恩仇', '侠骨柔情', '豪迈洒脱', '江湖气息'],
    vocabulary: ['武侠术语', '江湖用语', '古典诗词意境', '武学招式名'],
    sentenceStyle: ['短句增强节奏感', '招式描写用快节奏', '情感戏用细腻笔触', '场景描写有画面感'],
    forbiddenWords: ['卧槽', '牛逼', '我去', '666', '老铁', '扎心了', '奥利给'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
