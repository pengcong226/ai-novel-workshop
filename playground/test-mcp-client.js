import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function run() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["mcp-server.js"]
  });

  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  console.log("✅ Successfully connected to MCP Server!");

  const tools = await client.listTools();
  console.log("🛠️ Available tools:", tools.tools.map(t => t.name).join(", "));

  console.log("\n📦 Fetching projects...");
  const result = await client.callTool({
    name: "list_projects",
    arguments: {}
  });

  console.log("📄 list_projects result:\n", result.content[0].text);
  process.exit(0);
}

run().catch(console.error);
