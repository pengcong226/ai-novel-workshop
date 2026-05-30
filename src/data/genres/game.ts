import { GenreProfile } from '@/types/genreProfile'

export const gameProfile: GenreProfile = {
  id: 'game',
  name: '游戏竞技',
  description: '以电子游戏或竞技比赛为核心，描写玩家在游戏中成长、竞争、夺冠的故事，强调游戏设定和竞技精神。',

  writingRules: [
    '游戏设定需完整，包括游戏类型、职业/角色、技能、装备、等级等',
    '游戏机制需合理，不可出现破坏平衡的BUG或外挂（除非是剧情需要）',
    '竞技比赛需有专业感，比赛规则、战术配合、团队协作需有体现',
    '主角的成长需有过程，从菜鸟到大神需有合理的提升路径',
    '游戏术语需准确，涉及具体游戏时需有基本了解',
    '团队配合需有体现，MOBA、FPS等团队游戏需有战术和配合描写',
    '对手需有实力，不可全是菜鸟衬托主角',
    '游戏与现实需有平衡，不可完全沉迷游戏而忽视现实',
    '装备和技能需有逻辑，属性克制、技能搭配需合理',
    '比赛解说需专业，涉及电竞比赛时需有专业解说视角',
    '游戏经济需合理，金币、装备、材料的获取和消耗需平衡',
    '版本更新需有影响，游戏版本变化对比赛和玩家的影响需有体现',
    '游戏社交需真实，公会、组队、交易等社交系统需有描写',
    '作弊行为需有后果，使用外挂或作弊需有惩罚机制',
  ],

  genreRules: [
    '游戏职业需有特色，不同职业的技能和定位需有区分',
    'PVP和PVE需有区分，玩家对战和打怪升级需有不同的描写',
    '游戏BUG需有合理性，利用BUG获利需有风险',
    '电竞比赛需有赛制，从小组赛到淘汰赛需有完整赛程',
    '战队管理需有体现，选手转会、战队运营等需有描写',
    '游戏直播需有元素，主播、观众互动等可作为情节',
    '游戏与现实身份需有反差，游戏大神在现实中可能是普通人',
  ],

  prohibitions: [
    '禁止游戏设定过于简单或毫无逻辑',
    '禁止主角通过外挂或作弊获得胜利',
    '禁止比赛过程过于简单或毫无悬念',
    '禁止游戏术语使用错误或混乱',
    '禁止团队配合被个人英雄主义完全取代',
    '禁止游戏与现实完全割裂',
    '禁止出现严重的游戏常识错误',
    '禁止结局草率收场或虎头蛇尾',
  ],

  auditDimensions: [
    {
      id: 'game-setting',
      name: '游戏设定',
      severity: 'critical',
      weight: 10,
      checkInstruction: '检查游戏设定是否完整自洽，职业、技能、装备等是否合理',
    },
    {
      id: 'competitive-quality',
      name: '竞技质量',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查比赛描写是否专业，战术、配合、操作是否有质量',
    },
    {
      id: 'growth-logic',
      name: '成长逻辑',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查主角成长是否合理，是否有铺垫，是否过于突兀',
    },
    {
      id: 'game-reality-balance',
      name: '游戏现实平衡',
      severity: 'warning',
      weight: 8,
      checkInstruction: '检查游戏与现实的平衡，是否过度沉迷或完全割裂',
    },
    {
      id: 'team-dynamics',
      name: '团队互动',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查团队配合和互动是否真实，是否有化学反应',
    },
    {
      id: 'ending-satisfaction',
      name: '结局满意度',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查结局是否令人满意，是否符合竞技精神',
    },
  ],

  pacingTemplate: [
    {
      phase: '入坑',
      description: '主角接触游戏，展现游戏世界的基本设定',
      wordCountRatio: 0.15,
      tensionLevel: 'low',
    },
    {
      phase: '成长',
      description: '主角在游戏中快速成长，掌握游戏技巧，获得认可',
      wordCountRatio: 0.25,
      tensionLevel: 'medium',
    },
    {
      phase: '组队',
      description: '主角组建或加入战队，开始团队配合和训练',
      wordCountRatio: 0.15,
      tensionLevel: 'low',
    },
    {
      phase: '比赛',
      description: '主角参加各级比赛，从小组赛到淘汰赛，逐步晋级',
      wordCountRatio: 0.2,
      tensionLevel: 'high',
    },
    {
      phase: '决赛',
      description: '主角迎来最终决赛，与最强对手进行巅峰对决',
      wordCountRatio: 0.15,
      tensionLevel: 'climax',
    },
    {
      phase: '夺冠',
      description: '主角赢得冠军，实现梦想，展望未来',
      wordCountRatio: 0.1,
      tensionLevel: 'low',
    },
  ],

  characterTypes: [
    {
      type: '主角',
      description: '有游戏天赋的玩家，通过努力和智慧成为顶尖选手',
      requiredTraits: ['游戏天赋', '努力刻苦', '有领导力', '抗压能力强'],
      avoidTraits: ['开挂作弊', '个人主义', '心态易崩', '毫无团队意识'],
    },
    {
      type: '队友',
      description: '主角的战队成员，各有特色和定位',
      requiredTraits: ['配合默契', '各有专长', '有团队精神', '有成长空间'],
      avoidTraits: ['内讧不断', '毫无特点', '拖后腿', '纯粹工具人'],
    },
    {
      type: '对手',
      description: '与主角竞争的顶尖选手或战队',
      requiredTraits: ['实力强大', '有风格', '有尊严', '推动主角成长'],
      avoidTraits: ['纯粹恶人', '毫无底线', '不堪一击', '动机牵强'],
    },
    {
      type: '教练/分析师',
      description: '指导主角和战队的战术专家',
      requiredTraits: ['专业能力强', '眼光独到', '善于指导', '有经验'],
      avoidTraits: ['误人子弟', '毫无战术', '纯粹摆设', '不懂游戏'],
    },
    {
      type: '粉丝/观众',
      description: '关注主角和比赛的观众群体',
      requiredTraits: ['有代表性', '推动剧情', '有情感共鸣', '有互动'],
      avoidTraits: ['盲目崇拜', '网络暴力', '毫无存在感', '纯粹工具人'],
    },
  ],

  styleConstraints: {
    tone: ['热血激昂', '轻松幽默', '紧张刺激', '青春活力'],
    vocabulary: ['游戏术语', '电竞用语', '网络流行语', '竞技比赛词汇'],
    sentenceStyle: ['短句增强节奏感', '比赛场景用快节奏', '团队互动用对话推动', '技术描写用专业术语'],
    forbiddenWords: ['之乎者也', '吾', '汝', '尔等', '岂非', '何故'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
