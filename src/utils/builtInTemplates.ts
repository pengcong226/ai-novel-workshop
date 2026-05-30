import type { NovelTemplate } from '@/types'

/**
 * 获取内置模板列表
 */
export function getBuiltInTemplates(): NovelTemplate[] {
  return [
    // 新手示例模板（帮助新用户快速上手）
    createDemoTemplate(),
    // 玄幻修仙模板
    createFantasyTemplate(),
    // 都市异能模板
    createUrbanTemplate(),
    // 科幻星际模板
    createScifiTemplate(),
    // 武侠江湖模板
    createWuxiaTemplate()
  ]
}

/**
 * 玄幻修仙模板
 */
function createFantasyTemplate(): NovelTemplate {
  return {
    meta: {
      id: 'builtin-fantasy',
      name: '玄幻修仙模板',
      version: '1.0.0',
      author: 'System',
      description: '经典玄幻修仙小说模板，包含完整的修炼体系、宗门势力和境界设定',
      tags: ['玄幻', '修仙', '奇幻'],
      category: 'fantasy',
      createdAt: new Date(),
      updatedAt: new Date(),
      rating: 5.0,
      downloads: 0
    },
    worldTemplate: {
      id: 'world-fantasy',
      name: '修仙世界',
      era: {
        time: '上古时期',
        techLevel: '修真文明',
        socialForm: '宗门林立'
      },
      geography: {
        locations: [
          {
            id: 'loc-1',
            name: '青云宗',
            description: '天下第一正道宗门，修仙圣地',
            importance: 'high',
            type: 'temple'
          },
          {
            id: 'loc-2',
            name: '天魔山',
            description: '魔道第一禁地，危险重重',
            importance: 'high',
            type: 'mountain'
          },
          {
            id: 'loc-3',
            name: '灵药园',
            description: '生长珍稀灵药的秘境',
            importance: 'medium',
            type: 'forest'
          }
        ]
      },
      powerSystem: {
        name: '修仙体系',
        levels: [
          { name: '炼气', description: '初入修仙，感应天地灵气' },
          { name: '筑基', description: '铸造道基，正式踏入仙途' },
          { name: '金丹', description: '凝结金丹，寿元大增' },
          { name: '元婴', description: '破丹成婴，神通广大' },
          { name: '化神', description: '元婴化神，参悟天地法则' },
          { name: '合体', description: '神魂与肉身合一' },
          { name: '大乘', description: '修为大成，渡劫飞升' },
          { name: '渡劫', description: '渡过天劫，飞升仙界' }
        ],
        skills: [
          { id: 'skill-1', name: '御剑术', description: '操控飞剑的基础法术', level: '炼气' },
          { id: 'skill-2', name: '五行遁术', description: '利用五行之力遁走', level: '筑基' },
          { id: 'skill-3', name: '分身术', description: '分化出多个分身', level: '金丹' }
        ],
        items: [
          { id: 'item-1', name: '灵石', description: '修仙界的通用货币', rarity: '普通' },
          { id: 'item-2', name: '法宝', description: '修士的主要武器', rarity: '稀有' },
          { id: 'item-3', name: '丹药', description: '提升修为的药物', rarity: '珍贵' }
        ]
      },
      factions: [
        {
          id: 'faction-1',
          name: '青云宗',
          type: '正道宗门',
          description: '天下第一正道宗门，传承万年',
          relationships: ['与天魔宗对立']
        },
        {
          id: 'faction-2',
          name: '天魔宗',
          type: '魔道宗门',
          description: '魔道第一大宗，实力雄厚',
          relationships: ['与青云宗对立']
        }
      ],
      rules: [
        { id: 'rule-1', name: '修仙法则', description: '强者为尊，弱肉强食' },
        { id: 'rule-2', name: '因果循环', description: '种善因得善果，种恶因得恶果' }
      ],
      aiGenerated: false
    },
    characterTemplates: [
      {
        role: 'protagonist',
        name: '废材逆袭型',
        description: '天赋平庸但意志坚定的主角，通过努力和机缘逆天改命',
        template: {
          name: '李凡',
          aliases: ['李师弟', '凡儿'],
          gender: 'male',
          age: 18,
          appearance: '相貌平平，眼神坚毅',
          personality: ['坚韧', '聪明', '谨慎', '重情义'],
          values: ['保护家人', '追求真相', '不畏强权'],
          background: '出身平凡，资质低下，但意外获得神秘传承',
          motivation: '守护家人，查明身世真相',
          abilities: [],
          powerLevel: '炼气',
          relationships: [],
          appearances: [],
          development: [],
          aiGenerated: false
        }
      },
      {
        role: 'supporting',
        name: '天才师兄',
        description: '天赋异禀的正道天才，主角的引路人',
        template: {
          name: '张云',
          aliases: ['张师兄', '云哥'],
          gender: 'male',
          age: 22,
          appearance: '剑眉星目，气质非凡',
          personality: ['正直', '护短', '高傲'],
          values: ['正道', '守护弱小'],
          background: '青云宗掌门独子，天赋惊人',
          motivation: '维护正道，保护师弟师妹',
          abilities: [],
          powerLevel: '筑基',
          relationships: [],
          appearances: [],
          development: [],
          aiGenerated: false
        }
      },
      {
        role: 'antagonist',
        name: '反派少主',
        description: '出身显赫的反派，与主角立场对立',
        template: {
          name: '王霸',
          aliases: ['王少主', '霸王'],
          gender: 'male',
          age: 20,
          appearance: '面容俊美，眼神阴鸷',
          personality: ['傲慢', '残忍', '城府深'],
          values: ['力量至上', '不择手段'],
          background: '魔道宗主之子，被宠坏的天才',
          motivation: '征服天下，证明自己',
          abilities: [],
          powerLevel: '筑基',
          relationships: [],
          appearances: [],
          development: [],
          aiGenerated: false
        }
      }
    ],
    plotTemplate: {
      structure: '三幕结构',
      description: '主角从废材到强者的逆袭之路，历经磨难，最终成就大道',
      totalChapters: 120,
      volumes: [
        {
          number: 1,
          title: '初入仙途',
          theme: '成长与觉醒',
          chapterRange: { start: 1, end: 30 },
          mainEvents: [
            '主角获得神秘传承',
            '加入青云宗',
            '宗门大比崭露头角',
            '发现惊天阴谋'
          ],
          plotPoints: [
            '主角资质测试失败',
            '意外获得上古传承',
            '在宗门大比中逆袭',
            '卷入正魔之争'
          ]
        },
        {
          number: 2,
          title: '正魔风云',
          theme: '斗争与历练',
          chapterRange: { start: 31, end: 70 },
          mainEvents: [
            '正魔大战爆发',
            '主角突破筑基',
            '探秘古遗迹',
            '建立自己的势力'
          ],
          plotPoints: [
            '参与正魔大战',
            '获得上古秘宝',
            '突破筑基境界',
            '组建精英团队'
          ]
        },
        {
          number: 3,
          title: '大道巅峰',
          theme: '决战与飞升',
          chapterRange: { start: 71, end: 120 },
          mainEvents: [
            '真相大白',
            '最终决战',
            '突破元婴',
            '飞升仙界'
          ],
          plotPoints: [
            '揭开阴谋真相',
            '与终极反派决战',
            '突破元婴境界',
            '渡劫飞升'
          ]
        }
      ]
    },
    styleTemplate: {
      tone: '严肃',
      narrativePerspective: '第三人称',
      dialogueStyle: '华丽',
      descriptionLevel: '详细'
    },
    promptTemplates: {
      worldGeneration: '请为玄幻修仙小说生成世界观设定，包含修炼体系、宗门势力、地理环境。',
      characterGeneration: '请为玄幻修仙小说生成人物设定，包含背景、性格、能力和成长轨迹。',
      chapterGeneration: '请根据大纲生成玄幻修仙小说章节，注重修炼描写、战斗场景和人物成长。'
    }
  }
}

