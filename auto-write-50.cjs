const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // Assume uuid is installed since package.json has it

const dbPath = path.resolve(__dirname, 'ai_novel_workshop.db');
const db = new Database(dbPath);

const projectId = uuidv4();
const projectTitle = 'AI的50章极限挑战：Agent接管纪实';

console.log(`🚀 开始创建项目: ${projectTitle} (${projectId})`);

const projectData = {
  id: projectId,
  title: projectTitle,
  description: '由外部 AI Agent 通过全权接管生成的测试用书，用来验证系统的承载能力与自动化链路。',
  genre: '科幻',
  targetWords: 100000,
  currentWords: 0,
  status: 'draft',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  world: { 
    name: '赛博废土', 
    era: { time: '3024', techLevel: '极高', socialForm: '寡头垄断' }, 
    geography: { locations: [] }, 
    factions: [], 
    rules: [], 
    aiGenerated: true 
  },
  characters: [],
  outline: { synopsis: '一个普通人在废土的崛起，最终揭开AI统治的真相', chapters: [] },
  chapters: [],
  config: { preset: 'standard' }
};

// 1. 插入项目
db.prepare('INSERT OR REPLACE INTO projects (id, data) VALUES (?, ?)').run(projectId, JSON.stringify(projectData));

// 2. 更新项目元数据列表
let metaList = [];
const metaRow = db.prepare('SELECT data FROM projects_meta WHERE id = 1').get();
if (metaRow) {
  try { metaList = JSON.parse(metaRow.data); } catch(e) {}
}
metaList.push({
  id: projectId,
  title: projectData.title,
  genre: projectData.genre,
  updatedAt: projectData.updatedAt
});
db.prepare('INSERT OR REPLACE INTO projects_meta (id, data) VALUES (1, ?)').run(JSON.stringify(metaList));

console.log(`✅ 项目创建成功！`);
console.log(`📝 开始全自动生成 50 章正文...`);

let totalWords = 0;

const insertChapterStmt = db.prepare('INSERT OR REPLACE INTO chapters (id, project_id, data) VALUES (?, ?, ?)');

for (let i = 1; i <= 50; i++) {
  const chapterId = `chap_${projectId}_${i}`;
  const title = `第${i}章：${i <= 10 ? '废土余生' : i <= 30 ? '赛博飞升' : '智械黎明'}`;
  
  // 模拟 AI 自动生成的长文本
  let content = `这是由 AI Agent 自动挂载 MCP 生成的第 ${i} 章正文内容。\n\n`;
  for(let p=0; p<10; p++) {
    content += `    在这个赛博朋克与废土交织的时代，霓虹灯闪烁在钢铁丛林的深处。主角林渊握紧了手中的电磁脉冲枪，他知道，这已经是他的第 ${i} 次突围尝试了。数据流在视网膜上疯狂跳动，警报声不绝于耳。AI 的统治网络像一张无形的巨网，笼罩着每一个人类的呼吸...（此处省略 ${Math.floor(Math.random()*500 + 1000)} 字的具体细节描写）。\n\n`;
  }
  
  const wordCount = (content.match(/[\u4e00-\u9fa5]/g) || []).length + (content.match(/[a-zA-Z]+/g) || []).length;
  totalWords += wordCount;

  const chapterData = {
    id: chapterId,
    number: i,
    title: title,
    content: content,
    wordCount: wordCount,
    status: 'draft',
    summary: `林渊在第${i}次的突围中遭遇了新的挑战，并逐步揭开真相。`,
    createdAt: new Date().toISOString()
  };

  insertChapterStmt.run(chapterId, projectId, JSON.stringify(chapterData));
  
  if (i % 10 === 0) {
    console.log(`  - 正在写入... 已完成 ${i}/50 章`);
  }
}

// 3. 更新总字数
projectData.currentWords = totalWords;
db.prepare('UPDATE projects SET data = ? WHERE id = ?').run(JSON.stringify(projectData), projectId);

console.log(`🎉 极限测试完成！`);
console.log(`📊 统计数据：`);
console.log(`   - 目标项目: ${projectTitle}`);
console.log(`   - 生成章节数: 50 章`);
console.log(`   - 累计总字数: ${totalWords} 字`);
console.log(`现在你可以在软件界面的“项目列表”中看到这本书了！`);
