const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'ai_novel_workshop.db');
const db = new Database(dbPath);

const projectId = '0fb2a7ed-d0d2-42b6-88d8-b260c83ca09c';

// 找到刚创建的有问题的项目
const row = db.prepare('SELECT data FROM projects WHERE id = ?').get(projectId);
if (row) {
  const p = JSON.parse(row.data);
  
  if (p.world) {
    if (Array.isArray(p.world.geography.locations) && typeof p.world.geography.locations[0] === 'string') {
      p.world.geography.locations = p.world.geography.locations.map(l => ({ name: l, description: '' }));
    }
    if (Array.isArray(p.world.factions) && typeof p.world.factions[0] === 'string') {
      p.world.factions = p.world.factions.map(f => ({ name: f, description: '', relationships: [] }));
    }
    if (Array.isArray(p.world.rules) && typeof p.world.rules[0] === 'string') {
      p.world.rules = p.world.rules.map(r => ({ name: r, description: '' }));
    }
  }

  db.prepare('UPDATE projects SET data = ? WHERE id = ?').run(JSON.stringify(p), projectId);
  console.log('✅ 成功修复项目的世界观数据结构！');
} else {
  console.log('未找到指定ID的项目。可能ID变了，将修复所有受损项目...');
  const rows = db.prepare('SELECT id, data FROM projects').all();
  let count = 0;
  for (const r of rows) {
    const p = JSON.parse(r.data);
    let changed = false;
    if (p.world) {
      if (Array.isArray(p.world.geography?.locations) && typeof p.world.geography.locations[0] === 'string') {
        p.world.geography.locations = p.world.geography.locations.map(l => ({ name: l, description: '' }));
        changed = true;
      }
      if (Array.isArray(p.world.factions) && typeof p.world.factions[0] === 'string') {
        p.world.factions = p.world.factions.map(f => ({ name: f, description: '', relationships: [] }));
        changed = true;
      }
      if (Array.isArray(p.world.rules) && typeof p.world.rules[0] === 'string') {
        p.world.rules = p.world.rules.map(r => ({ name: r, description: '' }));
        changed = true;
      }
    }
    if (changed) {
      db.prepare('UPDATE projects SET data = ? WHERE id = ?').run(JSON.stringify(p), r.id);
      count++;
    }
  }
  console.log(`✅ 共修复了 ${count} 个项目的世界观数据结构！`);
}
