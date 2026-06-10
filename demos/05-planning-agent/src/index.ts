/**
 * Demo 05：Planning Agent —— 任务规划与拆解
 *
 * 核心思想：
 *   复杂任务不能一步完成。Agent 先列出计划（Todo List），
 *   再逐个执行，每完成一步更新状态。
 *
 * 状态机：pending → in_progress → completed
 */

import * as dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL,
});

// ============================================================
// Todo 数据结构与存储（内存）
// ============================================================
interface Todo {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
  result: string; // 完成后的结果备注
}

let todos: Todo[] = [];
let nextId = 1;

function renderTodos(): string {
  if (todos.length === 0) return "暂无任务。";

  const statusLabel: Record<string, string> = {
    pending: "待办",
    in_progress: "进行中",
    completed: "已完成",
  };

  return todos
    .map((t) => {
      const marker =
        t.status === "completed" ? "X" : t.status === "in_progress" ? ">" : " ";
      return `  [${marker}] ${t.id}. ${t.title} (${statusLabel[t.status]})${
        t.result ? ` → ${t.result}` : ""
      }`;
    })
    .join("\n");
}

// ============================================================
// 工具 Schema
// ============================================================
const toolSchemas = [
  {
    type: "function" as const,
    function: {
      name: "createTodo",
      description: "创建一个新任务。先规划所有步骤，再用此工具逐个创建。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "任务标题" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "updateTodo",
      description:
        "更新任务状态。完成一个任务后将其标记为 completed，开始一个任务时标记为 in_progress。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "任务 ID" },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed"],
            description: "新状态",
          },
          result: {
            type: "string",
            description: "完成后的结果备注（仅 completed 时需要）",
          },
        },
        required: ["id", "status"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "listTodos",
      description: "列出所有任务及其状态",
      parameters: { type: "object", properties: {} },
    },
  },
];

function executeTool(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "createTodo": {
      const title = String(args.title ?? "");
      const id = String(nextId++);
      todos.push({ id, title, status: "pending", result: "" });
      return `任务已创建：${id}. ${title}\n\n当前所有任务：\n${renderTodos()}`;
    }

    case "updateTodo": {
      const id = String(args.id ?? "");
      const status = String(args.status ?? "pending") as Todo["status"];
      const result = String(args.result ?? "");
      const todo = todos.find((t) => t.id === id);
      if (!todo) return `找不到任务 ID：${id}`;
      todo.status = status;
      if (result) todo.result = result;
      return `任务 ${id} 状态已更新为 ${status}。\n\n当前所有任务：\n${renderTodos()}`;
    }

    case "listTodos": {
      return `当前所有任务：\n${renderTodos()}`;
    }

    default:
      return `未知工具：${name}`;
  }
}

// ============================================================
// Agent Loop
// ============================================================
async function main() {
  const userMessage =
    "帮我规划并执行一次技术分享的准备，主题是「Agent 开发入门」。\n" +
    "需要准备：PPT 大纲、演讲稿、Demo 代码。请先列出计划，再逐步完成。";

  console.log("========== Demo 05：Planning Agent ==========\n");
  console.log("[user]", userMessage, "\n");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "你是一个项目经理助手。面对复杂任务，你必须先规划（创建 Todo），再逐步执行（更新状态）。" +
        "规则：一次只做一个任务（in_progress），完成后标记 completed 再做下一个。请用中文回复。",
    },
    { role: "user", content: userMessage },
  ];

  const MAX_LOOPS = 15;
  let loopCount = 0;

  while (loopCount < MAX_LOOPS) {
    loopCount++;
    console.log(`── 第 ${loopCount} 轮 ──`);

    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages,
      tools: toolSchemas,
    });

    const choice = response.choices[0];

    if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls) {
      console.log("[llm] 最终回复：");
      console.log(choice.message.content);
      console.log(`\n[info] 共 ${loopCount} 轮完成`);
      console.log("\n最终任务状态：");
      console.log(renderTodos());
      return;
    }

    console.log(`[llm] 请求调用 ${choice.message.tool_calls.length} 个工具：`);
    messages.push(choice.message);

    for (const tc of choice.message.tool_calls) {
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments);
      const result = executeTool(name, args);

      console.log(`  [tool] ${name}(${JSON.stringify(args)})`);
      console.log(`         => ${result.replace(/\n/g, "\n            ")}`);

      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    console.log();
  }

  console.log(`[warn] 达到最大循环次数 ${MAX_LOOPS}`);
}

main();
