/**
 * 冲突检测系统测试脚本
 */

import type { Project, Chapter, Character, WorldSetting } from '@/types'
import { ConflictDetector, DEFAULT_CONFIG } from './conflictDetector'

/**
 * 创建测试项目
 */
function createTestProject(): Project {
  const now = new Date()

  // 创建测试人物
  const characters: Character[] = [
    {
      id: 'char-1',
      name: '李明',
      aliases: ['小明', '明哥'],
      gender: 'male',
      age: 25,
      appearance: '身材高大，面容刚毅，双眼炯炯有神',
      personality: ['勇敢', '正义', '聪明'],
      values: ['正义', '友情'],
      background: '出身武林世家，自幼习武',
      motivation: '成为最强武者',
      abilities: [
        {
          id: 'ability-1',
          name: '剑法',
          description: '家传剑法，威力强大',
          level: '高级'
        }
      ],
      relationships: [],
      appearances: [],
      development: [],
      aiGenerated: false
    },
    {
      id: 'char-2',
      name: '王芳',
      aliases: ['芳姐'],
      gender: 'female',
      age: 22,
      appearance: '容貌秀丽，身姿轻盈',
      personality: ['温柔', '善良', '聪明'],
      values: ['爱情', '家庭'],
      background: '书香门第，琴棋书画样样精通',
      motivation: '寻找真爱',
      abilities: [],
      relationships: [],
      appearances: [],
      development: [],
      aiGenerated: false
    }
  ]

  // 创建测试章节
  const chapters: Chapter[] = [
    {
      id: 'chapter-1',
      number: 1,
      title: '第一章 开始',
      content: '李明站在山顶，望着远方。他是一个勇敢的青年，今年25岁。他的好朋友王芳走了过来，今年才20岁。李明挥舞着手中的长剑，展现出高超的剑法。',
      wordCount: 100,
      outline: {
        chapterId: 'chapter-1',
        title: '第一章 开始',
        scenes: [],
        characters: ['李明', '王芳'],
        location: '山顶',
        goals: [],
        conflicts: [],
        resolutions: [],
        status: 'completed'
      },
      status: 'final',
      generatedBy: 'manual',
      generationTime: now,
      checkpoints: []
    },
    {
      id: 'chapter-2',
      number: 2,
      title: '第二章 冲突',
      content: '李明此时却表现得胆小怯懦，不敢面对敌人。王芳已经23岁了，她用温柔的声音安慰着李明。突然，李明使用了从未展示过的魔法能力，击败了敌人。',
      wordCount: 100,
      outline: {
        chapterId: 'chapter-2',
        title: '第二章 冲突',
        scenes: [],
        characters: ['李明', '王芳'],
        location: '山谷',
        goals: [],
        conflicts: [],
        resolutions: [],
        status: 'completed'
      },
      status: 'final',
      generatedBy: 'manual',
      generationTime: now,
      checkpoints: []
    },
    {
      id: 'chapter-3',
      number: 3,
      title: '第三章 转折',
      content: '时光流逝，转眼间一年过去了。李明现在已经30岁了，但他的外貌却没有丝毫变化。他再次站在山顶，仿佛回到了第一章的场景。',
      wordCount: 100,
      outline: {
        chapterId: 'chapter-3',
        title: '第三章 转折',
        scenes: [],
        characters: ['李明'],
        location: '山顶',
        goals: [],
        conflicts: [],
        resolutions: [],
        status: 'completed'
      },
      status: 'final',
      generatedBy: 'manual',
      generationTime: now,
      checkpoints: []
    }
  ]

  // 创建测试项目
  const project: Project = {
    id: 'test-project',
    title: '测试小说',
    description: '用于测试冲突检测系统的小说',
    genre: '玄幻',
    targetWords: 100000,
    currentWords: 300,
    status: 'writing',
    createdAt: now,
    updatedAt: now,
    world: {
      id: 'world-1',
      name: '武侠世界',
      era: {
        time: '古代',
        techLevel: '低科技',
        socialForm: '武林'
      },
      geography: {
        locations: [
          {
            id: 'loc-1',
            name: '山顶',
            description: '高山之巅',
            importance: 'high'
          }
        ]
      },
      powerSystem: {
        name: '武学',
        levels: [
          { name: '入门', description: '初学武艺' },
          { name: '高级', description: '武艺高强' },
          { name: '大师', description: '登峰造极' }
        ],
        skills: [],
        items: []
      },
      factions: [],
      rules: [
        {
          id: 'rule-1',
          name: '年龄限制',
          description: '修炼武学需要从小开始'
        }
      ],
      aiGenerated: false
    },
    characters,
    outline: {
      id: 'outline-1',
      synopsis: '测试小说大纲',
      theme: '成长',
      mainPlot: {
        id: 'plot-1',
        name: '主线',
        description: '主角成长之路'
      },
      subPlots: [],
      volumes: [],
      chapters: chapters.map(ch => ch.outline),
      foreshadowings: [
        {
          id: 'foreshadow-1',
          description: '李明的神秘身世',
          plantChapter: 1,
          status: 'planted'
        }
      ]
    },
    chapters,
    config: {
      preset: 'standard',
      providers: [],
      planningModel: '',
      writingModel: '',
      checkingModel: '',
      planningDepth: 'medium',
      writingDepth: 'standard',
      enableQualityCheck: true,
      qualityThreshold: 7,
      maxCostPerChapter: 1,
      enableAISuggestions: true
    }
  }

  return project
}