/**
 * 都市异能模板
 */
function createUrbanTemplate(): NovelTemplate {
  return {
    meta: {
      id: 'builtin-urban',
      name: '都市异能模板',
      version: '1.0.0',
      author: 'System',
      description: '现代都市背景下的异能小说模板，包含觉醒体系、隐藏势力和都市阴谋',
      tags: ['都市', '异能', '现代'],
      category: 'urban',
      createdAt: new Date(),
      updatedAt: new Date(),
      rating: 4.8,
      downloads: 0
    },
    worldTemplate: {
      id: 'world-urban',
      name: '现代都市',
      era: {
        time: '21世纪',
        techLevel: '现代科技',
        socialForm: '现代社会'
      },
      geography: {
        locations: [
          {
            id: 'loc-1',
            name: '龙城市中心',
            description: '繁华的商业区，高楼林立',
            importance: 'high',
            type: 'city'
          },
          {
            id: 'loc-2',
            name: '异能者学院',
            description: '培养异能者的秘密学院',
            importance: 'high',
            type: 'other'
          }
        ]
      },
      powerSystem: {
        name: '异能体系',
        levels: [
          { name: 'E级', description: '初觉醒，能力微弱' },
          { name: 'D级', description: '能力显现，可控制' },
          { name: 'C级', description: '能力强化，战斗力提升' },
          { name: 'B级', description: '能力成熟，独当一面' },
          { name: 'A级', description: '能力精深，顶尖强者' },
          { name: 'S级', description: '能力觉醒，接近神明' }
        ],
        skills: [],
        items: []
      },
      factions: [
        {
          id: 'faction-1',
          name: '异能者协会',
          type: '组织',
          description: '管理异能者的官方组织',
          relationships: []
        },
        {
          id: 'faction-2',
          name: '暗夜组织',
          type: '秘密组织',
          description: '隐藏在暗处的神秘势力',
          relationships: []
        }
      ],
      rules: [
        { id: 'rule-1', name: '异能法则', description: '异能者必须隐藏身份' },
        { id: 'rule-2', name: '平衡法则', description: '异能者与普通人和平共处' }
      ],
      aiGenerated: false
    },
    characterTemplates: [
      {
        role: 'protagonist',
        name: '觉醒者',
        description: '平凡大学生意外觉醒异能',
        template: {
          name: '陈风',
          aliases: ['陈同学', '风哥'],
          gender: 'male',
          age: 20,
          appearance: '相貌英俊，眼神锐利',
          personality: ['冷静', '正义', '聪明'],
          values: ['保护朋友', '追求真相'],
          background: '普通大学生，意外觉醒异能',
          motivation: '查明异能来源，保护身边的人',
          abilities: [],
          powerLevel: 'E级',
          relationships: [],
          appearances: [],
          development: [],
          aiGenerated: false
        }
      }
    ],
    plotTemplate: {
      structure: '三幕结构',
      description: '普通人觉醒异能后卷入都市阴谋的故事',
      totalChapters: 80,
      volumes: [
        {
          number: 1,
          title: '觉醒',
          theme: '发现与成长',
          chapterRange: { start: 1, end: 25 },
          mainEvents: ['意外觉醒', '加入学院', '初战强敌'],
          plotPoints: []
        },
        {
          number: 2,
          title: '阴谋',
          theme: '斗争与探索',
          chapterRange: { start: 26, end: 55 },
          mainEvents: ['发现阴谋', '实力提升', '结成联盟'],
          plotPoints: []
        },
        {
          number: 3,
          title: '决战',
          theme: '真相与抉择',
          chapterRange: { start: 56, end: 80 },
          mainEvents: ['揭露真相', '最终决战', '新的开始'],
          plotPoints: []
        }
      ]
    },
    styleTemplate: {
      tone: '严肃',
      narrativePerspective: '第一人称',
      dialogueStyle: '简洁',
      descriptionLevel: '适中'
    },
    promptTemplates: {
      worldGeneration: '请为都市异能小说生成世界观设定，包含异能体系、隐藏势力、都市环境。',
      characterGeneration: '请为都市异能小说生成人物设定，包含背景、异能、性格。',
      chapterGeneration: '请根据大纲生成都市异能小说章节，注重现代都市生活、异能战斗和悬疑元素。'
    }
  }
}

