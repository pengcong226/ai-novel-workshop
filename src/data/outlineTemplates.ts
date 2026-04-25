import type { OutlineTemplate, OutlineTemplatePhase, PlotTemplate, VolumeTemplate } from '@/types'

type LegacyPhaseTemplate = OutlineTemplatePhase & {
  plotPoints: string[]
}

interface TemplateDefinition extends Omit<OutlineTemplate, 'phases'> {
  phases: LegacyPhaseTemplate[]
}

export const threeActOutlineTemplate: TemplateDefinition = {
  id: 'three-act',
  name: '三幕结构',
  structure: '三幕结构',
  description: '经典商业叙事结构，适合以冲突递进和高潮解决为核心的长篇故事。',
  suitableGenres: ['玄幻', '都市', '科幻', '悬疑', '言情'],
  defaultChapterCount: 60,
  phases: [
    {
      id: 'setup',
      name: '第一幕：铺垫',
      description: '建立世界、人物目标和核心冲突，让主角被迫进入故事。',
      chapterRatio: 0.3,
      goals: ['主角出场', '激励事件发生', '核心目标确立', '主要关系建立'],
      keyBeats: ['日常状态', '异常入侵', '拒绝或犹豫', '做出选择'],
      plotPoints: ['开场吸引读者', '建立主角动机', '引入核心冲突', '第一幕高潮']
    },
    {
      id: 'confrontation',
      name: '第二幕：对抗',
      description: '持续升级外部阻力和内在矛盾，让主角在失败中成长。',
      chapterRatio: 0.45,
      goals: ['探索新局面', '盟友与敌人登场', '中点转折', '黑暗时刻'],
      keyBeats: ['试炼', '阶段性胜利', '重大反转', '低谷重组'],
      plotPoints: ['探索新世界', '能力成长', '中点发现', '看似无望的低谷', '准备最终对决']
    },
    {
      id: 'resolution',
      name: '第三幕：解决',
      description: '整合前文伏笔，完成终极对决、人物弧光和新秩序建立。',
      chapterRatio: 0.25,
      goals: ['最终准备', '终极对决', '核心冲突解决', '新平衡建立'],
      keyBeats: ['集结力量', '牺牲与选择', '高潮', '余波'],
      plotPoints: ['面对终极挑战', '核心冲突解决', '人物弧光完成', '世界观新秩序']
    }
  ]
}

export const heroJourneyOutlineTemplate: TemplateDefinition = {
  id: 'hero-journey',
  name: '英雄之旅',
  structure: '英雄之旅',
  description: '基于单一神话的启程、启蒙、归来结构，适合成长冒险与史诗叙事。',
  suitableGenres: ['奇幻', '玄幻', '冒险', '科幻', '武侠'],
  defaultChapterCount: 80,
  phases: [
    {
      id: 'departure',
      name: '启程篇',
      description: '从平凡世界进入非凡世界，完成命运召唤与门槛跨越。',
      chapterRatio: 0.31,
      goals: ['平凡世界', '冒险召唤', '拒绝召唤', '遇见导师', '跨越门槛'],
      keyBeats: ['日常展示', '召唤出现', '内心抗拒', '获得指引', '踏上旅程'],
      plotPoints: ['建立平凡生活', '引入核心冲突', '展示恐惧', '获得关键知识', '正式启程']
    },
    {
      id: 'initiation',
      name: '启蒙篇',
      description: '通过试炼、盟友、敌人和最大磨难推动主角转化。',
      chapterRatio: 0.38,
      goals: ['试炼', '盟友与敌人', '接近洞穴', '面对最大恐惧', '获得奖赏'],
      keyBeats: ['规则学习', '能力考验', '深入险境', '觉醒', '代价'],
      plotPoints: ['结识伙伴', '智慧考验', '面对阴影', '关键收获', '成长代价']
    },
    {
      id: 'return',
      name: '归来篇',
      description: '经历最终考验后带回成果，让两个世界完成融合。',
      chapterRatio: 0.31,
      goals: ['返回之路', '复活考验', '携万能药归来', '新生活开始'],
      keyBeats: ['追逐回归', '终极对决', '胜利与代价', '世界改变'],
      plotPoints: ['最后净化', '终极对决', '胜利代价', '回归世界', '蜕变完成']
    }
  ]
}