/**
 * 运行测试
 */
export async function runConflictDetectionTest(): Promise<void> {
  console.log('========================================')
  console.log('冲突检测系统测试')
  console.log('========================================\n')

  try {
    // 创建测试项目
    console.log('1. 创建测试项目...')
    const project = createTestProject()
    console.log('   ✓ 测试项目创建成功\n')

    // 创建冲突检测器
    console.log('2. 初始化冲突检测器...')
    const detector = new ConflictDetector(project, {
      ...DEFAULT_CONFIG,
      minConfidenceThreshold: 0.5 // 降低阈值以便检测更多问题
    })
    console.log('   ✓ 冲突检测器初始化成功\n')

    // 执行检测
    console.log('3. 开始执行冲突检测...\n')
    const result = await detector.detect()

    // 显示统计信息
    console.log('4. 检测结果统计:')
    console.log('   总耗时:', result.duration, 'ms')
    console.log('   发现冲突:', result.statistics.total, '个')
    console.log('   - 严重:', result.statistics.critical, '个')
    console.log('   - 警告:', result.statistics.warning, '个')
    console.log('   - 提示:', result.statistics.info, '个\n')

    // 显示详细冲突
    if (result.conflicts.length > 0) {
      console.log('5. 检测到的冲突详情:\n')
      result.conflicts.forEach((conflict, index) => {
        console.log(`[${index + 1}] ${conflict.title}`)
        console.log(`    类型: ${conflict.type}`)
        console.log(`    严重程度: ${conflict.severity}`)
        console.log(`    描述: ${conflict.description}`)

        if (conflict.evidences.length > 0) {
          console.log('    证据:')
          conflict.evidences.forEach(evidence => {
            console.log(`      - ${evidence.description}`)
            if (evidence.chapterNumber) {
              console.log(`        章节: 第${evidence.chapterNumber}章`)
            }
          })
        }

        if (conflict.suggestions.length > 0) {
          console.log('    修复建议:')
          conflict.suggestions.forEach(suggestion => {
            console.log(`      - ${suggestion.description} (${(suggestion.confidence * 100).toFixed(0)}% 置信度)`)
          })
        }
        console.log('')
      })
    } else {
      console.log('5. 未检测到冲突\n')
    }

    // 按类型分组显示
    console.log('6. 按类型分组:')
    Object.entries(result.statistics.byType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} 个`)
    })
    console.log('')

    // 按章节分组显示
    console.log('7. 按章节分组:')
    Object.entries(result.statistics.byChapter)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([chapter, count]) => {
        console.log(`   第${chapter}章: ${count} 个冲突`)
      })
    console.log('')

    console.log('========================================')
    console.log('测试完成！')
    console.log('========================================')

  } catch (error) {
    console.error('测试失败:', error)
    throw error
  }
}

/**
 * 导出测试函数供控制台调用
 */
if (typeof window !== 'undefined') {
  (window as any).runConflictDetectionTest = runConflictDetectionTest
  console.log('提示: 可以在控制台运行 runConflictDetectionTest() 来执行测试')
}
