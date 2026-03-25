// 大纲模板数据
import type { PlotTemplate, VolumeTemplate } from '@/types'

/**
 * 三幕结构模板
 */
export const threeActTemplate: PlotTemplate = {
  structure: '三幕结构',
  totalChapters: 60,
  description: '经典的三幕结构：铺垫-对抗-解决，适合大多数商业小说。',
  volumes: [
    {
      number: 1,
      title: '第一幕：铺垫',
      theme: '世界观建立与人物引入',
      chapterRange: { start: 1, end: 20 },
      mainEvents: [
        '主角出场，展示日常生活',
        '激励事件发生',
        '主角决定踏上旅程',
        '世界观和规则建立',
        '主要人物关系建立'
      ],
      plotPoints: [
        '开场吸引读者',
        '建立主角目标和动机',
        '引入核心冲突',
        '第一幕高潮：决定性事件'
      ]
    },
    {
      number: 2,
      title: '第二幕：对抗',
      theme: '冲突升级与成长',
      chapterRange: { start: 21, end: 45 },
      mainEvents: [
        '试炼与盟友',
        '挑战与失败',
        '中点转折',
        '危机加深',
        '黑暗时刻'
      ],
      plotPoints: [
        '探索新世界',
        '结识伙伴和敌人',
        '能力的成长和磨练',
        '中点：重大发现或转变',
        '看似无望的低谷',
        '重整旗鼓准备最终对决'
      ]
    },
    {
      number: 3,
      title: '第三幕：解决',
      theme: '高潮与结局',
      chapterRange: { start: 46, end: 60 },
      mainEvents: [
        '最终准备',
        '终极对决',
        '高潮时刻',
        '胜利或失败',
        '新平衡建立'
      ],
      plotPoints: [
        '集结所有力量',
        '面对终极挑战',
        '核心冲突解决',
        '人物弧光完成',
        '世界观新秩序'
      ]
    }
  ]
}

/**
 * 英雄之旅模板
 */
export const heroJourneyTemplate: PlotTemplate = {
  structure: '英雄之旅',
  totalChapters: 80,
  description: '基于约瑟夫·坎贝尔的单一神话理论，包含启程-启蒙-归来三个阶段。',
  volumes: [
    {
      number: 1,
      title: '启程篇',
      theme: '召唤与跨越',
      chapterRange: { start: 1, end: 25 },
      mainEvents: [
        '平凡世界：展示主角日常',
        '冒险召唤：打破平静',
        '拒绝召唤：内心挣扎',
        '遇见导师：获得指引',
        '跨越第一道门槛：踏入非凡世界'
      ],
      plotPoints: [
        '建立主角平凡生活',
        '引入核心冲突',
        '展示主角内心恐惧',
        '获得关键道具或知识',
        '正式踏上旅程'
      ]
    },
    {
      number: 2,
      title: '启蒙篇',
      theme: '试炼与转化',
      chapterRange: { start: 26, end: 55 },
      mainEvents: [
        '试炼、盟友与敌人',
        '接近最深的洞穴',
        '磨难：面对最大恐惧',
        '奖赏：获得宝物',
        '返回之路'
      ],
      plotPoints: [
        '结识重要伙伴',
        '能力与智慧的考验',
        '面对内心的阴影',
        '关键的觉醒或收获',
        '追逐与逃亡',
        '成长的代价'
      ]
    },
    {
      number: 3,
      title: '归来篇',
      theme: '复活与带回',
      chapterRange: { start: 56, end: 80 },
      mainEvents: [
        '复活：最终考验',
        '携万能药归来',
        '两个世界的融合',
        '新生活的开始'
      ],
      plotPoints: [
        '最后的净化',
        '终极对决',
        '胜利与代价',
        '回归平凡世界',
        '世界的改变',
        '主角的蜕变完成'
      ]
    }
  ]
}

/**
 * 起承转合模板（四段式）
 */
