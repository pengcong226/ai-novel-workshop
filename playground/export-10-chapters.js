import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'ai_novel_workshop.db');
const db = new Database(dbPath);

const pRow = db.prepare("SELECT * FROM projects WHERE id = 'fix-agent-v1'").get();
if (!pRow) {
  console.error("未找到项目数据！");
  process.exit(1);
}

const project = JSON.parse(pRow.data);
const chaptersRows = db.prepare("SELECT * FROM chapters WHERE project_id = 'fix-agent-v1'").all();

let markdownContent = `# ${project.title}\n\n`;
markdownContent += `> ${project.description}\n\n`;

const chapters = chaptersRows.map(r => JSON.parse(r.data)).sort((a, b) => a.number - b.number);

chapters.forEach(ch => {
  markdownContent += `## ${ch.title}\n\n`;
  markdownContent += `${ch.content}\n\n`;
});

// Windows 桌面的通用路径
const desktopPath = path.join(process.env.USERPROFILE || 'C:\\Users\\PC', 'Desktop', `${project.title}.md`);
fs.writeFileSync(desktopPath, markdownContent);

console.log(`✅ 成功导出！包含 ${chapters.length} 章。`);
console.log(`📂 文件已保存到你的桌面: ${desktopPath}`);
