import { GenreProfile } from '@/types/genreProfile'

export const xianxiaProfile: GenreProfile = {
  id: 'xianxia',
  name: '仙侠',
  description: '以道家思想为底蕴，融合仙侠文化，描写修仙者追求长生、感悟天道、渡劫飞升的故事，强调意境和哲理。',

  writingRules: [
    '修炼体系需以道家思想为根基，强调"道法自然"、"天人合一"的哲学理念',
    '境界划分需有明确的感悟要求，不仅仅是力量提升，更是心境和对"道"的理解',
    '战斗描写需体现仙侠飘逸感，法术需有美感，避免纯粹的力量对轰',
    '法宝需有来历和故事，最好是上古传承或天地造化，避免随意炼制',
    '世界观需融合神话传说，仙界、凡间、幽冥等不同层次需有清晰划分',
    '主角需有"道心"，修炼动力需超越单纯的力量追求，有更高的精神目标',
    '劫难需有深意，不仅是实力考验，更是心性和悟性的试炼',
    '配角需各有其"道"，不同修士追求不同的大道，形成对比和映照',
    '天道需有意志，因果轮回、劫数难逃等设定需贯穿全文',
    '仙侠背景需有诗意，场景描写需有意境，避免过于直白',
    '飞升仙界需有严格条件，不可轻易突破，需有"万年难遇"的稀缺感',
    '宗门设定需有仙侠特色，道观、洞府、仙山等场景需有氛围感',
    '寿元设定需合理，修仙者寿命与境界挂钩，长生是核心追求之一',
    '情劫是重要情节，修仙者的情感需克制，与凡人的情感需有悲剧色彩',
  ],

  genreRules: [
    '修炼需打坐吐纳，吸收天地灵气，不可仅靠丹药或外物突破',
    '渡劫需有天劫降临，劫雷强度与境界和天赋相关，需有"四九天劫"等分层设定',
    '仙器需有器灵，或有特殊的天地印记，不可批量生产',
    '悟道需有契机，可能是观山水、读道经、经历生死等，不可凭空领悟',
    '仙界需有严格的等级制度，仙人、真仙、金仙、大罗金仙等划分需清晰',
    '转世重修需有代价，保留前世记忆或修为需有特殊设定支撑',
    '天道反噬需有体现，违背天道或使用禁术需有相应代价',
  ],

  prohibitions: [
    '禁止出现现代用语或科技元素',
    '禁止修仙者表现得像普通人一样随意',
    '禁止飞升仙界过于简单或随意',
    '禁止天道设定前后矛盾或被随意打破',
    '禁止仙人表现得毫无仙风道骨',
    '禁止出现与道家思想严重冲突的情节',
    '禁止战斗描写过于暴力血腥，需保持仙侠的飘逸感',
    '禁止因果轮回设定被随意破坏',
  ],

  auditDimensions: [
    {
      id: 'philosophy',
      name: '道家哲学',
      severity: 'critical',
      weight: 10,
      checkInstruction: '检查是否融入道家思想，修炼感悟是否有哲理深度，是否体现"道法自然"',
    },
    {
      id: 'immortal-atmosphere',
      name: '仙侠氛围',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查场景描写是否有仙侠意境，用词是否符合古典审美，是否避免现代感',
    },
    {
      id: 'power-system',
      name: '修炼体系',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查修炼体系是否完整，境界划分是否清晰，突破条件是否合理',
    },
    {
      id: 'cause-effect',
      name: '因果轮回',
      severity: 'warning',
      weight: 8,
      checkInstruction: '检查因果设定是否贯穿全文，角色行为是否有因果报应，天道是否公正',
    },
    {
      id: 'emotional-depth',
      name: '情感深度',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查情感描写是否有深度，情劫处理是否得当，是否避免无脑恋爱',
    },
    {
      id: 'timeline',
      name: '时间线',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查修仙时间跨度是否合理，寿元消耗是否正确，时代背景是否一致',
    },
  ],

  pacingTemplate: [
    {
      phase: '入道',
      description: '主角因机缘或命运踏入修仙之路，初识修仙世界',
      wordCountRatio: 0.15,
      tensionLevel: 'low',
    },
    {
      phase: '修行',
      description: '主角拜入宗门或隐世高人门下，系统学习修仙之法',
      wordCountRatio: 0.2,
      tensionLevel: 'low',
    },
    {
      phase: '历劫',
      description: '主角遭遇心劫、情劫或天劫，修炼之路遭遇重大挫折',
      wordCountRatio: 0.2,
      tensionLevel: 'high',
    },
    {
      phase: '悟道',
      description: '主角在历劫中感悟大道，心境突破，实力随之提升',
      wordCountRatio: 0.15,
      tensionLevel: 'medium',
    },
    {
      phase: '飞升',
      description: '主角迎来最终天劫，渡劫飞升，或与宿敌进行最终决战',
      wordCountRatio: 0.2,
      tensionLevel: 'climax',
    },
    {
      phase: '归真',
      description: '主角成功飞升或解决所有因果，回归本真，故事收尾',
      wordCountRatio: 0.1,
      tensionLevel: 'low',
    },
  ],

  characterTypes: [
    {
      type: '主角',
      description: '具有仙缘或特殊体质的修仙者，追求长生和大道',
      requiredTraits: ['道心坚定', '悟性超群', '仙缘深厚', '不为外物所动'],
      avoidTraits: ['贪恋红尘', '心浮气躁', '急功近利', '沉迷权势'],
    },
    {
      type: '仙人/高人',
      description: '已经得道成仙或境界极高的存在，通常隐世不出',
      requiredTraits: ['仙风道骨', '深不可测', '超脱世俗', '指点迷津'],
      avoidTraits: ['贪恋凡尘', '心胸狭隘', '斤斤计较', '故弄玄虚'],
    },
    {
      type: '妖魔',
      description: '修炼成精的妖物或堕入魔道的修士，与正道对立',
      requiredTraits: ['实力强大', '有执念', '有故事背景', '非纯粹邪恶'],
      avoidTraits: ['愚蠢至极', '毫无底线', '纯粹工具人', '不堪一击'],
    },
    {
      type: '红颜知己',
      description: '与主角有情感纠葛的女修，可能是仙子、妖女或凡人',
      requiredTraits: ['容貌脱俗', '修为不俗', '有独立人格', '情感克制'],
      avoidTraits: ['花瓶摆设', '无脑痴情', '拖累主角', '毫无特色'],
    },
  ],

  styleConstraints: {
    tone: ['空灵飘逸', '古朴典雅', '神秘悠远', '超凡脱俗'],
    vocabulary: ['道家术语', '古典诗词意境', '仙侠特有词汇', '佛道经典用语'],
    sentenceStyle: ['长短句结合，营造意境', '多用四字成语和古风句式', '描写场景时注重画面感'],
    forbiddenWords: ['卧槽', '牛逼', '我去', '666', '老铁', '扎心了', '奥利给', '老子', '特么'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
