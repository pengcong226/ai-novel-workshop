import { GenreProfile } from '@/types/genreProfile'

export const xuanhuanProfile: GenreProfile = {
  id: 'xuanhuan',
  name: '玄幻修仙',
  description: '以修炼升级为核心，构建庞大的力量体系和世界观，主角通过不断突破境界、获取机缘，最终登顶巅峰的幻想类小说。',

  writingRules: [
    '修炼体系必须完整且逻辑自洽，每个境界的突破条件、实力表现、寿元变化需明确',
    '境界划分需有明确的层级递进关系，避免出现跳级或境界模糊的情况',
    '战斗描写需体现境界差异，低阶修士在高阶修士面前应有明显的实力鸿沟',
    '法宝、丹药、功法等设定需符合对应境界的威能，避免出现低阶神器碾压高阶的情况',
    '世界观需宏大但有序，不同区域、不同势力的设定需有层次感',
    '主角的升级速度需合理，既要有爽感又不能过于突兀，需有足够的铺垫和契机',
    '奇遇和机缘需有伏笔，避免凭空出现，需与世界观设定相呼应',
    '配角的实力成长需与主角保持一定的关联性，避免完全停滞或突然超越',
    '战斗系统需有特色，法术、体修、阵法、炼器等不同流派需有明确的优劣势',
    '时间线需清晰，修炼动辄百千年，需注意时代背景和人物年龄的一致性',
    '势力分布需合理，宗门、家族、散修等不同势力间的关系需有逻辑支撑',
    '资源争夺是核心冲突之一，灵石、天材地宝等资源的稀缺性需合理设定',
    '渡劫突破是高潮情节，需有充分的铺垫和紧张感，避免草率处理',
    '主角的人际关系网需随境界提升而扩展，从宗门到区域再到全域',
    '道侣、师徒、同门等关系需有情感基础，避免纯粹的利益结合',
  ],

  genreRules: [
    '修炼体系需遵循"炼气-筑基-金丹-元婴-化神-大乘-渡劫"的基本框架，可在此基础上扩展',
    '丹药需分品级，服用需有限制，避免出现嗑药升级的无脑情节',
    '法宝需有祭炼过程，认主需滴血或神识绑定，不可随意转让',
    '阵法需有阵眼、阵旗等构成要素，破阵需有逻辑推演过程',
    '秘境探索需有时间限制和危险系数，避免无限刷怪升级',
    '宗门等级需与修士境界挂钩，宗主、长老、内门、外门的划分需清晰',
    '灵石作为通用货币，需有明确的兑换比例和购买力设定',
    '渡劫需有天劫降临，劫雷强度与境界和天赋相关，不可人为干预',
  ],

  prohibitions: [
    '禁止现代用语出现在古代修仙背景中',
    '禁止科技产品或现代设备出现在世界观中',
    '禁止角色突然获得无理由的力量提升',
    '禁止出现破坏修炼体系逻辑的"开挂"情节',
    '禁止低阶修士随意击杀高阶修士（除非有特殊设定支撑）',
    '禁止出现与修仙世界观不符的元素（如手机、汽车等）',
    '禁止主角的敌人全是蠢货，反派需有基本的智商和判断力',
    '禁止出现"我爹是XX"式的无脑背景碾压情节',
    '禁止渡劫失败后毫发无损地重来，需有代价和损失',
  ],

  auditDimensions: [
    {
      id: 'power-system',
      name: '力量体系',
      severity: 'critical',
      weight: 10,
      checkInstruction: '检查修炼体系是否完整自洽，境界划分是否清晰，战斗描写是否体现境界差异',
    },
    {
      id: 'timeline',
      name: '时间线',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查时间跨度是否合理，修炼时长与境界提升是否匹配，人物年龄是否正确',
    },
    {
      id: 'worldbuilding',
      name: '世界观构建',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查世界观设定是否完整，地理、势力、资源体系是否逻辑自洽',
    },
    {
      id: 'character-consistency',
      name: '角色一致性',
      severity: 'warning',
      weight: 8,
      checkInstruction: '检查角色性格、实力、行为是否前后一致，是否有OOC（Out of Character）情况',
    },
    {
      id: 'plot-logic',
      name: '剧情逻辑',
      severity: 'warning',
      weight: 8,
      checkInstruction: '检查剧情发展是否合理，因果关系是否成立，是否有逻辑漏洞',
    },
    {
      id: 'foreshadowing',
      name: '伏笔呼应',
      severity: 'info',
      weight: 7,
      checkInstruction: '检查前期埋下的伏笔是否在后期得到呼应，是否有未解之谜',
    },
    {
      id: 'pacing',
      name: '节奏把控',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查剧情节奏是否张弛有度，高潮和低谷的分布是否合理',
    },
    {
      id: 'emotional-depth',
      name: '情感深度',
      severity: 'info',
      weight: 6,
      checkInstruction: '检查情感描写是否细腻，人物关系是否有深度，读者是否能产生共鸣',
    },
  ],

  pacingTemplate: [
    {
      phase: '开局',
      description: '主角身世揭晓，获得修炼机缘，踏入修仙之路',
      wordCountRatio: 0.15,
      tensionLevel: 'low',
    },
    {
      phase: '升级',
      description: '主角在宗门或势力中快速成长，获得功法和资源，突破初期境界',
      wordCountRatio: 0.25,
      tensionLevel: 'medium',
    },
    {
      phase: '瓶颈',
      description: '主角遭遇修炼瓶颈或重大危机，需要特殊机缘或磨砺才能突破',
      wordCountRatio: 0.15,
      tensionLevel: 'high',
    },
    {
      phase: '奇遇',
      description: '主角获得重大机缘，可能是秘境、传承、天材地宝等，实力大幅提升',
      wordCountRatio: 0.2,
      tensionLevel: 'medium',
    },
    {
      phase: '高潮',
      description: '主角与宿敌决战，渡劫突破，或面临生死存亡的大危机',
      wordCountRatio: 0.15,
      tensionLevel: 'climax',
    },
    {
      phase: '收尾',
      description: '主角成功突破，解决当前危机，为下一阶段埋下伏笔',
      wordCountRatio: 0.1,
      tensionLevel: 'low',
    },
  ],

  characterTypes: [
    {
      type: '主角',
      description: '天赋异禀或有特殊际遇的修炼者，通过不断努力和机缘最终登顶',
      requiredTraits: ['坚韧不拔', '悟性过人', '气运加身', '重情重义'],
      avoidTraits: ['优柔寡断', '贪生怕死', '背信弃义', '目光短浅'],
    },
    {
      type: '师父/引路人',
      description: '引导主角踏上修仙之路的高人，通常实力深不可测且见识广博',
      requiredTraits: ['实力强大', '眼光独到', '爱护弟子', '神秘背景'],
      avoidTraits: ['心胸狭隘', '嫉贤妒能', '过于软弱', '毫无原则'],
    },
    {
      type: '反派大佬',
      description: '与主角有宿怨或利益冲突的强大对手，通常境界高于主角',
      requiredTraits: ['实力强大', '野心勃勃', '心狠手辣', '有一定智商'],
      avoidTraits: ['愚蠢至极', '毫无底线', '纯粹邪恶', '不堪一击'],
    },
    {
      type: '红颜知己',
      description: '与主角有情感纠葛的女性角色，通常也有不俗的修炼天赋',
      requiredTraits: ['容貌出众', '修炼天赋', '善解人意', '关键时刻能帮忙'],
      avoidTraits: ['花瓶摆设', '拖后腿', '无脑恋爱', '毫无存在感'],
    },
    {
      type: '兄弟/搭档',
      description: '与主角并肩作战的伙伴，实力与主角相当或略低',
      requiredTraits: ['重情重义', '实力不俗', '性格互补', '关键时刻靠得住'],
      avoidTraits: ['背叛成性', '嫉妒心强', '毫无主见', '纯粹工具人'],
    },
  ],

  styleConstraints: {
    tone: ['热血激昂', '大气磅礴', '神秘莫测', '荡气回肠'],
    vocabulary: ['古风用语', '修炼术语', '战斗描写词汇', '丹药法宝名称'],
    sentenceStyle: ['短句为主，增强节奏感', '战斗场景用快节奏短句', '突破场景用长句渲染气势'],
    forbiddenWords: ['卧槽', '牛逼', '我去', '666', '老铁', '扎心了', '奥利给'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
