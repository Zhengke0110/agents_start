/**
 * Demo 08 工具集：DeepAgents 风格 —— 融合 6 大能力
 *
 *   1. Planning（Todo）
 *   2. Tools（搜索 + 文件）
 *   3. Filesystem（读写）
 *   4. Context Management（长内容卸载到文件）
 *   5. SubAgent（委托子 Agent）
 *   6. Human Approval（危险操作确认）
 */

import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";

const WORKSPACE = path.resolve(process.cwd(), "demos", "08-deepagents-style-agent", "workspace");
const DOCS_DIR = path.resolve(process.cwd(), "demos", "04-rag-agent", "docs");

fs.mkdirSync(WORKSPACE, { recursive: true });

function safePath(fp: string): string {
  const r = path.resolve(WORKSPACE, fp);
  if (!r.startsWith(WORKSPACE)) throw new Error(`禁止访问外部：${fp}`);
  return r;
}

// ---- Todo ----
interface Todo { id: string; title: string; status: "pending" | "in_progress" | "completed"; result: string; }
let todos: Todo[] = [];
let nextId = 1;
function renderTodos(): string {
  if (!todos.length) return "暂无任务";
  const lb: Record<string, string> = { pending: "待办", in_progress: "进行中", completed: "已完成" };
  return todos.map(t => {
    const m = t.status === "completed" ? "X" : t.status === "in_progress" ? ">" : " ";
    return `  [${m}] ${t.id}. ${t.title} (${lb[t.status]})${t.result ? " -> " + t.result : ""}`;
  }).join("\n");
}

// ---- 文档检索 ----
interface Chunk { content: string; source: string; title: string; }
let chunks: Chunk[] = [];
function loadDocs() {
  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith(".md"));
  chunks = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(DOCS_DIR, f), "utf-8");
    for (const sec of raw.split(/\n## /)) {
      const t = sec.trim(); if (!t) continue;
      const lines = t.split("\n");
      chunks.push({ content: lines.join("\n"), source: f, title: lines[0].replace(/^## /, "").trim() });
    }
  }
}
function searchDocs(query: string, topK = 3): Chunk[] {
  const kws = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = chunks.map(c => {
    const lower = c.content.toLowerCase();
    let s = 0;
    for (const kw of kws) { const m = lower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")); if (m) s += m.length; }
    return { chunk: c, score: s };
  });
  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, topK).map(s => s.chunk);
}

// ---- 待审批操作队列 + 已批准的文件集合 ----
let approvedOverwrites = new Set<string>(); // 存已批准覆盖的文件路径

// ---- 文件卸载（上下文管理） ----
function offloadToFile(label: string, content: string): string {
  const filename = `context-${label.replace(/[^a-zA-Z0-9一-龥]/g, "_")}.md`;
  const target = safePath(filename);
  fs.writeFileSync(target, content, "utf-8");
  return `内容已卸载到文件：${filename}（${content.length} 字符）。后续可通过 readFile 读取。`;
}

// ---- Schema ----
export const toolSchemas = [
  { type: "function" as const, function: { name: "searchDocs", description: "搜索知识库文档", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function" as const, function: { name: "readFile", description: "读取 workspace 中的文件", parameters: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] } } },
  { type: "function" as const, function: { name: "writeFile", description: "写入文件到 workspace。如果文件已存在，会先请求人工确认。", parameters: { type: "object", properties: { filePath: { type: "string" }, content: { type: "string" } }, required: ["filePath", "content"] } } },
  { type: "function" as const, function: { name: "listFiles", description: "列出 workspace 中的文件", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "createTodo", description: "创建新任务", parameters: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } } },
  { type: "function" as const, function: { name: "updateTodo", description: "更新任务状态", parameters: { type: "object", properties: { id: { type: "string" }, status: { type: "string", enum: ["pending", "in_progress", "completed"] }, result: { type: "string" } }, required: ["id", "status"] } } },
  { type: "function" as const, function: { name: "listTodos", description: "列出所有任务", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "delegateToSubAgent", description: "将子任务委托给专门的子 Agent 处理。子 Agent 类型：researcher（研究分析）、writer（撰写报告）。", parameters: { type: "object", properties: { agentType: { type: "string", enum: ["researcher", "writer"], description: "子 Agent 类型" }, task: { type: "string", description: "子任务描述" } }, required: ["agentType", "task"] } } },
  { type: "function" as const, function: { name: "offloadContext", description: "当上下文过长时，将中间结果保存到文件以释放 token。调用此工具后，之前的长内容会存到文件，如需使用请用 readFile 读取。", parameters: { type: "object", properties: { label: { type: "string", description: "内容标签，如'搜索发现'" }, content: { type: "string", description: "要保存的内容" } }, required: ["label", "content"] } } },
  { type: "function" as const, function: { name: "requestApproval", description: "执行危险操作前请求人工确认（如覆盖已存在的文件）", parameters: { type: "object", properties: { action: { type: "string", description: "要确认的操作描述" } }, required: ["action"] } } },
];

// ---- SubAgent（子 Agent 调用） ----
let _subAgentClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_subAgentClient) {
    _subAgentClient = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY!, baseURL: process.env.DEEPSEEK_BASE_URL });
  }
  return _subAgentClient;
}