/**
 * 科幻星际模板
 */
function createScifiTemplate(): NovelTemplate {
  return {
    meta: {
      id: 'builtin-scifi',
      name: '科幻星际模板',
      version: '1.0.0',
      author: 'System',
      description: '星际文明背景下的科幻小说模板，包含星际文明、科技体系和种族设定',
      tags: ['科幻', '星际', '未来'],
      category: 'scifi',
      createdAt: new Date(),
      updatedAt: new Date(),
      rating: 4.5,
      downloads: 0
    },
    worldTemplate: {
      id: 'world-scifi',
      name: '星际联盟',
      era: {
        time: '星际时代',
        techLevel: '高度发达',
        socialForm: '星际联盟'
      },
      geography: {
        locations: [
          {
            id: 'loc-1',
            name: '地球联邦',
            description: '人类文明的母星',
            importance: 'high',
            type: 'other'
          },
          {
            id: 'loc-2',
            name: '火星基地',
            description: '人类最重要的殖民地',
            importance: 'high',
            type: 'other'
          }
        ]
      },
      powerSystem: {
        name: '科技等级',
        levels: [
          { name: '一级文明', description: '行星级文明' },
          { name: '二级文明', description: '恒星级文明' },
          { name: '三级文明', description: '星系级文明' }
        ],
        skills: [],
        items: [
          { id: 'item-1', name: '光速飞船', description: '超光速旅行技术', rarity: '稀有' },
          { id: 'item-2', name: '量子武器', description: '基于量子纠缠的武器', rarity: '珍贵' }
        ]
      },
      factions: [
        {
          id: 'faction-1',
          name: '星际联盟',
          type: '联邦',
          description: '维护星际和平的组织',
          relationships: []
        }
      ],
      rules: [
        { id: 'rule-1', name: '黑暗森林法则', description: '宇宙中的文明必须隐藏自己' }
      ],
      aiGenerated: false
    },
    characterTemplates: [
      {
        role: 'protagonist',
        name: '星舰舰长',
        description: '经验丰富的星舰指挥官',
        template: {
          name: '林舰长',
          aliases: ['舰长', '林指挥'],
          gender: 'male',
          age: 35,
          appearance: '身材魁梧，目光坚毅',
          personality: ['果断', '勇敢', '有担当'],
          values: ['保护船员', '探索未知'],
          background: '从基层成长起来的优秀舰长',
          motivation: '探索宇宙未知，保护人类文明',
          abilities: [],
          powerLevel: '',
          relationships: [],
          appearances: [],
          development: [],
          aiGenerated: false
        }
      }
    ],
    plotTemplate: {
      structure: '三幕结构',
      description: '星际探险中发现未知文明的故事',
      totalChapters: 100,
      volumes: [
        {
          number: 1,
          title: '启航',
          theme: '探索',
          chapterRange: { start: 1, end: 30 },
          mainEvents: ['接受任务', '组建船员', '启航出发'],
          plotPoints: []
        },
        {
          number: 2,
          title: '发现',
          theme: '冒险',
          chapterRange: { start: 31, end: 70 },
          mainEvents: ['发现未知文明', '陷入危机', '艰难抉择'],
          plotPoints: []
        },
        {
          number: 3,
          title: '归途',
          theme: '使命',
          chapterRange: { start: 71, end: 100 },
          mainEvents: ['完成任务', '返回家园', '新的使命'],
          plotPoints: []
        }
      ]
    },
    styleTemplate: {
      tone: '严肃',
      narrativePerspective: '第三人称',
      dialogueStyle: '简洁',
      descriptionLevel: '详细'
    },
    promptTemplates: {
      worldGeneration: '请为科幻星际小说生成世界观设定，包含星际文明、科技体系、外星种族。',
      characterGeneration: '请为科幻星际小说生成人物设定，包含背景、技能、性格。',
      chapterGeneration: '请根据大纲生成科幻星际小说章节，注重科技描写、星际探索和文明冲突。'
    }
  }
}

