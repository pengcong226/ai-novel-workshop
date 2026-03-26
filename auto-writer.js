import puppeteer from 'puppeteer';
import fs from 'fs';
import { getE2EProviderConfig } from './scripts/e2eProviderConfig.js';

(async () => {
  console.log("🚀 开始全自动化百章极限压力测试...");
  const provider = getE2EProviderConfig();
  let browser;

  try {
    browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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
  console.log("⚙️ 注入测试配置 (单章500字极速模式)...");
  await page.evaluate((providerConfig) => {
    const config = {
      preset: "fast",
      planningModel: "glm-5",
      writingModel: "glm-5",
      checkingModel: "glm-5",
      memoryModel: "glm-5",
      planningDepth: "shallow",
      writingDepth: "fast",
      enableQualityCheck: false,
      qualityThreshold: 5,
      maxCostPerChapter: 0.15,
      enableAISuggestions: false,
      advancedSettings: {
        maxTokens: 128000,
        maxContextTokens: 128000,
        recentChaptersCount: 5,
        targetWordCount: 500, // 降低字数以加快生成速度
        frequencyPenalty: 0,
        presencePenalty: 0,
        stopSequences: []
      },
      providers: [providerConfig]
    };
    localStorage.setItem('global-config', JSON.stringify(config));
  }, provider);
  
  await page.reload({ waitUntil: 'networkidle0' });
  
  // 2. 新建项目
  console.log("📚 创建项目...");
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
      titleInput.value = '百章压力测试修仙传';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const btns = Array.from(document.querySelectorAll('.el-dialog__footer button'));
    const submitBtn = btns.find(b => b.innerText.includes('创 建') || b.innerText.includes('创建'));
    if (submitBtn) submitBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  
  // 3. 导航到大纲并生成
  console.log("📝 正在生成百章基础大纲...");
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
  
  await page.waitForFunction(() => {
    const msgs = Array.from(document.querySelectorAll('.el-message'));
    return msgs.some(m => m.innerText.includes('成功'));
  }, { timeout: 60000 }).catch(() => console.log("大纲生成可能超时或无提示"));
  
  console.log("✅ 大纲生成完毕");
  
  // 4. 开始 10 轮迭代，每轮生成 10 章
  console.log("📖 跳转至章节页面...");
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.el-menu-item'));
    const chapterTab = tabs.find(t => t.innerText.includes('章节'));
    if (chapterTab) chapterTab.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  
  for (let round = 1; round <= 10; round++) { // 完整执行 10 轮，共 100 章
    console.log(`\n🌀 开始第 ${round} 轮测试 (生成第 ${(round-1)*10 + 1} 到 ${round*10} 章)...`);
    
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const batchBtn = btns.find(b => b.innerText.includes('批量生成'));
      if (batchBtn) batchBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    
    await page.evaluate((startChap) => {
      const inputs = Array.from(document.querySelectorAll('.el-dialog input.el-input__inner'));
      if (inputs.length >= 2) {
        inputs[0].value = startChap.toString();
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[1].value = '10'; // 每次 10 章
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      }
      const switches = Array.from(document.querySelectorAll('.el-dialog .el-switch'));
      if (switches.length >= 2) {
         // 确保开启了“自动提取设定”
         if(!switches[1].classList.contains('is-checked')) {
             switches[1].click();
         }
      }
    }, (round - 1) * 10 + 1);
    
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
        console.log("✅ 本轮批量生成结束弹窗已关闭");
        break;
      }
      if (status !== lastProgress) {
        console.log(`[进度]: ${status}`);
        lastProgress = status;
      }
      if (hasErrors) {
        console.log("🚨 检测到报错，尝试继续...");
        hasErrors = false;
      }
    }
  }

  console.log("\n💾 正在从浏览器沙盒中提取生成的作品数据...");
  const exportedJson = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const request = indexedDB.open('AI_Novel_Workshop', 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['projects'], 'readonly');
        const store = tx.objectStore('projects');
        const allReq = store.getAll();
        allReq.onsuccess = () => {
          const projs = allReq.result;
          resolve(JSON.stringify(projs[projs.length - 1], null, 2));
        };
      };
    });
  });

  fs.writeFileSync('100章极限测试作品.json', exportedJson);
  console.log("🎉 测试流程执行完毕！小说已导出到当前目录的 100章极限测试作品.json 中！");
  
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();