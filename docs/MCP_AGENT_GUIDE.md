# AI小说工坊 - MCP 外部 Agent 接入指南

本指南旨在说明如何让外部的大模型工具（如 Roo Code、Claude Desktop、OpenCode 等）通过 **Model Context Protocol (MCP)** 接入“AI小说工坊”系统，实现对小说数据库的直接语义化控制与自动化生成。

## 1. 启动与配置 MCP Server

项目内已内置基于标准 `@modelcontextprotocol/sdk` 的通信端点 `mcp-server.js`。由于它使用的是 `stdio`（标准输入/输出）通信，非常适合本地 Agent 直接挂载。

### 在 Claude Desktop 中挂载
如果你使用 Claude Desktop，可以在它的 `claude_desktop_config.json` 文件中添加如下配置（请将路径替换为本项目的实际绝对路径）：

```json
{
  "mcpServers": {
    "ai-novel-workshop": {
      "command": "node",
      "args": [
        "C:/Users/PC/ai-novel-workshop/mcp-server.js"
      ]
    }
  }
}
```

### 在 Roo Code / Cline 中挂载
在 Roo Code 的 MCP 设置面板中添加一个基于 command 的 server：
*   **Command**: `node`
*   **Args**: `["mcp-server.js"]` （如果你的工作区就在该项目下）

## 2. 可用的工具列表 (Tools)

当你的 Agent 连接成功后，它将自动获得以下强大的语义化工具，能够直接读写 SQLite 底层数据库，且完全不需要关心复杂的 JSON 反序列化逻辑：

### 上下文检索工具（用于理解当前小说状态）
1.  **`list_projects`**
    *   **用途**：获取所有小说的 ID 和基本统计信息。
2.  **`get_project_context`**
    *   **用途**：获取小说的核心骨架（世界观设定、人物列表、总大纲）。在写任何新章节前**必须调用**。
3.  **`get_chapter_list`**
    *   **用途**：查看该小说已经写了哪些章节。
4.  **`get_chapter_content`**
    *   **用途**：读取前一章或指定章节的具体正文，以保持连贯性。

### 内容创作与记忆工具（用于推进故事）
5.  **`save_chapter`**
    *   **用途**：将你（AI Agent）刚刚写好的章节正文持久化保存到数据库，系统会自动更新项目的总字数。
6.  **`update_outline`**
    *   **用途**：如果你发现前置大纲已经用完，可以调用此工具追加后续 10-20 章的细化大纲。
7.  **`create_character`**
    *   **用途**：如果在写正文时你创造了一个重要的新配角，请立即调用此工具将其加入人物库，防止后续章节遗忘。
8.  **`read_memory_tables`** / **`update_memory_table`**
    *   **用途**：操作本系统独有的“表格记忆系统”（如角色的当前位置、受伤状态、携带物品等）。

---

## 3. 推荐的 System Prompt (给 Agent 的工作流指令)

你可以将以下 Prompt 喂给 Roo Code 或 Claude，让它成为一个全自动的“无情码字机”：

> 你现在是“AI小说工坊”的首席驻场作家，你已通过 MCP 获得了系统的全权控制 API。请遵循以下工作流为小说《你的小说名》继续创作：
> 
> **Step 1: 认清现状**
> 调用 `list_projects` 找到目标小说的 ID。
> 调用 `get_project_context` 获取它的世界观、人物和当前大纲。
> 
> **Step 2: 衔接前文**
> 调用 `get_chapter_list` 找出最新的一章。
> 调用 `get_chapter_content` 读取最新章的正文。
> 
> **Step 3: 创作正文**
> 根据大纲中下一章的剧情要求，结合你读取到的世界观和人物性格，直接创作下一章的正文（要求字数 2000 字左右）。
> 
> **Step 4: 数据沉淀 (极其重要)**
> 1. 调用 `save_chapter` 将正文保存。
> 2. 如果在这一章中出现了新的重要人物，调用 `create_character`。
> 3. 如果某个角色的状态（受伤、获得神器、换地图）发生了改变，调用 `update_memory_table` 更新表格记忆。
> 
> 请自主循环执行以上步骤，直到我喊停为止。

通过这种方式，原本需要人类在 UI 上反复点击“读取前文 -> 生成 -> 抽取人物 -> 更新表格”的繁琐流程，将完全由外置 Agent 自主规划并瞬间完成。