/**
 * 武侠江湖模板
 */
function createWuxiaTemplate(): NovelTemplate {
  return {
    meta: {
      id: 'builtin-wuxia',
      name: '武侠江湖模板',
      version: '1.0.0',
      author: 'System',
      description: '传统武侠小说模板，包含门派体系、武学传承和江湖规矩',
      tags: ['武侠', '江湖', '传统'],
      category: 'wuxia',
      createdAt: new Date(),
      updatedAt: new Date(),
      rating: 4.7,
      downloads: 0
    },
    worldTemplate: {
      id: 'world-wuxia',
      name: '江湖',
      era: {
        time: '古代',
        techLevel: '冷兵器时代',
        socialForm: '门派林立'
      },
      geography: {
        locations: [
          {
            id: 'loc-1',
            name: '少林寺',
            description: '天下武功出少林',
            importance: 'high',
            type: 'temple'
          },
          {
            id: 'loc-2',
            name: '武当山',
            description: '道家圣地',
            importance: 'high',
            type: 'mountain'
          }
        ]
      },
      powerSystem: {
        name: '武学体系',
        levels: [
          { name: '三流', description: '初入武道' },
          { name: '二流', description: '小有成就' },
          { name: '一流', description: '登堂入室' },
          { name: '顶尖', description: '武林高手' },
          { name: '绝世', description: '独步天下' }
        ],
        skills: [
          { id: 'skill-1', name: '内功', description: '修炼真气的基础', level: '基础' },
          { id: 'skill-2', name: '轻功', description: '身法技巧', level: '基础' },
          { id: 'skill-3', name: '剑法', description: '剑术武学', level: '进阶' }
        ],
        items: [
          { id: 'item-1', name: '神兵', description: '锋利无比的宝剑', rarity: '稀有' },
          { id: 'item-2', name: '秘籍', description: '记载武学的典籍', rarity: '珍贵' }
        ]
      },
      factions: [
        {
          id: 'faction-1',
          name: '少林派',
          type: '名门正派',
          description: '天下武功出少林',
          relationships: []
        },
        {
          id: 'faction-2',
          name: '武当派',
          type: '名门正派',
          description: '道家武学圣地',
          relationships: []
        }
      ],
      rules: [
        { id: 'rule-1', name: '江湖规矩', description: '恩怨分明，有仇必报' },
        { id: 'rule-2', name: '门派规矩', description: '师命不可违' }
      ],
      aiGenerated: false
    },
    characterTemplates: [
      {
        role: 'protagonist',
        name: '复仇少年',
        description: '为报血海深仇踏上江湖之路',
        template: {
          name: '李青',
          aliases: ['李少侠', '青儿'],
          gender: 'male',
          age: 20,
          appearance: '剑眉星目，英气逼人',
          personality: ['正义', '坚韧', '重情'],
          values: ['报仇雪恨', '惩恶扬善'],
          background: '家族被灭，独自练武十年',
          motivation: '查明灭门真相，手刃仇人',
          abilities: [],
          powerLevel: '一流',
          relationships: [],
          appearances: [],
          development: [],
          aiGenerated: false
        }
      }
    ],
    plotTemplate: {
      structure: '三幕结构',
      description: '复仇之路上的江湖恩怨与侠义精神',
      totalChapters: 90,
      volumes: [
        {
          number: 1,
          title: '出山',
          theme: '成长',
          chapterRange: { start: 1, end: 30 },
          mainEvents: ['初入江湖', '结识侠客', '初试身手'],
          plotPoints: []
        },
        {
          number: 2,
          title: '闯荡',
          theme: '历练',
          chapterRange: { start: 31, end: 60 },
          mainEvents: ['查明真相', '遭遇挫折', '武功大进'],
          plotPoints: []
        },
        {
          number: 3,
          title: '决战',
          theme: '复仇',
          chapterRange: { start: 61, end: 90 },
          mainEvents: ['终极对决', '恩怨了结', '归隐江湖'],
          plotPoints: []
        }
      ]
    },
    styleTemplate: {
      tone: '严肃',
      narrativePerspective: '第三人称',
      dialogueStyle: '华丽',
      descriptionLevel: '详细'
    },
    promptTemplates: {
      worldGeneration: '请为武侠小说生成世界观设定，包含门派体系、武学传承、江湖规矩。',
      characterGeneration: '请为武侠小说生成人物设定，包含背景、武功、性格。',
      chapterGeneration: '请根据大纲生成武侠小说章节，注重武学描写、江湖恩怨和侠义精神。'
    }
  }
}

