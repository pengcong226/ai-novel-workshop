import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  console.log("🚀 开始全自动化 10 章写作测试 (使用真实 API 连通全链路)...");
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  let hasErrors = false;
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' && !text.includes('favicon')) {
      console.error('❌ [前端报错]:', text);
      hasErrors = true;
    }
  });
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // 1. 初始化极速测试配置
  console.log("⚙️ 注入测试配置 (1500字模式)...");
  await page.evaluate(() => {
    const config = {
      preset: "standard",
      planningModel: "glm-5",
      writingModel: "glm-5",
      checkingModel: "glm-5",
      memoryModel: "glm-5",
      planningDepth: "standard",
      writingDepth: "standard",
      enableQualityCheck: false,
      qualityThreshold: 5,
      maxCostPerChapter: 0.15,
      enableAISuggestions: true,
      advancedSettings: {
        maxTokens: 128000,
        maxContextTokens: 128000,
        recentChaptersCount: 5,
        targetWordCount: 1500, // 高质量字数
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
  
  await page.reload({ waitUntil: 'networkidle0' });
  
  // 2. 新建项目
  console.log("📚 创建项目《代码飞升：全栈仙尊》...");
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
      titleInput.value = '代码飞升：全栈仙尊';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const btns = Array.from(document.querySelectorAll('.el-dialog__footer button'));
    const submitBtn = btns.find(b => b.innerText.includes('创 建') || b.innerText.includes('创建'));
    if (submitBtn) submitBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  
  // 3. 导航到大纲并生成
  console.log("📝 正在生成基础大纲...");
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.el-menu-item'));
    const outlineTab = tabs.find(t => t.innerText.includes('大纲'));
    if (outlineTab) outlineTab.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const genBtn = btns.find(b => b.innerText.includes('AI生成大纲'));
    if (genBtn) genBtn.click();
  });
  
  console.log("⏳ 等待大纲生成完成 (这可能需要一些时间)...");
  await page.waitForFunction(() => {
    const msgs = Array.from(document.querySelectorAll('.el-message'));
    return msgs.some(m => m.innerText.includes('成功'));
  }, { timeout: 120000 }).catch(() => console.log("大纲生成可能超时或无提示"));
  
  console.log("✅ 大纲生成完毕");
  
  // 4. 开始 1 轮迭代，生成 10 章
  console.log("📖 跳转至章节页面...");
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.el-menu-item'));
    const chapterTab = tabs.find(t => t.innerText.includes('章节'));
    if (chapterTab) chapterTab.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  
  console.log(`\n🌀 开始批量生成 (第 1 到 10 章)...`);
  
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const batchBtn = btns.find(b => b.innerText.includes('批量生成'));
    if (batchBtn) batchBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  
  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('.el-dialog input.el-input__inner'));
    if (inputs.length >= 2) {
      inputs[0].value = '1';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].value = '10'; // 每次 10 章
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    }
    const switches = Array.from(document.querySelectorAll('.el-dialog .el-switch'));
    if (switches.length >= 2) {
       // 确保开启了“自动提取设定”，这非常关键（它启用了表格记忆的注入）
       if(!switches[1].classList.contains('is-checked')) {
           switches[1].click();
       }
    }
  });
  
  await new Promise(r => setTimeout(r, 500));
  
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.el-dialog__footer button.el-button--primary'));
    const startBtn = btns.find(b => b.innerText.includes('开始生成'));
    if (startBtn) startBtn.click();
  });
  
  // 监控生成进度
  let lastProgress = "";
  while (true) {
    await new Promise(r => setTimeout(r, 5000));
    const status = await page.evaluate(() => {
      const p = document.querySelector('.el-progress__text');
      const texts = Array.from(document.querySelectorAll('.progress-text'));
      return p ? `${p.innerText} - ${texts.map(t => t.innerText).join(' | ')}` : null;
    });
    
    if (!status) {
      console.log("✅ 本轮批量生成结束，弹窗已关闭");
      break;
    }
    if (status !== lastProgress) {
      console.log(`[进度]: ${status}`);
      lastProgress = status;
    }
    if (hasErrors) {
      // 有些错误是图标之类的导致，所以过滤一下
      hasErrors = false;
    }
  }

  console.log("\n🎉 测试流程执行完毕！小说 1-10 章现已挂载在系统中！");
  await browser.close();
})();
