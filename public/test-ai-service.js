/**
 * AI服务自动化测试脚本
 *
 * 使用方法：
 * 1. 在浏览器打开 http://localhost:3000
 * 2. 打开控制台（F12）
 * 3. 复制粘贴这个脚本
 * 4. 按回车运行
 *
 * 或者：
 * 在控制台运行：import('/test-ai-service.js')
 */

(async function testAIService() {
  console.log('========================================')
  console.log('🧪 开始自动化测试 AI 服务')
  console.log('========================================')

  const results = {
    passed: [],
    failed: [],
    warnings: []
  }

  try {
    // ==================== 测试 1：检查项目配置 ====================
    console.log('\n📋 测试 1：检查项目配置')
    console.log('----------------------------------------')

    const projectStore = await import('/src/stores/project.ts').then(m => m.useProjectStore())
    await projectStore.loadProjects()

    const config = projectStore.currentProject?.config || projectStore.globalConfig

    if (!config) {
      results.failed.push('❌ 配置不存在')
      console.error('❌ 配置不存在！请先打开项目或在配置页面设置')
    } else {
      results.passed.push('✅ 配置存在')
      console.log('✅ 配置存在')

      // 检查providers
      console.log('\n📦 检查提供商配置:')
      if (!config.providers || config.providers.length === 0) {
        results.failed.push('❌ 没有配置提供商')
        console.error('❌ 没有配置任何提供商！')
        console.log('请前往"项目配置"页面添加模型提供商')
      } else {
        console.log(`✅ 配置了 ${config.providers.length} 个提供商`)
        config.providers.forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.name} (${p.type})`)
          console.log(`     - Base URL: ${p.baseUrl}`)
          console.log(`     - API Key: ${p.apiKey ? '已配置 ✅' : '未配置 ❌'}`)
          console.log(`     - 启用状态: ${p.isEnabled ? '已启用 ✅' : '已禁用 ❌'}`)
          console.log(`     - 模型数量: ${p.models?.length || 0}`)

          if (p.models && p.models.length > 0) {
            console.log(`     - 模型列表:`)
            p.models.forEach(m => {
              console.log(`       * ${m.name || m.id} (${m.type || 'all'}) - ${m.isEnabled ? '启用' : '禁用'}`)
            })
          }

          if (!p.apiKey) {
            results.failed.push(`❌ ${p.name} 没有API密钥`)
          }
          if (!p.isEnabled) {
            results.warnings.push(`⚠️ ${p.name} 未启用`)
          }
          if (!p.models || p.models.length === 0) {
            results.warnings.push(`⚠️ ${p.name} 没有配置模型`)
          }
        })
      }
    }

    // ==================== 测试 2：初始化AI Store ====================
    console.log('\n🔧 测试 2：初始化 AI Store')
    console.log('----------------------------------------')

    const aiStore = await import('/src/stores/ai.ts').then(m => m.useAIStore())

    // 先初始化
    aiStore.initialize()

    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 100))

    console.log('初始化状态:', {
      isInitialized: aiStore.isInitialized,
      hasService: !!aiStore.aiService,
      configuredModel: aiStore.configuredModel,
      error: aiStore.error
    })

    if (aiStore.error) {
      results.failed.push(`❌ AI Store初始化错误: ${aiStore.error}`)
      console.error('❌ AI Store初始化错误:', aiStore.error)
    } else if (!aiStore.isInitialized) {
      results.failed.push('❌ AI Store未初始化')
      console.error('❌ AI Store未初始化！')
    } else {
      results.passed.push('✅ AI Store初始化成功')
      console.log('✅ AI Store初始化成功')
    }

    // ==================== 测试 3：测试API连接 ====================
    console.log('\n🌐 测试 3：测试 API 连接')
    console.log('----------------------------------------')

    if (config?.providers && config.providers.length > 0) {
      const provider = config.providers.find(p => p.isEnabled && p.apiKey)

      if (provider) {
        console.log(`测试提供商: ${provider.name}`)
        console.log(`Base URL: ${provider.baseUrl}`)

        try {
          const testUrl = provider.baseUrl.endsWith('/v1')
            ? provider.baseUrl + '/chat/completions'
            : provider.baseUrl + (provider.baseUrl.endsWith('/') ? 'v1/chat/completions' : '/v1/chat/completions')

          console.log('测试URL:', testUrl)

          const model = provider.models?.find(m => m.isEnabled) || provider.models?.[0]

          if (!model) {
            results.failed.push('❌ 没有配置模型')
            console.error('❌ 没有配置模型！')
          } else {
            console.log('测试模型:', model.id)

            const startTime = Date.now()
            const response = await fetch(testUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${provider.apiKey}`,
              },
              body: JSON.stringify({
                model: model.id,
                messages: [{ role: 'user', content: '测试连接，请回复"连接成功"' }],
                max_tokens: 10,
              }),
            })
            const elapsed = Date.now() - startTime

            if (response.ok) {
              const data = await response.json()
              results.passed.push('✅ API连接成功')
              console.log('✅ API连接成功！')
              console.log('响应时间:', elapsed, 'ms')
              console.log('响应数据:', data)

              if (data.choices && data.choices[0]) {
                console.log('AI回复:', data.choices[0].message?.content)
              }
            } else {
              const errorData = await response.json().catch(() => ({}))
              results.failed.push(`❌ API连接失败: ${response.status} ${response.statusText}`)
              console.error('❌ API连接失败!')
              console.error('状态码:', response.status)
              console.error('错误信息:', errorData)
            }
          }
        } catch (error) {
          results.failed.push(`❌ API请求失败: ${error.message}`)
          console.error('❌ API请求失败:', error)
        }
      } else {
        results.failed.push('❌ 没有找到启用的提供商')
        console.error('❌ 没有找到启用的提供商')
      }
    }

    // ==================== 测试 4：测试AI Store调用 ====================
    console.log('\n💬 测试 4：测试 AI Store 调用')
    console.log('----------------------------------------')

    if (aiStore.checkInitialized()) {
      try {
        console.log('调用 AI Store chat 方法...')
        const startTime = Date.now()

        const response = await aiStore.chat(
          [{ role: 'user', content: '你好，请回复"测试成功"' }],
          { type: 'worldbuilding', complexity: 'low', priority: 'speed' },
          { maxTokens: 20 }
        )

        const elapsed = Date.now() - startTime
        console.log('✅ AI调用成功!')
        console.log('响应时间:', elapsed, 'ms')
        console.log('响应内容:', response.content)
        console.log('使用Token:', response.usage)
        results.passed.push('✅ AI Store调用成功')
      } catch (error) {
        results.failed.push(`❌ AI Store调用失败: ${error.message}`)
        console.error('❌ AI Store调用失败!')
        console.error('错误:', error)
        console.error('错误堆栈:', error.stack)
      }
    } else {
      results.failed.push('❌ AI Store未初始化，无法测试调用')
      console.error('❌ AI Store未初始化，无法测试调用')
    }

    // ==================== 测试结果汇总 ====================
    console.log('\n' + '='.repeat(50))
    console.log('📊 测试结果汇总')
    console.log('='.repeat(50))

    console.log('\n✅ 通过的测试 (' + results.passed.length + '):')
    results.passed.forEach(r => console.log('  ' + r))

    if (results.warnings.length > 0) {
      console.log('\n⚠️ 警告 (' + results.warnings.length + '):')
      results.warnings.forEach(r => console.log('  ' + r))
    }

    if (results.failed.length > 0) {
      console.log('\n❌ 失败的测试 (' + results.failed.length + '):')
      results.failed.forEach(r => console.log('  ' + r))
    }

    console.log('\n' + '='.repeat(50))

    if (results.failed.length === 0) {
      console.log('🎉 所有测试通过！AI服务应该可以正常工作')
    } else {
      console.log('❌ 有测试失败，请检查上述错误信息')
      console.log('\n💡 常见问题排查:')
      console.log('  1. 检查是否配置了API密钥')
      console.log('  2. 检查提供商是否已启用')
      console.log('  3. 检查模型是否已配置且启用')
      console.log('  4. 检查Base URL是否正确（注意不要有多余的路径）')
      console.log('  5. 刷新页面后重试')
    }

    return results

  } catch (error) {
    console.error('❌ 测试脚本执行失败:', error)
    console.error('错误堆栈:', error.stack)
    results.failed.push(`❌ 测试脚本执行失败: ${error.message}`)
    return results
  }
})()
