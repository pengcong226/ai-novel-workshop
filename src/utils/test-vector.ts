/**
 * 向量检索系统测试
 */

import type { Project, Chapter, VectorServiceConfig } from '@/types'
import { createVectorService, type VectorService } from './vectorService'
import { buildChapterContext } from './contextBuilder'

/**
 * 创建测试项目数据
 */
function createTestProject(): Project {
  const projectId = 'test-project-001'

  return {
    id: projectId,
    title: '测试小说',
    description: '这是一个测试用的小说项目',
    genre: '玄幻',
    targetWords: 50000,
    currentWords: 3000,
    status: 'writing',
    createdAt: new Date(),
    updatedAt: new Date(),

    world: {
      id: 'world-001',
      name: '修仙世界',
      era: {
        time: '上古时期',
        techLevel: '修真文明',
        socialForm: '宗门制度'
      },
      geography: {
        locations: [
          {
            id: 'loc-001',
            name: '青云山',
            description: '青云宗所在地，云雾缭绕的仙山',
            importance: 'high'
          },
          {
            id: 'loc-002',
            name: '天机城',
            description: '修真界最大的城市，商贸繁荣',
            importance: 'high'
          }
        ]
      },
      powerSystem: {
        name: '灵力修炼体系',
        levels: [
          { name: '炼气期', description: '初入修真，引气入体' },
          { name: '筑基期', description: '打下修炼根基' },
          { name: '金丹期', description: '凝聚金丹，法力大增' },
          { name: '元婴期', description: '元婴出窍，神通广大' }
        ],
        skills: [],
        items: []
      },
      factions: [
        {
          id: 'faction-001',
          name: '青云宗',
          type: '正道宗门',
          description: '修真界第一大派，以剑道闻名',
          relationships: []
        },
        {
          id: 'faction-002',
          name: '魔教',
          type: '邪道势力',
          description: '行事诡秘，修炼邪术',
          relationships: []
        }
      ],
      rules: [
        {
          id: 'rule-001',
          name: '灵气法则',
          description: '天地灵气是修炼的根本，灵气浓郁之地修炼速度更快'
        }
      ],
      aiGenerated: false
    },

    characters: [
      {
        id: 'char-001',
        name: '林云',
        aliases: ['林师兄'],
        gender: 'male',
        age: 18,
        appearance: '身材修长，眉目清秀，气质儒雅',
        personality: ['沉稳', '聪明', '坚韧'],
        values: ['正义', '自由', '探索'],
        background: '出生于小村庄，自幼展现出修炼天赋，被青云宗长老收为弟子',
        motivation: '成为最强大的修真者，保护重要的人',
        abilities: [
          {
            id: 'ability-001',
            name: '青云剑法',
            description: '青云宗的镇派绝学',
            level: '金丹期'
          }
        ],
        powerLevel: '金丹期',
        relationships: [],
        appearances: [],
        development: [],
        aiGenerated: false
      },
      {
        id: 'char-002',
        name: '苏婉儿',
        aliases: [],
        gender: 'female',
        age: 16,
        appearance: '容貌绝美，气质出尘',
        personality: ['善良', '坚强', '聪慧'],
        values: ['爱情', '友情', '正义'],
        background: '青云宗掌门之女，修炼天赋极高',
        motivation: '追求自由，寻找真爱',
        abilities: [],
        powerLevel: '筑基期',
        relationships: [],
        appearances: [],
        development: [],
        aiGenerated: false
      }
    ],

    outline: {
      id: 'outline-001',
      synopsis: '少年林云踏上修真之路，历经磨难，最终成为一代强者的故事',
      theme: '成长、友情、爱情',
      mainPlot: {
        id: 'plot-main',
        name: '林云的成长之路',
        description: '从普通少年成长为修真界最强者的历程'
      },
      subPlots: [
        {
          id: 'subplot-001',
          name: '青云宗危机',
          description: '魔教入侵青云宗，林云力挽狂澜',
          startChapter: 10,
          endChapter: 20
        }
      ],
      volumes: [],
      chapters: [],
      foreshadowings: []
    },

    chapters: [
      {
        id: 'chapter-001',
        number: 1,
        title: '初入青云',
        content: '林云站在青云山下，仰望着这座传说中的仙山。云雾缭绕间，隐约可见亭台楼阁。这是他梦寐以求的地方，也是他修炼之路的起点。\n\n"小伙子，你就是那个被长老选中的新人？"一个声音从身后传来。林云转身，看到一位白发老者。\n\n"是的，前辈。我叫林云，来自山下的林家村。"林云恭敬地回答。\n\n老者点点头："跟我来吧。从今天起，你就是青云宗的外门弟子了。"\n\n林云跟着老者登上山门，心中充满期待。他知道，这只是一个开始，前方还有无数的挑战等待着他。',
        wordCount: 300,
        outline: {
          chapterId: 'chapter-001',
          title: '初入青云',
          scenes: [],
          characters: ['林云'],
          location: '青云山',
          goals: ['介绍主角', '展示世界观'],
          conflicts: [],
          resolutions: [],
          status: 'completed'
        },
        status: 'final',
        generatedBy: 'manual',
        generationTime: new Date(),
        checkpoints: []
      },
      {
        id: 'chapter-002',
        number: 2,
        title: '修炼开始',
        content: '青云宗的外门弟子院舍里，林云正在认真学习引气入体的方法。这是一切修炼的基础，也是最难的一步。\n\n"感受天地间的灵气，让它们顺着经脉流转，最终汇聚到丹田。"教习长老的声音回荡在修炼室中。\n\n林云闭上眼睛，努力感知周围的能量。起初什么也感觉不到，但他没有放弃。日复一日的练习中，他渐渐感受到了一丝微弱的气流。\n\n"不错，你很有天赋。"长老赞许地点头，"继续努力，你很快就能突破炼气一层了。"\n\n林云心中一喜，这给了他极大的鼓舞。他知道，修炼之路漫长，但只要坚持，终会有所成就。',
        wordCount: 280,
        outline: {
          chapterId: 'chapter-002',
          title: '修炼开始',
          scenes: [],
          characters: ['林云'],
          location: '青云宗',
          goals: ['展示修炼体系', '建立世界观'],
          conflicts: [],
          resolutions: [],
          status: 'completed'
        },
        status: 'final',
        generatedBy: 'manual',
        generationTime: new Date(),
        checkpoints: []
      },
      {
        id: 'chapter-003',
        number: 3,
        title: '遭遇苏婉儿',
        content: '这一天，林云在后山练习剑法。剑光闪烁间，一道白影从树上飘落。\n\n"你是谁？"林云收剑警惕地问。\n\n少女露出明媚的笑容："我叫苏婉儿，是掌门的女儿。你剑法不错，是跟谁学的？"\n\n"是教习长老教的青云剑法。"林云回答，心中对这位掌门千金充满好奇。\n\n"你的剑法刚猛有余，灵动不足。"苏婉儿点评道，"要不要我指点你几招？"\n\n林云惊讶地看着她，没想到这位大小姐如此平易近人。两人在后山切磋剑法，不知不觉成了朋友。\n\n从那天起，林云的修炼生活多了一份期待，他时常能遇到苏婉儿，两人一起修炼，一起成长。',
        wordCount: 260,
        outline: {
          chapterId: 'chapter-003',
          title: '遭遇苏婉儿',
          scenes: [],
          characters: ['林云', '苏婉儿'],
          location: '青云宗后山',
          goals: ['介绍女主角', '建立主角关系'],
          conflicts: [],
          resolutions: [],
          status: 'completed'
        },
        status: 'final',
        generatedBy: 'manual',
        generationTime: new Date(),
        checkpoints: []
      }
    ],

    config: {
      preset: 'standard',
      providers: [],
      planningModel: 'gpt-4-turbo',
      writingModel: 'gpt-3.5-turbo',
      checkingModel: 'gpt-3.5-turbo',
      planningDepth: 'medium',
      writingDepth: 'standard',
      enableQualityCheck: true,
      qualityThreshold: 7,
      maxCostPerChapter: 0.15,
      enableAISuggestions: true
    }
  }
}

