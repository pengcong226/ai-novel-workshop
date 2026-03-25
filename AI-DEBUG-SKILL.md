# AI Novel Workshop 专属调试与自动化操控技能 (AI Debug Skill)

## 技能背景 (Context)
在开发或维护「AI小说工坊」这个基于 Tauri + Vue + SQLite 架构的桌面端系统时，如果你作为 AI 助手需要深度操控该软件（修改大纲、配置 API、直接生成并插入新章节），由于无法直接点击 Vue 前端 DOM，你可以通过本微服务接口 (`debug-server.js`) 直接操控最底层的真实 SQLite 数据库，实现全方位的读写控制。

## 环境要求
请向用户确认他已经执行过以下命令（或者你帮他执行）：
```bash
npm install express better-sqlite3 --save-dev
```

## 启动调试服务
在进行深度排查和数据操控前，打开一个后台终端并运行：
```bash
node debug-server.js
```
*服务将在 `http://localhost:3030` 运行。*

---

## 接口说明与使用示例 (作为 AI 你可以使用 curl 操作)

### 1. 全局配置查询与覆写 (配置 AI 密钥、调整 maxTokens)
**查询全局配置：**
```bash
curl http://localhost:3030/api/projects
```
**修改全局配置：** (由于全局配置存在 projects_meta 中，你需要提取上一步的数据修改后整体 PUT 回去)
```bash
curl -X PUT http://localhost:3030/api/meta \
-H "Content-Type: application/json" \
-d '[{"id":"...","config":{...}}]' 
```

### 2. 获取并修改项目核心设定（大纲、人物、世界观）
**获取指定项目：**
```bash
curl http://localhost:3030/api/projects/<项目ID>
```
**更新指定项目（例如你用 AI 帮他重新写了某个人物设定，想直接写进软件）：**
```bash
curl -X PUT http://localhost:3030/api/projects/<项目ID> \
-H "Content-Type: application/json" \
-d '{"id":"...","title":"...","characters":[...],"outline":{...}}'
```

### 3. 查看和编写新章节
**获取章节列表：**
```bash
curl http://localhost:3030/api/chapters/<项目ID>
```

**获取单独章节详情：**
```bash
curl http://localhost:3030/api/chapters/<项目ID>/<章节ID>
```

**写入/覆写新章节：** (如果你通过本地代码生成了一章，想直接写入库中)
```bash
curl -X PUT http://localhost:3030/api/chapters/<项目ID>/<章节ID> \
-H "Content-Type: application/json" \
-d '{"id":"...","number":24,"title":"第二十四章 ...","content":"正文内容...","wordCount":3000,"status":"completed"}'
```

### 4. 万能探针：执行原生 SQL (支持增删改查)
当你需要执行一些批量清理或者特殊查询时：

**示例 1：查找因乱码导致 JSON 损坏的章节：**
```bash
curl -X POST http://localhost:3030/api/sql \
-H "Content-Type: application/json" \
-d '{"query": "SELECT id, substr(data, 1, 100) as preview FROM chapters LIMIT 5"}'
```

**示例 2：一键清空所有章节（慎用）：**
```bash
curl -X POST http://localhost:3030/api/sql \
-H "Content-Type: application/json" \
-d '{"query": "DELETE FROM chapters"}'
```

## AI 自动化操控工作流建议：
1. 若用户让你“帮我把这个 API Key 配置进去”，你可以直接调取 API 1 拿到当前的 globalConfig，解析修改后 PUT 回去，用户只需刷新页面即可看到新配置。
2. 若用户让你“帮我直接生成几章内容写进数据库”，你可以调 API 2 拿到大纲和设定，利用你自己内置的大模型生成正文，然后组装好 Chapter JSON，调用 API 3 直接 PUT 进系统的 SQLite 中！
3. 完成后通知用户刷新浏览器或重新点开项目，数据瞬间生效。