export const fourActOutlineTemplate: TemplateDefinition = {
  id: 'four-act-cn',
  name: '起承转合',
  structure: '起承转合',
  description: '中国传统四段式叙事结构，适合东方风格、情绪递进和伏笔回收。',
  suitableGenres: ['武侠', '仙侠', '历史', '言情', '悬疑'],
  defaultChapterCount: 50,
  phases: [
    {
      id: 'qi',
      name: '起',
      description: '开篇布局，奠定人物、背景、基调和主线。',
      chapterRatio: 0.24,
      goals: ['引子与背景', '人物出场', '核心矛盾初现', '故事基调奠定'],
      keyBeats: ['开场钩子', '关系建立', '伏笔埋设', '主线出现'],
      plotPoints: ['吸引注意', '介绍人物', '埋下伏笔', '引出主线']
    },
    {
      id: 'cheng',
      name: '承',
      description: '承接发展，深化矛盾、人物关系和支线交织。',
      chapterRatio: 0.26,
      goals: ['情节展开', '矛盾激化', '人物变化', '支线交织'],
      keyBeats: ['扩展维度', '加深刻画', '铺陈细节', '转折铺垫'],
      plotPoints: ['扩展故事维度', '加深人物刻画', '铺陈细节', '为转折做铺垫']
    },
    {
      id: 'zhuan',
      name: '转',
      description: '转折高潮，打破既有平衡并集中爆发核心矛盾。',
      chapterRatio: 0.3,
      goals: ['重大转折', '矛盾爆发', '命运突变', '高潮迭起'],
      keyBeats: ['平衡打破', '意外发展', '危机并存', '核心对决'],
      plotPoints: ['打破平衡', '意想不到的发展', '危机与机遇并存', '核心冲突对决']
    },
    {
      id: 'he',
      name: '合',
      description: '收束结局，揭晓伏笔、归拢人物命运并升华主题。',
      chapterRatio: 0.2,
      goals: ['矛盾解决', '命运归宿', '伏笔揭晓', '主题升华'],
      keyBeats: ['尘埃落定', '真相揭示', '成长完成', '余韵'],
      plotPoints: ['尘埃落定', '揭示真相', '人物成长完成', '余韵悠长']
    }
  ]
}

