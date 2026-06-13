/**
 * MCP Client —— 连接 MCP Server，发现工具并调用
 *
 * 流程：
 *   1. 启动 MCP Server 子进程
 *   2. 通过 stdio 连接
 *   3. 列出可用工具（tools/list）
 *   4. 调用工具（tools/call）
 *   5. 显示结果
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "path";

async function main() {
  console.log("========== MCP Client Demo ==========\n");

  // 第 1 步：启动 MCP Server 子进程
  console.log("[client] 启动 MCP Server...");
  const serverPath = path.resolve(process.cwd(), "src", "mcp", "mcp-server.ts");

  // StdioClientTransport 会自动启动和管理子进程
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", serverPath],
  });

  const client = new Client(
    { name: "mcp-demo-client", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.log("[client] 已连接到 MCP Server\n");

  // 第 3 步：发现工具
  console.log("[client] 获取可用工具列表...");
  const tools = await client.listTools();
  console.log(`[client] Server 提供了 ${tools.tools.length} 个工具：`);
  tools.tools.forEach((t) => {
    console.log(`  - ${t.name}: ${t.description}`);
  });

  console.log();

  // 第 4 步：调用工具 —— writeFile
  console.log("[client] 调用 writeFile...");
  const writeResult = await client.callTool({
    name: "writeFile",
    arguments: {
      filePath: "mcp-demo.md",
      content:
        "# MCP Demo\n\n这个文件是通过 MCP 协议创建的。\n\n- MCP = Model Context Protocol\n- Server 暴露工具\n- Client 发现并调用工具\n- 通信基于 JSON-RPC",
    },
  });
  const writeText = (writeResult.content as { type: string; text: string }[])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");
  console.log(`  ${writeText}`);

  // 第 5 步：调用工具 —— listFiles
  console.log("\n[client] 调用 listFiles...");
  const listResult = await client.callTool({
    name: "listFiles",
    arguments: {},
  });
  const listText = (listResult.content as { type: string; text: string }[])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");
  console.log(listText);

  // 第 6 步：调用工具 —— readFile
  console.log("\n[client] 调用 readFile...");
  const readResult = await client.callTool({
    name: "readFile",
    arguments: { filePath: "mcp-demo.md" },
  });
  const readText = (readResult.content as { type: string; text: string }[])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");
  console.log(readText);

  // 关闭连接
  await client.close();
  console.log("\n[info] MCP Demo 完成");
}

main();