export const fourActTemplate: PlotTemplate = {
  structure: '起承转合',
  totalChapters: 50,
  description: '中国传统叙事结构：起-承-转-合，适合东方风格的故事创作。',
  volumes: [
    {
      number: 1,
      title: '起',
      theme: '开篇布局',
      chapterRange: { start: 1, end: 12 },
      mainEvents: [
        '引子与背景',
        '人物出场与关系建立',
        '核心矛盾初现',
        '故事基调奠定'
      ],
      plotPoints: [
        '吸引读者注意',
        '介绍主要人物',
        '埋下伏笔',
        '引出主线'
      ]
    },
    {
      number: 2,
      title: '承',
      theme: '承接发展',
      chapterRange: { start: 13, end: 25 },
      mainEvents: [
        '情节展开与深化',
        '矛盾逐步激化',
        '人物关系变化',
        '支线交织'
      ],
      plotPoints: [
        '扩展故事维度',
        '加深人物刻画',
        '铺陈细节',
        '为转折做铺垫'
      ]
    },
    {
      number: 3,
      title: '转',
      theme: '转折高潮',
      chapterRange: { start: 26, end: 40 },
      mainEvents: [
        '重大转折事件',
        '矛盾集中爆发',
        '人物命运突变',
        '高潮迭起'
      ],
      plotPoints: [
        '打破平衡',
        '意想不到的发展',
        '危机与机遇并存',
        '核心冲突对决'
      ]
    },
    {
      number: 4,
      title: '合',
      theme: '收束结局',
      chapterRange: { start: 41, end: 50 },
      mainEvents: [
        '矛盾解决',
        '命运归宿',
        '伏笔揭晓',
        '主题升华'
      ],
      plotPoints: [
        '尘埃落定',
        '揭示真相',
        '人物成长完成',
        '余韵悠长'
      ]
    }
  ]
}

/**
 * 五幕结构模板
 */
export const fiveActTemplate: PlotTemplate = {
  structure: '五幕结构',
  totalChapters: 70,
  description: '经典戏剧五幕结构：铺垫-上升-高潮-下降-结局，层次分明。',
  volumes: [
    {
      number: 1,
      title: '第一幕：铺垫',
      theme: '开篇与引入',
      chapterRange: { start: 1, end: 14 },
      mainEvents: [
        '背景介绍',
        '人物出场',
        '世界观建立',
        '核心线索埋设'
      ],
      plotPoints: [
        '吸引注意',
        '建立基调',
        '引发期待'
      ]
    },
    {
      number: 2,
      title: '第二幕：上升',
      theme: '发展与积累',
      chapterRange: { start: 15, end: 28 },
      mainEvents: [
        '情节推进',
        '矛盾显现',
        '关系发展',
        '压力积累'
      ],
      plotPoints: [
        '深化冲突',
        '增加张力',
        '提升期待'
      ]
    },
    {
      number: 3,
      title: '第三幕：高潮',
      theme: '巅峰对决',
      chapterRange: { start: 29, end: 42 },
      mainEvents: [
        '关键转折',
        '矛盾爆发',
        '终极对抗',
        '命运抉择'
      ],
      plotPoints: [
        '冲突顶点',
        '关键抉择',
        '高潮事件'
      ]
    },
    {
      number: 4,
      title: '第四幕：下降',
      theme: '回落与揭示',
      chapterRange: { start: 43, end: 56 },
      mainEvents: [
        '高潮后的余波',
        '真相揭示',
        '代价显现',
        '关系重组'
      ],
      plotPoints: [
        '矛盾缓解',
        '伏笔揭晓',
        '新秩序初现'
      ]
    },
    {
      number: 5,
      title: '第五幕：结局',
      theme: '收尾与新生',
      chapterRange: { start: 57, end: 70 },
      mainEvents: [
        '最终解决',
        '命运归宿',
        '新平衡建立',
        '主题升华'
      ],
      plotPoints: [
        '故事收束',
        '余韵营造',
        '完美收官'
      ]
    }
  ]
}

/**
 * 所有可用模板
 */
export const outlineTemplates: PlotTemplate[] = [
  threeActTemplate,
  heroJourneyTemplate,
  fourActTemplate,
  fiveActTemplate
]

/**
 * 根据结构名称获取模板
 */
export function getTemplateByStructure(structure: string): PlotTemplate | undefined {
  return outlineTemplates.find(t => t.structure === structure)
}

/**
 * 根据模板生成卷数据
 */
export function generateVolumesFromTemplate(template: PlotTemplate): VolumeTemplate[] {
  return template.volumes.map(v => ({
    ...v,
    mainEvents: [...v.mainEvents],
    plotPoints: [...v.plotPoints]
  }))
}

/**
 * 根据模板和章节数生成章节大纲模板
 */
export function generateChapterTemplates(template: PlotTemplate) {
  const chapters: Array<{
    chapterNumber: number
    title: string
    suggestedContent: string
    volumeNumber: number
    keyEvents: string[]
  }> = []

  const chaptersPerVolume = Math.floor(template.totalChapters / template.volumes.length)

  template.volumes.forEach((volume, vIndex) => {
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
