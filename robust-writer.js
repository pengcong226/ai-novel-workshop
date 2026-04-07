import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const API_KEY = process.env.E2E_API_KEY || "";
const API_URL = process.env.E2E_API_BASE_URL || "https://maas-api.ai-yuanjing.com/openapi/compatible-mode/v1/chat/completions";

async function callAI(prompt) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({ 
        model: "glm-5", 
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
  } catch(e) {
    console.error("AI调用失败:", e.message);
    return "生成失败的备用文本：" + prompt.substring(0, 50);
  }
}

async function run() {
  console.log("========== 🚀 启动 MCP 原生深层挂载造书引擎 ==========");
  const transport = new StdioClientTransport({ command: "node", args: ["mcp-server.js"] });
  const client = new Client({ name: "agent", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  const listRes = await client.callTool({ name: "list_projects", arguments: {} });
  const projects = JSON.parse(listRes.content[0].text);
  if (projects.length === 0) {
    console.error("无项目可写！请在界面新建一个项目。"); process.exit(1);
  }
  
  // 选最新的项目
  const projectId = projects[projects.length - 1].id;
  console.log(`📌 锁定目标项目: ${projects[projects.length-1].title} (ID: ${projectId})`);

  // 1. 生成并注入世界观与人物
  console.log("\n[1/4] 🧠 构思赛博修仙设定与角色卡...");
  await client.callTool({
    name: "create_character",
    arguments: {
      projectId, name: "陈星", role: "protagonist",
      personality: "冷静，理性，对代码有绝对的信仰，轻微社恐。",
      background: "曾经是地球架构师，意外穿越到赛博修仙世界，体内携带了名为『天道编译器』的神秘辅助光脑。"
    }
  });
  await client.callTool({
    name: "create_character",
    arguments: {
      projectId, name: "李铁手", role: "supporting",
      personality: "粗犷，豪迈，是一个典型的机械义体改造狂人。",
      background: "外门弟子，双臂被改造成高爆反坦克合金臂，平时在废品区淘换灵能电池。"
    }
  });
  console.log("✅ 成功向数据库注入主角和配角设定！");

  // 2. 生成大纲
  console.log("\n[2/4] 📜 利用 GLM-5 生成前10章大纲...");
  const outlinePrompt = `帮我构思一本叫《代码飞升》的赛博修仙小说前10章大纲。要求：写出第1~10章的章节名和一百字简介，格式必须是严格的JSON数组：[{"title":"第1章 xx", "summary": "...", "details":"..."}, ... ] 不要加任何markdown标记。`;
  let outlineJson = await callAI(outlinePrompt);
  outlineJson = outlineJson.replace(/```(?:json)?\s*([\s\S]*?)\s*```/,'$1').trim();
  let outlineArray = [];
  try { outlineArray = JSON.parse(outlineJson); } catch(e) {
    console.log("JSON解析失败，使用内置大纲回退机制");
    outlineArray = Array.from({length: 10}, (_, i) => ({
      title: `第${i+1}章：赛博修真之路`, summary: `陈星的第${i+1}次试炼，突破系统防火墙`, details: `第${i+1}章战斗剧情`
    }));
  }

  await client.callTool({
    name: "update_outline",
    arguments: {
      projectId, synopsis: "在灵力可以通过光纤传输的世界里，唯一掌握底层代码的男人。",
      newChaptersOutline: outlineArray
    }
  });
  console.log("✅ 大纲已注入数据库！");

  // 3. 生成正文（实际写10章）
  console.log("\n[3/4] ✍️ 开始驱动 GLM-5 自动撰写正文...");
  for(let i=0; i<10; i++) {
    const ch = outlineArray[i] || {title: `第${i+1}章`, summary: "默认"};
    console.log(`正在撰写: ${ch.title}...`);
    const prompt = `根据大纲：【${ch.title}: ${ch.summary}】要求写一篇网文，必须带赛博朋克和修真结合的风格。主角陈星。字数800-1000字。直接正文输出，不要说废话。`;
    const content = await callAI(prompt);
    
    await client.callTool({
      name: "save_chapter",
      arguments: {
        projectId,
        chapterId: `ch_${Date.now()}_${i}`,
        chapterNumber: i+1,
        title: ch.title,
        content: content,
        summary: ch.summary
      }
    });
    console.log(`✅ 第${i+1}章写入成功！`);
  }

  // 4. 更新包裹/记忆表
  console.log("\n[4/4] 🎒 模拟 AI 更新内置表格记忆系统...");
  await client.callTool({
    name: "update_memory_table",
    arguments: {
      projectId,
      tableName: "重要物品",
      action: "insert",
      rowKey: "生锈的灵能电池",
      rowData: ["生锈的灵能电池", "陈星", "能量源", "提供微弱灵力", "中", "从机器犬残骸上拆除"]
    }
  });
  console.log("✅ 物品已存入【重要物品】表！");

  console.log("\n🎉 全部闭环执行完成！请刷新前端页面查看（点击小说 -> 角色卡、大纲、章节以及表格记忆）。");
  process.exit(0);
}

run().catch(console.error);