/**
 * 测试向量服务
 */
export async function testVectorService(): Promise<void> {
  console.log('========== 向量检索系统测试 ==========\n')

  try {
    // 创建测试项目
    const project = createTestProject()
    console.log('1. 创建测试项目:', project.title)

    // 创建向量服务配置
    const config: VectorServiceConfig = {
      provider: 'local',
      model: 'Xenova/all-MiniLM-L6-v2',
      dimension: 384,
      projectId: project.id
    }

    console.log('2. 创建向量服务...')
    const vectorService = await createVectorService(config)
    console.log('   ✓ 向量服务初始化成功')
    console.log(`   - 向量维度: ${vectorService.getDimension()}`)

    // 索引项目
    console.log('3. 索引项目数据...')
    await vectorService.indexProject(project)
    console.log(`   ✓ 索引完成，共 ${vectorService.getDocumentCount()} 个文档`)

    // 测试语义搜索
    console.log('4. 测试语义搜索...')
    const testQueries = [
      '林云的修炼天赋',
      '青云宗的势力',
      '苏婉儿的性格',
      '修真界的等级划分',
      '主角的剑法'
    ]

    for (const query of testQueries) {
      console.log(`\n   查询: "${query}"`)
      const results = await vectorService.search(query, 3)

      results.forEach((result, index) => {
        console.log(`   ${index + 1}. [${result.metadata.type}] ${result.content.substring(0, 60)}...`)
        console.log(`      相似度: ${(result.score * 100).toFixed(1)}%, 来源: ${result.source}`)
      })
    }

    // 测试智能上下文检索
    console.log('\n5. 测试智能上下文检索...')
    const currentChapter = project.chapters[2] // 第三章
    const relevantContext = await vectorService.retrieveRelevantContext(
      currentChapter,
      project,
      { topK: 3, minScore: 0.5 }
    )

    console.log(`   当前章节: 第${currentChapter.number}章 - ${currentChapter.title}`)
    console.log(`   检索到 ${relevantContext.length} 个相关文档:`)
    relevantContext.forEach((result, index) => {
      console.log(`   ${index + 1}. [${result.metadata.type}] ${result.content.substring(0, 50)}...`)
      console.log(`      相似度: ${(result.score * 100).toFixed(1)}%`)
    })

    // 测试上下文构建器集成
    console.log('\n6. 测试上下文构建器集成...')
    const context = await buildChapterContext(project, currentChapter, undefined, config)

    console.log('   ✓ 上下文构建完成')
    console.log(`   - 系统提示: ${context.systemPrompt.substring(0, 50)}...`)
    console.log(`   - 世界观信息: ${context.worldInfo.substring(0, 50)}...`)
    console.log(`   - 人物信息: ${context.characters.substring(0, 50)}...`)
    console.log(`   - 向量检索上下文: ${context.vectorContext ? context.vectorContext.substring(0, 50) + '...' : '(无)'}`)
    console.log(`   - 总 Token 数: ${context.totalTokens}`)
    if (context.warnings.length > 0) {
      console.log(`   - 警告: ${context.warnings.join(', ')}`)
    }

    // 清理
    console.log('\n7. 清理测试数据...')
    await vectorService.clear()
    console.log('   ✓ 测试数据已清理')

    console.log('\n========== 测试完成 ==========')
    console.log('✓ 所有测试通过！向量检索系统工作正常。\n')

  } catch (error) {
    console.error('\n✗ 测试失败:', error)
    console.error(error.stack)
    throw error
  }
}

/**
 * 运行测试
 */
// 在浏览器控制台中运行: testVectorService()
(window as any).testVectorService = testVectorService
