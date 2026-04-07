import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function run() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["mcp-server.js"]
  });

  const client = new Client({ name: "antigravity-agent", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  
  // 获取项目列表
  const listResult = await client.callTool({ name: "list_projects", arguments: {} });
  const projects = JSON.parse(listResult.content[0].text);
  
  if (projects.length === 0) {
    console.log("没有找到任何项目！");
    process.exit(0);
  }
  
  // 取第一个项目（也就是刚才新建的那个项目）
  const projectId = projects[0].id;
  console.log(`🎯 定位到项目: ${projects[0].title} (ID: ${projectId})`);

  // 作为Agent，我要直接调用工具插入人物设定
  console.log("⚡ 正在通过 MCP 协议向底层数据库注入反派角色设定...");
  
  const createResult = await client.callTool({
    name: "create_character",
    arguments: {
      projectId: projectId,
      name: "厉天行",
      role: "antagonist",
      personality: "冷酷无情，为了追求无上大道可以牺牲一切，极其狡猾且拥有极深的城府。",
      background: "三千年前魔道第一大宗门『血魔宗』的最后一代宗主，曾被正道联手封印。如今封印松动，他的一缕残魂逃出，附身在了一个落魄书生身上，企图重新掀起修仙界的腥风血雨。"
    }
  });

  console.log("✅ 角色注入成功！MCP服务端响应：", createResult.content[0].text);
  
  // 顺便拉取一下当前项目设定，确认是否已经加进去了
  const contextResult = await client.callTool({
    name: "get_project_context",
    arguments: { projectId: projectId }
  });
  
  const projectContext = JSON.parse(contextResult.content[0].text);
  console.log(`\n👁️ 检查数据库中的角色列表：\n`, projectContext.characters.map(c => `- ${c.name} (${c.role}): ${c.background}`).join('\n'));

  process.exit(0);
}

run().catch(console.error);
