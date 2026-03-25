# AI小说工坊 - MCP (Model Context Protocol) 改造计划

为了让外部 AI Agent（如 Roo Code、Claude Code 等）能够优雅、安全、全自动化地接管本小说生成系统，我们将引入标准的 **MCP (Model Context Protocol)** 架构。

通过实现一个专属的 MCP Server，外部 Agent 可以直接理解小说工坊的业务语义，无需自行猜测数据库结构，实现“理解设定 -> 规划大纲 -> 自动撰写 -> 更新记忆”的全自动闭环。

## 阶段一：MCP 基础基建 (Foundation)
*目标：建立标准协议的服务端，并安全挂载底层数据库。*
- [ ] **依赖安装**：引入 `@modelcontextprotocol/sdk` 及必要依赖。
- [ ] **服务骨架**：在项目根目录创建 `mcp-server.js`（基于 stdio 的通信方式，最适合本地 Agent 调用）。
- [ ] **数据层防腐**：使用 `better-sqlite3` 封装安全的数据库访问层，弃用极其危险的原生 `POST /api/sql` 逻辑，改为严格参数化的操作。

## 阶段二：上下文检索工具 (Context Gathering Tools)
*目标：让外部 Agent 长出“眼睛”，能够理解当前小说的进度和设定。*
- [ ] **`list_projects`**：获取所有小说项目列表（含 ID、名称、当前字数）。
- [ ] **`get_project_context`**：根据项目 ID 获取完整上下文，包括“世界观”、“大纲”、“所有人物设定”。
- [ ] **`get_chapter_list`**：获取指定小说的已写章节目录。
- [ ] **`get_chapter_content`**：读取某一章节的具体正文内容。

## 阶段三：创作与设定工具 (Creation & Mutation Tools)
*目标：让外部 Agent 长出“手”，能够直接修改大纲和正文。*
- [ ] **`create_character`**：允许 Agent 在生成章节发现新人物时，自动调用该工具向数据库注册新人物。
- [ ] **`update_outline`**：允许 Agent 自动续写或修改后续章节的大纲规划。
- [ ] **`save_chapter`**：允许 Agent 在本地完成章节生成后，直接将正文和字数统计持久化到数据库中。

## 阶段四：高级记忆工具 (Memory System Tools)
*目标：打通本项目最核心的“表格记忆系统”。*
- [ ] **`read_memory_tables`**：让 Agent 读取当前的表格记忆状态。
- [ ] **`update_memory_table`**：允许 Agent 在写完一章后，调用工具更新物品、人物状态等表格记录（如执行 `updateRow` 语义）。

## 阶段五：使用指南与发布
*目标：提供明确的接入配置。*
- [ ] 编写 `docs/MCP_AGENT_GUIDE.md`，提供 Claude Desktop 或 Roo Code 的 `claude_desktop_config.json` 挂载配置示例。
- [ ] 提供 Agent 自动化创作的提示词模板（System Prompt for Agent）。

---
**执行策略**：我们将切换到 Code 模式，采用 Node.js 编写该 MCP Server，因为它能与现有的 `debug-server.js` 共享同一套 SQLite 依赖，且对外部 TS/JS 生态最友好。