async function runSubAgent(agentType: string, task: string): Promise<string> {
  const prompts: Record<string, string> = {
    researcher: "你是研究员。根据任务要求分析信息，输出结构化的研究发现。请用中文。",
    writer: "你是技术写作者。根据任务要求撰写内容。请用中文。",
  };
  const c = getClient();
  const r = await c.chat.completions.create({
    model: "deepseek-chat", max_tokens: 2048,
    messages: [{ role: "system", content: prompts[agentType] || "你是助手" }, { role: "user", content: task }],
  });
  return r.choices[0]?.message?.content ?? "(空)";
}

// ---- 工具执行 ----
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "searchDocs": {
      const results = searchDocs(String(args.query ?? ""));
      if (!results.length) return "未找到相关文档";
      return results.map((r, i) => `[来源${i + 1}：${r.source} - ${r.title}]\n${r.content}`).join("\n\n---\n\n");
    }
    case "readFile": {
      const target = safePath(String(args.filePath ?? ""));
      if (!fs.existsSync(target)) return `文件不存在：${args.filePath}`;
      return fs.readFileSync(target, "utf-8");
    }
    case "writeFile": {
      const fp = String(args.filePath ?? "").replace(/^workspace[/\\]/, "");
      const content = String(args.content ?? "");
      const target = safePath(fp);
      // 人类审批：如果文件已存在且未被批准覆盖，则拒绝
      if (fs.existsSync(target) && !approvedOverwrites.has(fp)) {
        return `文件 "${fp}" 已存在，请先调用 requestApproval 请求人工确认覆盖操作。`;
      }
      // 已批准 → 清除记录，执行覆盖
      approvedOverwrites.delete(fp);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf-8");
      return `文件已写入：${fp}（${content.length} 字符）`;
    }
    case "listFiles": {
      const items = fs.readdirSync(WORKSPACE, { withFileTypes: true });
      const lines = items.map(i => `  ${i.name}${i.isDirectory() ? "/" : ""}`);
      return lines.length ? lines.join("\n") : "workspace 为空";
    }
    case "createTodo": {
      const id = String(nextId++);
      todos.push({ id, title: String(args.title ?? ""), status: "pending", result: "" });
      return `已创建：${id}. ${args.title}\n\n${renderTodos()}`;
    }
    case "updateTodo": {
      const id = String(args.id ?? "");
      const status = String(args.status ?? "") as Todo["status"];
      const t = todos.find(t => t.id === id);
      if (!t) return `找不到 ${id}`;
      t.status = status;
      if (args.result) t.result = String(args.result);
      return `任务 ${id} -> ${status}\n\n${renderTodos()}`;
    }
    case "listTodos":
      return renderTodos();
    case "delegateToSubAgent": {
      const agentType = String(args.agentType ?? "researcher");
      const task = String(args.task ?? "");
      console.log(`         [subAgent] 启动子 Agent：${agentType}...`);
      const result = await runSubAgent(agentType, task);
      console.log(`         [subAgent] ${agentType} 完成（${result.length} 字符）`);
      return `[子Agent:${agentType}] 执行结果：\n${result}`;
    }
    case "offloadContext": {
      return offloadToFile(String(args.label ?? "data"), String(args.content ?? ""));
    }
    case "requestApproval": {
      const action = String(args.action ?? "");
      // 从 action 描述中提取文件名，加入已批准集合
      const match = action.match(/agent-learning-report\.md|[\w-]+\.(md|txt|json)/);
      if (match) approvedOverwrites.add(match[0]);
      // 模拟审批：实际项目中这里会暂停等待用户输入
      console.log(`\n  ╔════════════════════════════════════════╗`);
      console.log(`  ║  [审批] ${action}`);
      console.log(`  ║  自动批准（Demo 模式）`);
      console.log(`  ╚════════════════════════════════════════╝\n`);
      return `操作已批准：${action}`;
    }
    default:
      return `未知工具：${name}`;
  }
}

loadDocs();