export const sevenPointOutlineTemplate: TemplateDefinition = {
  id: 'seven-point',
  name: '七点结构',
  structure: '七点结构',
  description: '围绕钩子、转折、中点、危机与结局的强节奏结构，适合类型小说和悬疑推进。',
  suitableGenres: ['悬疑', '科幻', '都市', '奇幻', '惊悚'],
  defaultChapterCount: 70,
  phases: [
    {
      id: 'hook',
      name: '钩子',
      description: '用强情境或异常事件抓住读者并建立主角缺口。',
      chapterRatio: 0.12,
      goals: ['吸引注意', '展示缺口', '设置悬念'],
      keyBeats: ['异常开场', '主角困境', '目标暗示'],
      plotPoints: ['强开场', '核心悬念', '人物缺口']
    },
    {
      id: 'plot-turn-1',
      name: '第一转折',
      description: '事件迫使主角离开原轨道，进入主要冲突。',
      chapterRatio: 0.15,
      goals: ['激励事件', '目标明确', '进入冲突'],
      keyBeats: ['事件升级', '选择代价', '行动开始'],
      plotPoints: ['不可逆选择', '主要冲突启动']
    },
    {
      id: 'pinch-1',
      name: '第一压迫点',
      description: '展示反派或阻力的真实威胁，压缩主角空间。',
      chapterRatio: 0.13,
      goals: ['威胁显形', '失败或损失', '压力积累'],
      keyBeats: ['敌意展示', '代价出现', '计划受挫'],
      plotPoints: ['外部压力', '局势恶化']
    },
    {
      id: 'midpoint',
      name: '中点',
      description: '通过重大发现或转变让主角从被动转向主动。',
      chapterRatio: 0.16,
      goals: ['真相揭示', '立场改变', '主动出击'],
      keyBeats: ['关键信息', '身份或目标变化', '反攻计划'],
      plotPoints: ['重大反转', '主动转变']
    },
    {
      id: 'pinch-2',
      name: '第二压迫点',
      description: '更强阻力摧毁旧计划，逼近最黑暗时刻。',
      chapterRatio: 0.14,
      goals: ['计划崩坏', '关系破裂', '危机加深'],
      keyBeats: ['敌方反击', '内外夹击', '资源丧失'],
      plotPoints: ['最大压力', '黑暗前夜']
    },
    {
      id: 'plot-turn-2',
      name: '第二转折',
      description: '主角获得最后线索或觉悟，进入结局行动。',
      chapterRatio: 0.15,
      goals: ['觉悟形成', '最后线索', '终局计划'],
      keyBeats: ['代价接受', '力量整合', '决战准备'],
      plotPoints: ['最终选择', '进入高潮']
    },
    {
      id: 'resolution',
      name: '结局',
      description: '完成高潮对决，兑现钩子和主题承诺。',
      chapterRatio: 0.15,
      goals: ['高潮对决', '谜底揭晓', '主题兑现', '余波收束'],
      keyBeats: ['终极行动', '真相落地', '新秩序'],
      plotPoints: ['冲突解决', '承诺兑现', '余韵']
    }
  ]
}

export const webNovelOutlineTemplate: TemplateDefinition = {
  id: 'multi-volume-web-novel',
  name: '多卷网文结构',
  structure: '多卷网文结构',
  description: '面向长篇连载的多卷升级结构，强调阶段目标、持续爽点和卷尾钩子。',
  suitableGenres: ['玄幻', '仙侠', '都市', '游戏', '科幻'],
  defaultChapterCount: 200,
  phases: [
    {
      id: 'opening-volume',
      name: '开局卷',
      description: '建立金手指、核心目标和首个成长闭环。',
      chapterRatio: 0.15,
      goals: ['开局困境', '核心外挂或优势', '第一目标', '首个敌人'],
      keyBeats: ['强开篇', '能力展示', '小目标完成', '更大世界露出'],
      plotPoints: ['开局爽点', '设定钩子', '首战胜利', '卷尾升级']
    },
    {
      id: 'growth-volume',
      name: '成长卷',
      description: '通过副本、比赛、任务或城市地图持续扩展能力与人脉。',
      chapterRatio: 0.22,
      goals: ['能力升级', '伙伴加入', '资源争夺', '地图扩展'],
      keyBeats: ['阶段挑战', '对手升级', '资源获取', '名声传播'],
      plotPoints: ['升级节奏', '副本闭环', '关系扩张', '新势力登场']
    },
    {
      id: 'conflict-volume',
      name: '大冲突卷',
      description: '让多个势力和长期伏笔汇聚，形成更大规模的正面对抗。',
      chapterRatio: 0.25,
      goals: ['势力冲突', '旧伏笔引爆', '主线深化', '高阶敌人'],
      keyBeats: ['阵营对立', '盟友考验', '大战爆发', '阶段胜利'],
      plotPoints: ['势力战', '伏笔回收', '主线推进', '卷尾反转']
    },
    {
      id: 'ascension-volume',
      name: '跃迁卷',
      description: '通过境界、地图或身份跃迁打开新篇章，同时重估旧关系。',
      chapterRatio: 0.2,
      goals: ['地图跃迁', '身份变化', '规则升级', '旧账清算'],
      keyBeats: ['突破门槛', '新规则', '旧敌升级', '新目标确立'],
      plotPoints: ['世界扩大', '身份反转', '规则刷新', '新主线启动']
    },
    {
      id: 'final-volume',
      name: '终局卷',
      description: '汇总长期目标、人物关系和世界级矛盾，完成最终兑现。',
      chapterRatio: 0.18,
      goals: ['终极真相', '最终联盟', '大决战', '新秩序'],
      keyBeats: ['全线回收', '最终选择', '高潮对决', '后日谈'],
      plotPoints: ['长期伏笔兑现', '最终胜利代价', '主题落点', '余韵']
    }
  ]
}

