const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(express.json());

// 尝试连接 SQLite 数据库
let db;
try {
    const dbPath = path.resolve(__dirname, 'ai_novel_workshop.db');
    // 修改为可写模式
    db = new Database(dbPath);
    console.log(`✅ 成功连接到数据库: ${dbPath}`);
} catch (error) {
    console.error(`❌ 连接数据库失败 (这可能是因为还没有生成.db文件):`, error.message);
}

// 获取系统状态接口
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        data: {
            dbConnected: !!db,
            message: 'AI Novel Workshop Debug Server is running'
        }
    });
});

// 获取所有项目元数据
app.get('/api/projects', (req, res) => {
    if (!db) return res.status(500).json({ success: false, error: 'Database not connected' });
    try {
        const rows = db.prepare('SELECT * FROM projects_meta').all();
        // data 列存的是 JSON string
        const parsed = rows.map(r => {
            try { return JSON.parse(r.data); } catch { return r.data; }
        });
        res.json({ success: true, data: parsed });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 获取单个项目信息及其章节数量
app.get('/api/projects/:id', (req, res) => {
    if (!db) return res.status(500).json({ success: false, error: 'Database not connected' });
    try {
        const projectRow = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
        if (!projectRow) return res.status(404).json({ success: false, error: 'Project not found' });
        
        const chapters = db.prepare('SELECT id FROM chapters WHERE project_id = ?').all(req.params.id);
        
        let projectData = {};
        try { projectData = JSON.parse(projectRow.data); } catch {}

        res.json({
            success: true,
            data: {
                ...projectData,
                _debug_chaptersCount: chapters.length,
                _debug_chapterIds: chapters.map(c => c.id)
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 更新单个项目完整信息（包括设定、大纲、人物等）
app.put('/api/projects/:id', (req, res) => {
    if (!db) return res.status(500).json({ success: false, error: 'Database not connected' });
    try {
        const payload = req.body;
        if (!payload) return res.status(400).json({ success: false, error: 'Body is required' });
        
        const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const stmt = db.prepare('UPDATE projects SET data = ? WHERE id = ?');
        const info = stmt.run(jsonStr, req.params.id);
        
        if (info.changes === 0) {
            // 不存在则插入
            const insertStmt = db.prepare('INSERT INTO projects (id, data) VALUES (?, ?)');
            insertStmt.run(req.params.id, jsonStr);
        }
        res.json({ success: true, message: 'Project updated successfully' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 查看所有章节列表（精简版）
app.get('/api/chapters/:projectId', (req, res) => {
    if (!db) return res.status(500).json({ success: false, error: 'Database not connected' });
    try {
        const chapters = db.prepare('SELECT data FROM chapters WHERE project_id = ?').all(req.params.projectId);
        const parsed = chapters.map(c => {
            try {
                const data = JSON.parse(c.data);
                return { id: data.id, number: data.number, title: data.title, wordCount: data.wordCount, status: data.status };
            } catch { return null; }
        }).filter(Boolean);
        parsed.sort((a, b) => a.number - b.number);
        res.json({ success: true, data: parsed });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 查看指定章节内容
app.get('/api/chapters/:projectId/:chapterId', (req, res) => {
    if (!db) return res.status(500).json({ success: false, error: 'Database not connected' });
    try {
        const chapterRow = db.prepare('SELECT * FROM chapters WHERE project_id = ? AND id = ?').get(req.params.projectId, req.params.chapterId);
        if (!chapterRow) return res.status(404).json({ success: false, error: 'Chapter not found' });
        
        let chapterData = {};
        try { chapterData = JSON.parse(chapterRow.data); } catch { chapterData = chapterRow.data; }
        
        res.json({ success: true, data: chapterData });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 插入或更新章节
app.put('/api/chapters/:projectId/:chapterId', (req, res) => {
    if (!db) return res.status(500).json({ success: false, error: 'Database not connected' });
    try {
        const payload = req.body;
        if (!payload) return res.status(400).json({ success: false, error: 'Body is required' });
        
        const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const stmt = db.prepare('INSERT OR REPLACE INTO chapters (id, project_id, data) VALUES (?, ?, ?)');
        stmt.run(req.params.chapterId, req.params.projectId, jsonStr);
        
        res.json({ success: true, message: 'Chapter saved successfully' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 更新全局元数据 (配置)
app.put('/api/meta', (req, res) => {
    if (!db) return res.status(500).json({ success: false, error: 'Database not connected' });
    try {
        const payload = req.body;
        if (!payload) return res.status(400).json({ success: false, error: 'Body is required' });
        
        const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const stmt = db.prepare('INSERT OR REPLACE INTO projects_meta (id, data) VALUES (1, ?)');
        stmt.run(jsonStr);
        
        res.json({ success: true, message: 'Global metadata saved successfully' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 执行原生 SQL（高级调试入口）
app.post('/api/sql', (req, res) => {
    if (!db) return res.status(500).json({ success: false, error: 'Database not connected' });
    try {
        const query = req.body.query;
        if (!query) return res.status(400).json({ success: false, error: 'Query is required' });
        
        // 允许各种操作，不再局限于 SELECT
        let result;
        if (query.trim().toUpperCase().startsWith('SELECT')) {
            result = db.prepare(query).all();
            res.json({ success: true, count: result.length, data: result });
        } else {
            result = db.prepare(query).run();
            res.json({ success: true, changes: result.changes, lastInsertRowid: result.lastInsertRowid });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

const PORT = 3030;
app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🤖 AI 专属调试接口 (Debug API) 已启动`);
    console.log(`📡 监听端口: http://localhost:${PORT}`);
    console.log(`===============================================`);
});