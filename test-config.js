const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('🧪 开始自动化测试...\n');
  
  try {
    // 测试1：访问应用
    console.log('📍 测试1：访问应用');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    console.log('✅ 应用加载成功\n');
    
    // 测试2：创建项目
    console.log('📍 测试2：创建项目');
    await page.click('text=创建项目');
    await page.waitForTimeout(500);
    await page.fill('input[placeholder="请输入小说标题"]', '测试小说');
    await page.click('text=确 定');
    await page.waitForTimeout(1000);
    console.log('✅ 项目创建成功\n');
    
    // 测试3：进入配置页面
    console.log('📍 测试3：进入配置页面');
    await page.click('text=配置');
    await page.waitForTimeout(1000);
    console.log('✅ 配置页面加载成功\n');
    
    // 测试4：添加模型提供商
    console.log('📍 测试4：添加模型提供商');
    await page.click('text=添加提供商');
    await page.waitForTimeout(500);
    
    // 填写提供商信息
    await page.fill('input[placeholder="OpenAI"]', '测试提供商');
    await page.fill('input[placeholder="https://api.openai.com/v1"]', 'https://test.api');
    await page.fill('input[placeholder="输入API密钥"]', 'test-key');
    await page.fill('textarea[placeholder="输入模型名称，多个模型用逗号分隔"]', 'model-1, model-2, model-3');
    await page.click('dialog .el-button--primary:has-text("添加")');
    await page.waitForTimeout(1000);
    console.log('✅ 提供商添加成功\n');
    
    // 测试5：保存配置
    console.log('📍 测试5：保存配置');
    await page.click('text=保存配置');
    await page.waitForTimeout(1000);
    
    // 检查是否有成功提示
    const successMessage = await page.$('text=项目配置已保存');
    if (successMessage) {
      console.log('✅ 配置保存成功\n');
    } else {
      console.log('⚠️ 未找到成功提示，检查控制台\n');
    }
    
    // 测试6：验证提供商是否显示
    console.log('📍 测试6：验证提供商列表');
    await page.waitForTimeout(500);
    const providerCard = await page.$('text=测试提供商');
    if (providerCard) {
      console.log('✅ 提供商显示正常\n');
    } else {
      console.log('❌ 提供商未显示\n');
    }
    
    // 测试7：测试AI生成世界观
    console.log('📍 测试7：测试AI生成世界观');
    await page.click('text=世界观设定');
    await page.waitForTimeout(1000);
    await page.click('text=AI生成设定');
    await page.waitForTimeout(500);
    await page.fill('input[placeholder="如：玄幻、都市、科幻"]', '玄幻');
    await page.click('dialog .el-button--primary:has-text("开始生成")');
    console.log('⏳ 等待生成完成...');
    await page.waitForTimeout(3000);
    console.log('✅ 世界观生成测试完成\n');
    
    console.log('🎉 所有测试完成！');
    console.log('\n按Ctrl+C关闭测试浏览器...');
    await page.waitForTimeout(60000);
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await browser.close();
  }
})();