export const outlineStructureTemplates: OutlineTemplate[] = [
  threeActOutlineTemplate,
  heroJourneyOutlineTemplate,
  fourActOutlineTemplate,
  sevenPointOutlineTemplate,
  webNovelOutlineTemplate
]

function toPlotTemplate(template: TemplateDefinition): PlotTemplate {
  let start = 1

  const volumes = template.phases.map((phase, index) => {
    const isLast = index === template.phases.length - 1
    const chapterCount = isLast
      ? template.defaultChapterCount - start + 1
      : Math.max(1, Math.round(template.defaultChapterCount * phase.chapterRatio))
    const end = Math.min(template.defaultChapterCount, start + chapterCount - 1)
    const volume: VolumeTemplate = {
      number: index + 1,
      title: phase.name,
      theme: phase.description,
      chapterRange: { start, end },
      mainEvents: [...phase.goals],
      plotPoints: [...phase.plotPoints]
    }
    start = end + 1
    return volume
  })

  return {
    structure: template.structure,
    totalChapters: template.defaultChapterCount,
    description: template.description,
    volumes
  }
}

export const threeActTemplate: PlotTemplate = toPlotTemplate(threeActOutlineTemplate)
export const heroJourneyTemplate: PlotTemplate = toPlotTemplate(heroJourneyOutlineTemplate)
export const fourActTemplate: PlotTemplate = toPlotTemplate(fourActOutlineTemplate)
export const sevenPointTemplate: PlotTemplate = toPlotTemplate(sevenPointOutlineTemplate)
export const webNovelTemplate: PlotTemplate = toPlotTemplate(webNovelOutlineTemplate)

export const outlineTemplates: PlotTemplate[] = [
  threeActTemplate,
  heroJourneyTemplate,
  fourActTemplate,
  sevenPointTemplate,
  webNovelTemplate
]

export function getTemplateByStructure(structure: string): PlotTemplate | undefined {
  return outlineTemplates.find(template => template.structure === structure)
}

export function getOutlineTemplateById(id: string): OutlineTemplate | undefined {
  return outlineStructureTemplates.find(template => template.id === id)
}

export function getOutlineTemplateByStructure(structure: string): OutlineTemplate | undefined {
  return outlineStructureTemplates.find(template => template.structure === structure)
}

export function generateVolumesFromTemplate(template: PlotTemplate): VolumeTemplate[] {
  return template.volumes.map(volume => ({
    ...volume,
    chapterRange: { ...volume.chapterRange },
    mainEvents: [...volume.mainEvents],
    plotPoints: [...volume.plotPoints]
  }))
}

export function generateChapterTemplates(template: PlotTemplate): Array<{
  chapterNumber: number
  title: string
  suggestedContent: string
  volumeNumber: number
  keyEvents: string[]
}> {
  const chapters: Array<{
    chapterNumber: number
    title: string
    suggestedContent: string
    volumeNumber: number
    keyEvents: string[]
  }> = []

  template.volumes.forEach(volume => {
    const start = volume.chapterRange.start
    const end = volume.chapterRange.end
    const count = end - start + 1

    for (let i = 0; i < count; i++) {
      const chapterNumber = start + i
      const eventIndex = Math.floor(i / count * volume.mainEvents.length)

      chapters.push({
        chapterNumber,
        title: `第${chapterNumber}章`,
        suggestedContent: volume.mainEvents[Math.min(eventIndex, volume.mainEvents.length - 1)],
        volumeNumber: volume.number,
        keyEvents: volume.plotPoints.slice(0, 2)
      })
    }
  })

  return chapters
}
