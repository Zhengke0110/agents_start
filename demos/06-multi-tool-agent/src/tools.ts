/**
 * Demo 06 工具集：融合知识检索 + 文件操作 + 任务管理
 */

import * as fs from "fs";
import * as path from "path";

const WORKSPACE = path.resolve(process.cwd(), "demos", "06-multi-tool-agent", "workspace");
const DOCS_DIR = path.resolve(process.cwd(), "demos", "04-rag-agent", "docs");

// 确保 workspace 存在
fs.mkdirSync(WORKSPACE, { recursive: true });

// ---- 路径安全校验 ----
function safePath(filePath: string): string {
  const resolved = path.resolve(WORKSPACE, filePath);
  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error(`安全限制：禁止访问外部路径 → ${filePath}`);
  }
  return resolved;
}

// ---- Todo 管理 ----
interface Todo {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
  result: string;
}
let todos: Todo[] = [];
let nextId = 1;

function renderTodos(): string {
  if (todos.length === 0) return "暂无任务。";
  const labels: Record<string, string> = { pending: "待办", in_progress: "进行中", completed: "已完成" };
  return todos
    .map((t) => {
      const m = t.status === "completed" ? "X" : t.status === "in_progress" ? ">" : " ";
      return `  [${m}] ${t.id}. ${t.title} (${labels[t.status]})${t.result ? ` → ${t.result}` : ""}`;
    })
    .join("\n");
}

// ---- 文档检索 ----
interface Chunk {
  content: string;
  source: string;
  title: string;
}
let chunks: Chunk[] = [];

function loadDocs(): void {
  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
  chunks = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(DOCS_DIR, file), "utf-8");
    const sections = raw.split(/\n## /);
    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;
      const lines = trimmed.split("\n");
      const title = lines[0].replace(/^## /, "").trim();
      chunks.push({ content: lines.join("\n"), source: file, title });
    }
  }
}

function searchDocs(query: string, topK = 3): Chunk[] {
  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = chunks.map((chunk) => {
    const lower = chunk.content.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      const matches = lower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
      if (matches) score += matches.length;
    }
    return { chunk, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}

// ---- 工具 Schema ----
export const toolSchemas = [
  {
    type: "function" as const,
    function: {
      name: "searchDocs",
      description: "在知识库中搜索相关文档内容",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "搜索关键词" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "writeFile",
      description: "将内容写入 workspace 中的文件",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "文件路径" },
          content: { type: "string", description: "文件内容" },
        },
        required: ["filePath", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "listFiles",
      description: "列出 workspace 中的所有文件",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "createTodo",
      description: "创建新任务",
      parameters: {
        type: "object",
        properties: { title: { type: "string", description: "任务标题" } },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "updateTodo",
      description: "更新任务状态。status: pending/in_progress/completed",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "任务 ID" },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          result: { type: "string", description: "完成备注" },
        },
        required: ["id", "status"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "listTodos",
      description: "列出所有任务",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ---- 工具执行 ----
export function executeTool(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "searchDocs": {
      const results = searchDocs(String(args.query ?? ""));
      if (results.length === 0) return "未找到相关文档。";
      return results
        .map((r, i) => `[来源 ${i + 1}：${r.source} - ${r.title}]\n${r.content}`)
        .join("\n\n---\n\n");
    }

    case "writeFile": {
      // 去掉路径中多余的 "workspace/" 前缀，避免写成 workspace/workspace/...
      let filePath = String(args.filePath ?? "");
      filePath = filePath.replace(/^workspace[\/\\]/, "");
      const content = String(args.content ?? "");
      const target = safePath(filePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf-8");
      return `文件已写入：${filePath}（${content.length} 字符）`;
    }

    case "listFiles": {
      const items = fs.readdirSync(WORKSPACE, { withFileTypes: true });
      const lines = items.map((i) => `  ${i.name}${i.isDirectory() ? "/" : ""}`);
      return lines.length > 0 ? lines.join("\n") : "workspace 为空";
    }

    case "createTodo": {
      const id = String(nextId++);
      todos.push({ id, title: String(args.title ?? ""), status: "pending", result: "" });
      return `已创建：${id}. ${args.title}\n\n${renderTodos()}`;
    }

    case "updateTodo": {
      const id = String(args.id ?? "");
      const status = String(args.status ?? "") as Todo["status"];
      const todo = todos.find((t) => t.id === id);
      if (!todo) return `找不到任务 ${id}`;
      todo.status = status;
      if (args.result) todo.result = String(args.result);
      return `任务 ${id} → ${status}\n\n${renderTodos()}`;
    }

    case "listTodos":
      return renderTodos();

    default:
      return `未知工具：${name}`;
  }
}

// 启动时加载文档
loadDocs();
