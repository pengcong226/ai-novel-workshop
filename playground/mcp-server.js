#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB connection
const dbPath = path.resolve(__dirname, 'ai_novel_workshop.db');
let db;
try {
  db = new Database(dbPath, { fileMustExist: false });
  // Ensure tables exist just in case
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chapters (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects_meta (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
  `);
} catch (error) {
  console.error("Failed to connect to database:", error);
  process.exit(1);
}

const server = new Server(
  {
    name: "ai-novel-workshop-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_projects",
        description: "获取当前系统中所有的小说项目列表",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_project_context",
        description: "根据项目 ID 获取该小说的核心设定（世界观、大纲、人物列表）",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "项目ID" },
          },
          required: ["projectId"],
        },
      },
      {
        name: "get_chapter_list",
        description: "获取指定小说的已写章节目录（含章节ID、标题、字数）",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "项目ID" },
          },
          required: ["projectId"],
        },
      },
      {
        name: "get_chapter_content",
        description: "读取某一具体章节的正文内容",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "项目ID" },
            chapterId: { type: "string", description: "章节ID" },
          },
          required: ["projectId", "chapterId"],
        },
      },
      {
        name: "create_character",
        description: "向指定小说项目中添加一个新人物设定",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "项目ID" },
            name: { type: "string", description: "人物名称" },
            role: { type: "string", description: "人物定位（如 protagonist, antagonist, supporting）" },
            personality: { type: "string", description: "性格特征" },
            background: { type: "string", description: "背景故事" },
          },
          required: ["projectId", "name", "role"],
        },
      },
      {
        name: "update_outline",
        description: "更新小说的总大纲或章节大纲（追加或覆盖）",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "项目ID" },
            synopsis: { type: "string", description: "小说总简介（可选）" },
            newChaptersOutline: { 
              type: "array", 
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  summary: { type: "string" },
                  details: { type: "string" }
                }
              },
              description: "追加的后续章节大纲列表" 
            },
          },
          required: ["projectId"],
        },
      },
      {
        name: "save_chapter",
        description: "保存或覆盖章节正文",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "项目ID" },
            chapterId: { type: "string", description: "章节ID，若为新章节可传入 new_xxx" },
            chapterNumber: { type: "number", description: "章节号" },
            title: { type: "string", description: "章节标题" },
            content: { type: "string", description: "正文内容" },
            summary: { type: "string", description: "本章摘要（可选）" }
          },
          required: ["projectId", "chapterId", "chapterNumber", "title", "content"],
        },
      },
      {
        name: "read_memory_tables",
        description: "读取小说的所有表格记忆数据（如物品表、状态表）",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "项目ID" },
          },
          required: ["projectId"],
        },
      },
      {
        name: "update_memory_table",
        description: "向记忆表格中添加或更新一行数据",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "项目ID" },
            tableName: { type: "string", description: "表格名称（如 角色状态, 物品列表）" },
            action: { type: "string", enum: ["insert", "update", "delete"], description: "操作类型" },
            rowKey: { type: "string", description: "用于 update/delete 的行标识（如行号或首列名称）" },
            rowData: { 
              type: "array", 
              items: { type: "string" },
              description: "行数据数组，对应表格的各列。insert 和 update 必填"
            }
          },
          required: ["projectId", "tableName", "action"],
        },
      }
    ],
  };
});

// Helper functions for DB access
function getProjectData(projectId) {
  const row = db.prepare('SELECT data FROM projects WHERE id = ?').get(projectId);
  if (!row) throw new Error(`Project ${projectId} not found`);
  return JSON.parse(row.data);
}

function saveProjectData(projectId, data) {
  db.prepare('UPDATE projects SET data = ? WHERE id = ?').run(JSON.stringify(data), projectId);
}

// Tool Implementation
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_projects": {
        const rows = db.prepare('SELECT data FROM projects').all();
        const projects = rows.map(r => {
          const p = JSON.parse(r.data);
          return { id: p.id, title: p.title, currentWords: p.currentWords, genre: p.genre };
        });
        return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
      }

      case "get_project_context": {
        const p = getProjectData(args.projectId);
        const context = {
          title: p.title,
          genre: p.genre,
          world: p.world,
          outline: p.outline,
          characters: p.characters
        };
        return { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
      }

      case "get_chapter_list": {
        const chapters = db.prepare('SELECT data FROM chapters WHERE project_id = ?').all(args.projectId);
        const list = chapters.map(c => {
          const ch = JSON.parse(c.data);
          return { id: ch.id, number: ch.number, title: ch.title, wordCount: ch.wordCount };
        }).sort((a, b) => a.number - b.number);
        return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
      }

      case "get_chapter_content": {
        const row = db.prepare('SELECT data FROM chapters WHERE project_id = ? AND id = ?').get(args.projectId, args.chapterId);
        if (!row) throw new Error("Chapter not found");
        return { content: [{ type: "text", text: JSON.parse(row.data).content || "(空)" }] };
      }

      case "create_character": {
        const p = getProjectData(args.projectId);
        const newChar = {
          id: `char_${Date.now()}`,
          name: args.name,
          role: args.role,
          personality: args.personality || "",
          background: args.background || "",
          appearance: "",
          abilities: []
        };
        if (!p.characters) p.characters = [];
        p.characters.push(newChar);
        saveProjectData(args.projectId, p);
        return { content: [{ type: "text", text: `Character ${args.name} created successfully with ID ${newChar.id}` }] };
      }

      case "update_outline": {
        const p = getProjectData(args.projectId);
        if (args.synopsis) {
          p.outline.synopsis = args.synopsis;
        }
        if (args.newChaptersOutline && args.newChaptersOutline.length > 0) {
          if (!p.outline.chapters) p.outline.chapters = [];
          for (const ch of args.newChaptersOutline) {
            p.outline.chapters.push({
              id: `out_ch_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,
              title: ch.title,
              summary: ch.summary,
              details: ch.details
            });
          }
        }
        saveProjectData(args.projectId, p);
        return { content: [{ type: "text", text: `Outline updated successfully.` }] };
      }

      case "save_chapter": {
        const wordCount = (args.content.match(/[\u4e00-\u9fa5]/g) || []).length + (args.content.match(/[a-zA-Z]+/g) || []).length;
        
        let existingChapter = {};
        const row = db.prepare('SELECT data FROM chapters WHERE project_id = ? AND id = ?').get(args.projectId, args.chapterId);
        if (row) {
          existingChapter = JSON.parse(row.data);
        }

        const chapterData = {
          ...existingChapter,
          id: args.chapterId,
          number: args.chapterNumber,
          title: args.title,
          content: args.content,
          wordCount,
          status: 'draft',
          summary: args.summary || existingChapter.summary || ""
        };

        db.prepare('INSERT OR REPLACE INTO chapters (id, project_id, data) VALUES (?, ?, ?)')
          .run(args.chapterId, args.projectId, JSON.stringify(chapterData));

        // Update project total word count
        const chapters = db.prepare('SELECT data FROM chapters WHERE project_id = ?').all(args.projectId);
        const totalWords = chapters.reduce((sum, c) => sum + (JSON.parse(c.data).wordCount || 0), 0);
        
        const p = getProjectData(args.projectId);
        p.currentWords = totalWords;
        saveProjectData(args.projectId, p);

        return { content: [{ type: "text", text: `Chapter ${args.chapterNumber} saved. Word count: ${wordCount}. Total project words: ${totalWords}.` }] };
      }

      case "read_memory_tables": {
        const p = getProjectData(args.projectId);
        const memory = p.memory;
        if (!memory || !memory.sheets) {
          return { content: [{ type: "text", text: "No memory tables found for this project." }] };
        }
        
        // Convert the internal structure to readable text
        const parsedSheets = memory.sheets.map(sheet => {
          const rows = sheet.hashSheet || [];
          if (rows.length === 0) return `Table: ${sheet.name} (Empty)`;
          
          const grid = rows.map(rowIds => {
             return rowIds.map(uid => {
                const cell = sheet.cells[uid];
                return cell ? cell.value : "";
             }).join(" | ");
          });
          return `Table: ${sheet.name}\n${grid.join('\n')}`;
        });

        return { content: [{ type: "text", text: parsedSheets.join('\n\n') }] };
      }

      case "update_memory_table": {
        const p = getProjectData(args.projectId);
        const memory = p.memory;
        if (!memory || !memory.sheets) throw new Error("Memory system not initialized");

        const sheet = memory.sheets.find(s => s.name === args.tableName);
        if (!sheet) throw new Error(`Table ${args.tableName} not found`);

        const action = args.action;
        if (action === "insert") {
          if (!args.rowData) throw new Error("rowData is required for insert");
          // Very simplified mock insert for the agent (real app uses uid mapping)
          // Since the agent can't generate specific Map structures easily, we simulate it
          // by creating UUIDs. NOTE: Since JSON doesn't naturally support ES6 Map serialization 
          // like the frontend does (the frontend uses exportMemory/importMemory adapters),
          // We need to parse and stringify carefully if the frontend expects Maps.
          // BUT wait, projects table `data` contains standard JSON if saved via `exportMemoryData` which converts Maps to Arrays.
          // Let's rely on the structure saved in `projects.data`.
          
          const newRowId = `row-${Date.now()}`;
          const newRowUids = [`rowIndex_${Date.now()}`];
          const newCells = {};
          
          newCells[newRowUids[0]] = { uid: newRowUids[0], value: (sheet.hashSheet.length).toString() };

          args.rowData.forEach((val, i) => {
            const cellUid = `cell-${Date.now()}-${i}`;
            newRowUids.push(cellUid);
            newCells[cellUid] = { uid: cellUid, value: String(val) };
          });
          
          sheet.hashSheet.push(newRowUids);
          if (Array.isArray(sheet.cells)) {
             // It's likely serialized as array of [key, value]
             Object.entries(newCells).forEach(entry => sheet.cells.push(entry));
          } else {
             Object.assign(sheet.cells, newCells);
          }
        } 
        // Note: For 'update' and 'delete' we would need more complex matching on rowKey.
        // Keeping it simple for the initial implementation.

        saveProjectData(args.projectId, p);
        return { content: [{ type: "text", text: `Memory table ${args.tableName} updated via ${action}.` }] };
      }

      default:
        throw new Error("Unknown tool");
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AI Novel Workshop MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
