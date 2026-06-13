/**
 * MCP Server —— 通过标准协议暴露文件工具
 *
 * MCP 流程：
 *   1. Client 连接 Server
 *   2. Client 请求 tools/list → Server 返回可用工具列表
 *   3. Client 请求 tools/call → Server 执行工具 → 返回结果
 *
 * 通信方式：stdio（标准输入输出）
 *   Server 从 stdin 读请求，往 stdout 写回复
 */

import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE = path.resolve(process.cwd(), "workspace");
fs.mkdirSync(WORKSPACE, { recursive: true });

function safePath(fp: string): string {
  const r = path.resolve(WORKSPACE, fp);
  if (!r.startsWith(WORKSPACE)) throw new Error(`禁止访问外部：${fp}`);
  return r;
}

// 创建 Server
const server = new McpServer({
  name: "file-tools-server",
  version: "1.0.0",
});

// ── 注册工具 1：writeFile ──
server.tool(
  "writeFile",
  "在 workspace 中创建或覆盖文件",
  {
    filePath: z.string().describe("文件路径（相对于 workspace）"),
    content: z.string().describe("文件内容"),
  },
  async ({ filePath, content }) => {
    const cleanPath = filePath.replace(/^workspace[/\\]/, "");
    const target = safePath(cleanPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf-8");
    return {
      content: [
        {
          type: "text",
          text: `文件已写入：${cleanPath}（${content.length} 字符）`,
        },
      ],
    };
  },
);

// ── 注册工具 2：readFile ──
server.tool(
  "readFile",
  "读取 workspace 中的文件",
  { filePath: z.string().describe("文件路径") },
  async ({ filePath }) => {
    const cleanPath = filePath.replace(/^workspace[/\\]/, "");
    const target = safePath(cleanPath);
    if (!fs.existsSync(target)) {
      return { content: [{ type: "text", text: `文件不存在：${cleanPath}` }] };
    }
    const content = fs.readFileSync(target, "utf-8");
    return { content: [{ type: "text", text: content }] };
  },
);

// ── 注册工具 3：listFiles ──
server.tool("listFiles", "列出 workspace 中的所有文件", {}, async () => {
  const items = fs.readdirSync(WORKSPACE, { withFileTypes: true });
  const lines = items.map((i) => {
    const stats = fs.statSync(path.join(WORKSPACE, i.name));
    return `  ${i.name} (${stats.size} 字节)`;
  });
  return {
    content: [
      {
        type: "text",
        text: lines.length ? lines.join("\n") : "workspace 为空",
      },
    ],
  };
});

// ── 启动 Server ──
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-server] 已启动，等待客户端连接...");
}

main();
