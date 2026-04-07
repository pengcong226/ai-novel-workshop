import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('💻 [PAGE LOG]:', msg.text()));
  page.on('pageerror', error => console.error('❌ [PAGE ERROR]:', error.message));
  
  console.log("🌍 Navigating to http://localhost:3000 ...");
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // 注入 API 配置
  console.log("⚙️ Setting up AI Configuration...");
  await page.evaluate(() => {
    const config = {
      preset: "standard",
      planningModel: "glm-5",
      writingModel: "glm-5",
      checkingModel: "glm-5",
      memoryModel: "glm-5",
      planningDepth: "medium",
      writingDepth: "standard",
      enableQualityCheck: false,
      qualityThreshold: 7,
      maxCostPerChapter: 0.15,
      enableAISuggestions: false,
      advancedSettings: {
        maxTokens: 128000,
        temperature: 0.7,
        topP: 0.9,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stopSequences: []
      },
      providers: [
        {
          id: "test-provider",
          name: "YuanJing",
          type: "custom",
          baseUrl: process.env.E2E_API_BASE_URL || "https://maas-api.ai-yuanjing.com/openapi/compatible-mode/v1",
          apiKey: process.env.E2E_API_KEY || "",
          isEnabled: true,
          models: [{ id: "glm-5", name: "glm-5", isEnabled: true }]
        }
      ]
    };
    localStorage.setItem('global-config', JSON.stringify(config));
  });
  
  // 刷新使配置生效
  await page.reload({ waitUntil: 'networkidle0' });
  
  // 创建项目
  console.log("📚 Creating project...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.innerText.includes('新建作品') || b.innerText.includes('创建第一部作品'));
    if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const titleInput = inputs.find(i => i.placeholder && i.placeholder.includes('作品名称'));
    if (titleInput) {
      titleInput.value = 'AI自动化测试修仙传';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.el-dialog__footer button'));
    const submitBtn = btns.find(b => b.innerText.includes('创 建') || b.innerText.includes('创建'));
    if (submitBtn) submitBtn.click();
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  // 导航到大纲
  console.log("📝 Generating Outline...");
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.el-menu-item'));
    const outlineTab = tabs.find(t => t.innerText.includes('大纲'));
    if (outlineTab) outlineTab.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  await page.evaluate(() => {
    // 打印当前 config 调试
    const projectStore = window.__VUE_APP_CONTEXT__ ? null : null; // Vue3 cannot be easily accessed, we'll use localStorage
    const p = JSON.parse(localStorage.getItem('ai_novel_projects') || '[]');
    console.log('Project config providers:', JSON.stringify(p[p.length-1]?.config?.providers));
  });
  
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const genBtn = btns.find(b => b.innerText.includes('AI生成大纲'));
    if (genBtn) genBtn.click();
  });
  
  console.log("⏳ Waiting for Outline generation (Timeout 60s)...");
  await page.waitForFunction(() => {
    const msgs = Array.from(document.querySelectorAll('.el-message'));
    return msgs.some(m => m.innerText.includes('成功'));
  }, { timeout: 60000 }).catch(e => console.log("Timeout waiting for outline message"));
  
  // 导航到章节生成
  console.log("📖 Navigating to Chapters...");
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.el-menu-item'));
    const chapterTab = tabs.find(t => t.innerText.includes('章节'));
    if (chapterTab) chapterTab.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log("🚀 Triggering Batch Generation...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const batchBtn = btns.find(b => b.innerText.includes('批量生成'));
    if (batchBtn) batchBtn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // 配置批量生成参数
  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('.el-dialog input.el-input__inner'));
    if (inputs.length >= 2) {
      inputs[1].value = '3'; // 只生成3章测试
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  
  await page.evaluate(() => {
    const switches = Array.from(document.querySelectorAll('.el-dialog .el-switch'));
    if (switches.length >= 2) {
       switches[1].click(); // 开启“生成后自动提取更新设定”
    }
  });
  
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.el-dialog__footer button.el-button--primary'));
    const startBtn = btns.find(b => b.innerText.includes('开始生成'));
    if (startBtn) startBtn.click();
  });
  
  console.log("⏳ Batch generation started! Monitoring progress...");
  
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const progress = await page.evaluate(() => {
      const p = document.querySelector('.el-progress__text');
      const texts = Array.from(document.querySelectorAll('.progress-text'));
      return p ? `${p.innerText} - ${texts.map(t => t.innerText).join(' | ')}` : null;
    });
    
    if (!progress) {
      console.log("Dialog closed. Generation complete or errored.");
      break;
    }
    console.log(`[Progress]: ${progress}`);
  }
  
  console.log("✅ E2E Test Completed!");
  await browser.close();
})();
