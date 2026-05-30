import { GenreProfile } from '@/types/genreProfile'

export const mysteryProfile: GenreProfile = {
  id: 'mystery',
  name: '悬疑推理',
  description: '以解谜为核心，通过逻辑推理、线索搜集、真相揭露来推进剧情，强调悬念设置和推理过程的严密性。',

  writingRules: [
    '悬念设置需层层递进，每个谜题的解开都应引出更大的谜团',
    '线索埋设需公平，所有用于推理的关键线索都必须在文中出现过',
    '推理过程需严密，逻辑链条不可有漏洞，结论必须从线索中合理推导',
    '误导需巧妙，红鲱鱼（干扰线索）需有合理性，不可为了反转而反转',
    '凶手/真相揭露需震撼但合理，读者应有"原来如此"而非"怎么可能"的感觉',
    '人物动机需充分，犯罪行为背后需有令人信服的心理动因',
    '时间线需清晰，特别是涉及不在场证明、作案时间等关键信息',
    '场景描写需细致，凶案现场、关键场所的细节可能是重要线索',
    '人物关系需复杂，每个嫌疑人都应有作案动机和机会',
    '节奏需紧凑，悬疑感需贯穿全文，不可有过多无关紧要的支线',
    '专业细节需准确，法医、刑侦、心理学等专业描写需有据可查',
    '主角的推理能力需合理，不可开挂式地瞬间洞察一切',
    '结局需有升华，不仅仅是破案，还应有人性的探讨或社会的反思',
    '系列作品需保持世界观一致性，前作设定不可随意推翻',
  ],

  genreRules: [
    '每章结尾需有悬念钩子，引导读者继续阅读',
    '线索呈现需有层次，表面线索、深层线索、隐藏线索需逐步揭示',
    '审讯场景需专业，问话技巧、心理博弈需有真实感',
    '法医鉴定需准确，死因、凶器、死亡时间等需符合科学',
    '犯罪手法需有可行性，不可过于天马行空或依赖巧合',
    '多重解答需有支撑，如果提供多种推理方向，每种都需有证据支撑',
    '最终真相需经得起推敲，不可事后诸葛亮式的"解释"',
  ],

  prohibitions: [
    '禁止出现超自然的破案手段（除非明确标注是灵异悬疑）',
    '禁止关键线索在推理过程中被隐藏或突然出现',
    '禁止凶手的作案手法过于复杂以至于不现实',
    '禁止主角通过梦境、直觉等非逻辑方式破案',
    '禁止为了反转而强行制造不合理的剧情',
    '禁止法医、刑侦等专业描写出现严重错误',
    '禁止结局草率收场或虎头蛇尾',
    '禁止出现"凶手是路人甲"式毫无铺垫的揭露',
  ],

  auditDimensions: [
    {
      id: 'logic-consistency',
      name: '逻辑严密性',
      severity: 'critical',
      weight: 10,
      checkInstruction: '检查推理过程是否严密，逻辑链条是否有漏洞，结论是否从线索中合理推导',
    },
    {
      id: 'clue-fairness',
      name: '线索公平性',
      severity: 'critical',
      weight: 10,
      checkInstruction: '检查所有关键线索是否都在文中出现过，是否有事后补充的线索',
    },
    {
      id: 'suspense-technique',
      name: '悬念技巧',
      severity: 'critical',
      weight: 9,
      checkInstruction: '检查悬念设置是否巧妙，节奏是否紧凑，是否有有效的钩子',
    },
    {
      id: 'motive-believability',
      name: '动机可信度',
      severity: 'warning',
      weight: 8,
      checkInstruction: '检查犯罪动机是否充分，是否令人信服，心理描写是否到位',
    },
    {
      id: 'professional-accuracy',
      name: '专业准确性',
      severity: 'warning',
      weight: 8,
      checkInstruction: '检查法医、刑侦、心理学等专业描写是否准确',
    },
    {
      id: 'ending-satisfaction',
      name: '结局满意度',
      severity: 'warning',
      weight: 7,
      checkInstruction: '检查结局是否震撼但合理，是否有升华，是否令人满意',
    },
  ],

  pacingTemplate: [
    {
      phase: '案发',
      description: '案件发生，呈现谜团，介绍主要嫌疑人和基本线索',
      wordCountRatio: 0.15,
      tensionLevel: 'high',
    },
    {
      phase: '调查',
      description: '主角展开调查，搜集线索，审讯嫌疑人，逐步缩小范围',
      wordCountRatio: 0.3,
      tensionLevel: 'medium',
    },
    {
      phase: '误导',
      description: '出现干扰线索或虚假嫌疑人，读者和主角都被误导',
      wordCountRatio: 0.15,
      tensionLevel: 'medium',
    },
    {
      phase: '转折',
      description: '新线索出现，推翻之前的推理，案件出现重大转折',
      wordCountRatio: 0.15,
      tensionLevel: 'high',
    },
    {
      phase: '真相',
      description: '主角通过严密推理揭露真相，凶手身份和作案手法揭晓',
      wordCountRatio: 0.15,
      tensionLevel: 'climax',
    },
    {
      phase: '收尾',
      description: '案件解决，罪犯伏法，可能有人性或社会层面的升华',
      wordCountRatio: 0.1,
      tensionLevel: 'low',
    },
  ],

  characterTypes: [
    {
      type: '侦探/警察',
      description: '负责破案的主角，通常是刑警、私家侦探或具有推理能力的普通人',
      requiredTraits: ['观察力敏锐', '逻辑思维强', '冷静理性', '有正义感'],
      avoidTraits: ['感情用事', '粗心大意', '主观臆断', '道德败坏'],
    },
    {
      type: '助手/搭档',
      description: '协助主角破案的伙伴，通常是法医、技术员或搭档警察',
      requiredTraits: ['专业能力强', '忠诚可靠', '有互补技能', '善于沟通'],
      avoidTraits: ['成事不足', '泄密风险', '毫无主见', '纯粹搞笑'],
    },
    {
      type: '嫌疑人',
      description: '案件的嫌疑人之一，可能是真凶也可能是烟雾弹',
      requiredTraits: ['有动机', '有机会', '有秘密', '有复杂性'],
      avoidTraits: ['纯粹好人', '毫无嫌疑', '过于明显', '纯粹工具人'],
    },
    {
      type: '真凶',
      description: '案件的真正凶手，通常隐藏在嫌疑人之中',
      requiredTraits: ['隐藏深', '有充分动机', '有作案能力', '心理复杂'],
      avoidTraits: ['毫无铺垫', '动机牵强', '作案手法荒谬', '纯粹邪恶'],
    },
    {
      type: '受害者/家属',
      description: '案件的受害者或其家属，可能提供重要线索或情感线索',
      requiredTraits: ['有故事', '有情感深度', '可能有秘密', '推动剧情'],
      avoidTraits: ['纯粹工具人', '毫无存在感', '信息量过大', '过于可怜'],
    },
  ],

  styleConstraints: {
    tone: ['紧张悬疑', '冷静克制', '黑暗深沉', '理性分析'],
    vocabulary: ['刑侦术语', '法医术语', '心理学词汇', '逻辑推理用语'],
    sentenceStyle: ['短句增强紧张感', '长句用于推理分析', '对话推动线索揭示', '场景描写注重细节'],
    forbiddenWords: ['卧槽', '牛逼', '我去', '666', '老铁', '扎心了', '奥利给'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
