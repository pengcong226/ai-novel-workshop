import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'ai_novel_workshop.db');
const db = new Database(dbPath);

const projectsRows = db.prepare('SELECT * FROM projects').all();
const chaptersRows = db.prepare('SELECT * FROM chapters').all();

const projects = projectsRows.map(row => {
  const p = JSON.parse(row.data);
  // 确保 ID 一致
  p.id = row.id;
  
  // 关联章节
  p.chapters = chaptersRows
    .filter(cRow => cRow.project_id === row.id)
    .map(cRow => {
       const c = JSON.parse(cRow.data);
       c.id = cRow.id;
       // 极其关键：必须注入 projectId 字段，IndexedDB 索引才有用！
       c.projectId = row.id; 
       return c;
    });
  
  return p;
});

// 计算总字数并同步到元数据
const metaList = projects.map(p => ({
  id: p.id,
  title: p.title,
  genre: p.genre,
  targetWords: p.targetWords || 100000,
  currentWords: p.chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0),
  status: p.status || 'draft',
  createdAt: p.createdAt,
  updatedAt: new Date().toISOString()
}));

fs.writeFileSync(path.resolve(process.cwd(), 'public/sync-payload.json'), JSON.stringify(projects, null, 2));
console.log(`✅ 成功导出 ${projects.length} 个项目，总计章节同步完毕。`);