/**
 * 新手示例模板 - 帮助新用户快速理解产品用法
 */
function createDemoTemplate(): NovelTemplate {
  return {
    meta: {
      id: 'builtin-demo',
      name: '新手引导示例',
      version: '1.0.0',
      author: 'System',
      description: '预设了一部完整的短篇小说框架，包含世界观、角色和3卷大纲，帮助你快速了解AI小说工坊的创作流程。可在此基础上自由修改。',
      tags: ['示例', '入门', '奇幻'],
      category: 'fantasy',
      createdAt: new Date(),
      updatedAt: new Date(),
      rating: 5.0,
      downloads: 0
    },
    worldTemplate: {
      id: 'world-demo',
      name: '幻灵大陆',
      era: {
        time: '架空中世纪',
        techLevel: '魔法文明',
        socialForm: '王国联盟'
      },
      geography: {
        locations: [
          {
            id: 'demo-loc-1',
            name: '星辰城',
            description: '大陆中央的王都，人口百万，拥有最古老的魔法学院',
            importance: 'high',
            type: 'city'
          },
          {
            id: 'demo-loc-2',
            name: '迷雾森林',
            description: '北方的禁地，传说中精灵族的居所，常年被迷雾笼罩',
            importance: 'high',
            type: 'forest'
          },
          {
            id: 'demo-loc-3',
            name: '铁炉堡',
            description: '矮人族的地下要塞，锻造术冠绝天下',
            importance: 'medium',
            type: 'castle'
          }
        ]
      },
      factions: [
        {
          id: 'demo-faction-1',
          name: '星辰王国',
          type: '国家',
          description: '大陆上最强盛的人类王国，以魔法立国',
          relationships: ['demo-faction-2']
        },
        {
          id: 'demo-faction-2',
          name: '暗影教团',
          type: '组织',
          description: '潜伏在暗处的神秘组织，意图收集远古神器复活魔王',
          relationships: ['demo-faction-1']
        }
      ],
      rules: [],
      aiGenerated: false
    },
    characterTemplates: [
      {
        role: 'protagonist',
        template: {
          name: '林夜',
          aliases: ['星辰之子'],
          gender: 'male',
          age: 18,
          appearance: '黑发银瞳，身形修长，左手背有一枚星辰形胎记',
          personality: ['善良', '坚毅', '好奇心强'],
          background: '星辰城平民少年，自幼父母双亡，在魔法学院当杂工，却意外发现自己拥有罕见的星辰魔法天赋',
          motivation: '寻找身世真相，保护所爱之人'
        },
        description: '主角：星辰城的平凡少年，拥有星辰魔法天赋'
      },
      {
        role: 'supporting',
        template: {
          name: '苏灵月',
          aliases: ['月之精灵'],
          gender: 'female',
          age: 17,
          appearance: '银白长发，紫色眼眸，耳尖微尖，气质清冷',
          personality: ['聪慧', '外冷内热', '责任感强'],
          background: '迷雾森林精灵族公主，因族中预言来到人类世界寻找"星辰之子"',
          motivation: '完成预言，拯救精灵族免于消亡'
        },
        description: '女主角：精灵族公主，身负预言使命'
      },
      {
        role: 'antagonist',
        template: {
          name: '玄墨',
          aliases: ['暗影之主'],
          gender: 'male',
          age: 35,
          appearance: '黑袍覆身，面容苍白，右眼被黑色眼罩遮住',
          personality: ['冷酷', '深谋远虑', '偏执'],
          background: '曾是星辰学院最天才的法师，研究禁术被逐出后创立暗影教团',
          motivation: '收集远古神器，打破世界壁垒，释放被封印的魔王以获取终极力量'
        },
        description: '反派：暗影教团之主，意图释放魔王'
      }
    ],
    plotTemplate: {
      structure: '三幕结构',
      totalChapters: 15,
      description: '平凡少年林夜发现自己拥有星辰魔法天赋，与精灵公主苏灵月一起踏上冒险之旅，对抗暗影教团，最终拯救幻灵大陆。一部融合友情、成长与奇幻冒险的短篇小说。',
      volumes: [
        {
          number: 1,
          title: '第一卷：星辰觉醒',
          theme: '命运的召唤',
          chapterRange: { start: 1, end: 5 },
          mainEvents: ['发现魔法天赋', '进入魔法学院', '精灵族来访', '初遇暗影教团'],
          plotPoints: [
            '林夜在学院杂工时意外触发星辰魔法',
            '被破格录取进入魔法学院学习',
            '苏灵月带着预言来到星辰城',
            '暗影教团袭击学院抢夺远古卷轴',
            '林夜和苏灵月决定踏上寻找神器之旅'
          ]
        },
        {
          number: 2,
          title: '第二卷：迷雾之旅',
          theme: '试炼与成长',
          chapterRange: { start: 6, end: 10 },
          mainEvents: ['深入迷雾森林', '矮人族结盟', '获取第一件神器', '遭受背叛'],
          plotPoints: [
            '二人进入迷雾森林寻找精灵族',
            '在铁炉堡与矮人族结盟锻造神器线索',
            '成功获取第一件远古神器"星辰之钥"',
            '发现学院中有暗影教团的内应',
            '林夜身世之谜逐渐揭开'
          ]
        },
        {
          number: 3,
          title: '第三卷：终焉之战',
          theme: '命运对决',
          chapterRange: { start: 11, end: 15 },
          mainEvents: ['集合盟友', '正面交锋', '身世真相', '终极之战'],
          plotPoints: [
            '林夜发现自己的星辰血脉与远古封印有关',
            '联合人类、精灵、矮人三族对抗暗影教团',
            '玄墨集齐神器开始解封仪式',
            '林夜觉醒星辰之力与玄墨决战',
            '封印魔王，守护大陆和平，林夜成为传说'
          ]
        }
      ]
    },
    styleTemplate: {
      tone: '轻松',
      narrativePerspective: '第三人称',
      dialogueStyle: '简洁',
      descriptionLevel: '适中'
    },
    promptTemplates: {
      worldGeneration: '请生成一个包含魔法体系、种族设定、王国势力的奇幻世界观。要求设定完整且自洽，包含地理、历史、势力关系。',
      characterGeneration: '请为奇幻小说生成角色设定，包含外貌、性格、背景故事、能力体系和人物关系。',
      chapterGeneration: '请根据大纲生成小说章节，注重场景描写、人物对话和情节推进，语言流畅自然，保持叙事节奏。'
    }
  }
}
