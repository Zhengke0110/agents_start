/**
 * 模块 1：LangGraph 任务规划 Agent
 *
 * LangGraph 核心概念：
 *   State   = 在节点之间流转的共享数据
 *   Node    = 处理 State 的函数（读 state → 做事 → 返回新 state）
 *   Edge    = 节点之间的连线（A → B）
 *   Conditional Edge = 根据条件跳转到不同节点
 *   Checkpoint = 每步自动保存状态（LangGraph 内置）
 *   interrupt() = 暂停，等待人工确认
 *
 * 本图结构：
 *   start → planner → executor ←─┐
 *                        │        │   (还有未完成任务)
 *                        ├─→ reporter (全部完成)
 *                        │
 *                        ├─→ human_approval (危险操作)
 *                        │        │
 *                        └─→ executor (批准后继续)
 */

import * as dotenv from "dotenv";
dotenv.config();

import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import * as fs from "fs";
import * as path from "path";

// 初始化 LLM
const model = new ChatOpenAI({
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY,
  configuration: { baseURL: process.env.DEEPSEEK_BASE_URL },
});

// 工作目录
const WORKSPACE = path.resolve(process.cwd(), "workspace");
fs.mkdirSync(WORKSPACE, { recursive: true });

// ================================================================
// State：在图中流转的数据
// ================================================================
const AgentState = Annotation.Root({
  userInput: Annotation<string>,
  todos: Annotation<{ id: number; title: string; status: string; result: string }[]>,
  currentTaskIndex: Annotation<number>,
  needsApproval: Annotation<boolean>,
  approvalMessage: Annotation<string>,
  approvalResult: Annotation<string>,
  log: Annotation<string[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  finalReport: Annotation<string>,
});

// ================================================================
// 节点 1：Planner —— 用 LLM 把复杂任务拆成步骤
// ================================================================
async function plannerNode(state: typeof AgentState.State) {
  console.log("\n[planner] 分析任务，生成计划...");

  const prompt = `
你是一个任务规划助手。用户的请求如下：

"${state.userInput}"

请把这个任务拆成 3-5 个具体步骤。输出每行一个步骤，格式为 "步骤描述"。
只输出步骤列表。`;

  const response = await model.invoke(prompt);
  const content = typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);

  const steps = content
    .split("\n")
    .map((line: string) => line.replace(/^\d+[.)]\s*/, "").trim())
    .filter((line: string) => line.length > 5);

  const todos = steps.map((title: string, index: number) => ({
    id: index + 1,
    title,
    status: "pending" as const,
    result: "",
  }));

  console.log(`[planner] 生成 ${todos.length} 个步骤：`);
  todos.forEach((t: { id: number; title: string }) =>
    console.log(`  ${t.id}. ${t.title}`),
  );

  return {
    todos,
    log: [`[planner] 生成 ${todos.length} 个步骤`],
  };
}

// ================================================================
// 节点 2：Executor —— 执行当前任务
// ================================================================
async function executorNode(state: typeof AgentState.State) {
  const idx = state.currentTaskIndex;
  const todo = state.todos[idx];

  if (!todo) {
    console.log("[executor] 所有任务已完成");
    return { log: ["[executor] 无待执行任务"] };
  }

  console.log(`\n[executor] 执行任务 ${todo.id}：${todo.title}`);

  // 更新为进行中
  const updatedTodos = state.todos.map((t, i) =>
    i === idx ? { ...t, status: "in_progress" } : t,
  );

  return {
    todos: updatedTodos,
    log: [`[executor] 开始执行：${todo.title}`],
  };
}

// ================================================================
// 条件判断 1：检查当前任务是否危险
// ================================================================
function checkDangerous(state: typeof AgentState.State): string {
  const todo = state.todos[state.currentTaskIndex];
  if (!todo) return "continue";

  const title = todo.title.toLowerCase();
  const dangerous = ["删除", "覆盖", "shell", "命令", "delete", "remove"];

  if (dangerous.some((kw) => title.includes(kw))) {
    console.log(`[check] 检测到危险操作：${todo.title}`);
    return "approval";
  }

  return "continue";
}

