/**
 * 测试世界观生成功能
 */
async function testWorldGeneration() {
  console.log('🧪 测试世界观生成功能')
  console.log('='.repeat(50))

  try {
    // 第一步：加载项目配置
    console.log('📦 加载项目配置...')
    const { useProjectStore } = await import('/src/stores/project.ts')
    const projectStore = useProjectStore()

    await projectStore.loadProjects()

    // 检查是否有项目
    if (!projectStore.currentProject && projectStore.projects.length === 0) {
      console.log('⚠️ 没有项目，创建测试项目...')
      await projectStore.createProject('测试项目', '玄幻', 100000)
    }

    // 如果没有打开的项目，打开第一个
    if (!projectStore.currentProject && projectStore.projects.length > 0) {
      console.log('📂 打开项目:', projectStore.projects[0].title)
      await projectStore.openProject(projectStore.projects[0].id)
    }

    console.log('✅ 项目已加载')
    console.log('当前项目:', projectStore.currentProject?.title)

    // 检查全局配置
    if (!projectStore.currentProject?.config && !projectStore.globalConfig) {
      console.log('⚠️ 项目没有配置，加载全局配置...')
      await projectStore.loadGlobalConfig()
    }

    const config = projectStore.currentProject?.config || projectStore.globalConfig

    if (!config) {
      console.error('❌ 未找到配置！')
      console.log('请确保：')
      console.log('  1. 已在配置页面添加了模型提供商')
      console.log('  2. 已启用提供商')
      console.log('  3. 已配置API密钥')
      return
    }

    console.log('✅ 配置已加载')
    console.log('提供商数量:', config.providers?.length || 0)

    // 第二步：初始化AI Store
    console.log('\n🔧 初始化 AI Store...')
    const { useAIStore } = await import('/src/stores/ai.ts')
    const aiStore = useAIStore()

    // 强制重新初始化
    aiStore.isInitialized = false
    aiStore.initialize()

    if (!aiStore.checkInitialized()) {
      console.error('❌ AI Store未初始化')
      console.log('错误:', aiStore.error)
      return
    }

    console.log('✅ AI Store已初始化')
    console.log('配置的模型:', aiStore.configuredModel)

    // 测试提示词
    const prompt = `请创建一个玄幻小说的世界观。主题：修仙。

请以JSON格式返回：
{
  "name": "世界名称",
  "era": { "time": "时代", "techLevel": "科技水平", "socialForm": "社会形态" },
  "geography": {
    "locations": [
      { "name": "地点名", "description": "描述", "importance": "high" }
    ]
  }
}

只返回JSON，不要其他文字。`

    console.log('\n发送提示词...')
    const startTime = Date.now()

    const response = await aiStore.chat(
      [{ role: 'user', content: prompt }],
      { type: 'worldbuilding', complexity: 'high', priority: 'quality' },
      { maxTokens: 500 }
    )

    const elapsed = Date.now() - startTime

    console.log('\n✅ AI调用成功!')
    console.log('响应时间:', elapsed, 'ms')
    console.log('使用Token:', response.usage)
    console.log('\n原始响应:')
    console.log(response.content)
    console.log('\n响应长度:', response.content.length, '字符')

    // 尝试解析JSON
    if (response.content && response.content.trim()) {
      try {
        let jsonStr = response.content.trim()

        // 提取JSON
        const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          jsonStr = jsonMatch[1]
        } else if (jsonStr.includes('```')) {
          jsonStr = jsonStr.replace(/```\w*\n?/g, '').trim()
        }

        const parsed = JSON.parse(jsonStr)
        console.log('\n✅ JSON解析成功!')
        console.log('解析结果:', parsed)
      } catch (error) {
        console.error('\n❌ JSON解析失败:', error.message)
        console.log('尝试解析的内容:', jsonStr)
      }
    } else {
      console.error('\n❌ 响应内容为空!')
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    console.error('错误堆栈:', error.stack)
  }
}

// 运行测试
testWorldGeneration()
