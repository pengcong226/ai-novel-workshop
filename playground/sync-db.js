import Database from 'better-sqlite3';
import puppeteer from 'puppeteer';
import path from 'path';

async function sync() {
  console.log("正在准备数据同步 (SQLite -> Web前端)...");
  const dbPath = path.resolve(process.cwd(), 'ai_novel_workshop.db');
  const db = new Database(dbPath);

  const projectsRows = db.prepare('SELECT * FROM projects').all();
  const chaptersRows = db.prepare('SELECT * FROM chapters').all();
  
  // 提取 projects_meta
  let metaList = [];
  try {
    const metaRow = db.prepare('SELECT data FROM projects_meta WHERE id = 1').get();
    if (metaRow) metaList = JSON.parse(metaRow.data);
  } catch (e) {
    // 回退获取 projects 的 meta
    metaList = projectsRows.map(row => {
      const p = JSON.parse(row.data);
      return { id: p.id, title: p.title, genre: p.genre, updatedAt: p.updatedAt };
    });
  }

  const projects = projectsRows.map(row => JSON.parse(row.data));
  const chapters = chaptersRows.map(row => JSON.parse(row.data));

  console.log(`从后端拉取到 ${projects.length} 个项目，${chapters.length} 个章节`);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  await page.evaluate(async (projectsList, metaList, chaptersList) => {
    // 1. 同步 LocalStorage
    let existingMeta = [];
    try { existingMeta = JSON.parse(localStorage.getItem('ai_novel_projects') || '[]'); } catch(e){}
    
    // 合并
    metaList.forEach(m => {
      const idx = existingMeta.findIndex(x => x.id === m.id);
      if (idx >= 0) existingMeta[idx] = Object.assign(existingMeta[idx], m);
      else existingMeta.push(m);
    });
    localStorage.setItem('ai_novel_projects', JSON.stringify(existingMeta));

    // 2. 同步 IndexedDB
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('AI_Novel_Workshop', 2);
      request.onsuccess = () => {
        const idb = request.result;
        const tx = idb.transaction(['projects', 'chapters'], 'readwrite');
        const pStore = tx.objectStore('projects');
        const cStore = tx.objectStore('chapters');

        projectsList.forEach(pData => {
           let projectMeta = { ...pData };
           delete projectMeta.chapters; // 分离存储
           pStore.put(projectMeta);
        });

        chaptersList.forEach(cData => {
           cStore.put(cData);
        });

        tx.oncomplete = () => resolve("OK");
        tx.onerror = (e) => reject("Transaction error: " + (e.target.error ? e.target.error.message : "unknown"));
      };
      request.onerror = (e) => reject("DB Open error: " + (e.target.error ? e.target.error.message : "unknown"));
    });
  }, projects, metaList, chapters).catch(err => {
    console.error("在浏览器环境注入时抛出异常:", err);
  });

  console.log("✅ 同步完成！");
  await browser.close();
}

sync().catch(console.error);