// ================================================================
// 条件判断 2：检查是否还有未完成任务
// ================================================================
function checkNext(state: typeof AgentState.State): string {
  const nextIdx = state.currentTaskIndex + 1;
  if (nextIdx < state.todos.length) return "executor";
  return "reporter";
}

// ================================================================
// 节点 3：HumanApproval —— 人工审批
// ================================================================
async function humanApprovalNode(state: typeof AgentState.State) {
  const todo = state.todos[state.currentTaskIndex];
  console.log(`\n[approval] 危险操作需要审批：${todo?.title}`);

  return {
    needsApproval: true,
    approvalMessage: `是否执行：${todo?.title}？请回复"批准"或"拒绝"。`,
    log: [`[approval] 等待审批：${todo?.title}`],
  };
}

// ================================================================
// 节点 4：Reporter —— 生成最终报告
// ================================================================
async function reporterNode(state: typeof AgentState.State) {
  console.log("\n[reporter] 生成执行报告...");

  const completedTodos = state.todos.filter((t) => t.status === "completed");

  const reportPath = path.join(WORKSPACE, "execution-report.md");
  const reportLines = [
    "# 执行报告",
    "",
    `> 原始任务：${state.userInput}`,
    "",
    "## 执行日志",
    "",
    ...state.log.map((l) => `- ${l}`),
    "",
    "## 任务状态",
    "",
    ...state.todos.map((t) => {
      const m = t.status === "completed" ? "X" : t.status === "in_progress" ? ">" : " ";
      return `- [${m}] ${t.id}. ${t.title} ${t.result ? "→ " + t.result : ""}`;
    }),
    "",
    `共 ${completedTodos.length}/${state.todos.length} 个任务完成。`,
  ];

  fs.writeFileSync(reportPath, reportLines.join("\n"), "utf-8");
  console.log(`[reporter] 报告已保存到 workspace/execution-report.md`);

  return {
    finalReport: reportLines.join("\n"),
    log: ["[reporter] 报告已生成"],
  };
}

// ================================================================
// 构建图
// ================================================================
const graph = new StateGraph(AgentState)
  .addNode("planner", plannerNode)
  .addNode("executor", executorNode)
  .addNode("human_approval", humanApprovalNode)
  .addNode("reporter", reporterNode)

  .addEdge("__start__", "planner")
  .addEdge("planner", "executor")

  // executor → 危险检查
  .addConditionalEdges("executor", checkDangerous, {
    continue: "__end__",  // 先结束当前轮，外部循环会再次进入
    approval: "human_approval",
  })

  .addEdge("human_approval", "executor")

  .compile();

// ================================================================
// 运行
// ================================================================
async function main() {
  const userInput =
    "请帮我完成以下任务：\n" +
    "1. 在工作区创建一个学习笔记 notes.md，内容是关于 LangGraph 的核心概念\n" +
    "2. 删除临时文件 temp.txt（如果存在的话）\n" +
    "3. 生成一份执行报告";

  console.log("========== LangGraph 任务规划 Agent ==========\n");
  console.log("[user]", userInput, "\n");

  const stream = await graph.stream(
    { userInput },
    { streamMode: "values" },
  );

  console.log("\n── 开始执行 ──\n");

  for await (const chunk of stream) {
    if (chunk.needsApproval) {
      console.log(`${"=".repeat(50)}`);
      console.log(chunk.approvalMessage);
      console.log(`${"=".repeat(50)}`);
      console.log("[info] Demo 模式：自动批准\n");
    }
  }

  await new Promise((r) => setTimeout(r, 500));
  console.log("[info] 图执行完毕");
  console.log("[info] 查看 workspace/execution-report.md");
}

main();
