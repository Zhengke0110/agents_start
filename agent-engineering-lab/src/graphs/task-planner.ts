/**
 * 模块 1：LangGraph 任务规划 Agent
 *
 * LangGraph 核心概念：
 *   State   = 在节点之间流转的共享数据
 *   Node    = 处理 State 的函数
 *   Edge    = 节点之间的连线
 *   Conditional Edge = 根据条件跳转到不同节点
 *   Checkpoint = 每步自动保存状态
 *
 * 图结构：
 *   start → planner → executor → router ──→ executor (下一任务)
 *                                      ├──→ human_approval (危险操作)
 *                                      └──→ reporter (全部完成)
 *                   human_approval → executor (批准后执行)
 *                                     reporter → END
 */

import * as dotenv from "dotenv";
dotenv.config();

import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import * as fs from "fs";
import * as path from "path";

const model = new ChatOpenAI({
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY,
  configuration: { baseURL: process.env.DEEPSEEK_BASE_URL },
});

const WORKSPACE = path.resolve(process.cwd(), "workspace");
fs.mkdirSync(WORKSPACE, { recursive: true });

// ================================================================
// State
// ================================================================
const AgentState = Annotation.Root({
  userInput: Annotation<string>({
    value: (a, b) => b ?? a ?? "",
    default: () => "",
  }),
  todos: Annotation<
    { id: number; title: string; status: string; result: string }[]
  >({
    value: (a, b) => b ?? a ?? [],
    default: () => [],
  }),
  currentTaskIndex: Annotation<number>({
    value: (a, b) => b ?? a ?? 0,
    default: () => 0,
  }),
  needsApproval: Annotation<boolean>({
    value: (a, b) => b ?? a ?? false,
    default: () => false,
  }),
  approvalMessage: Annotation<string>({
    value: (a, b) => b ?? a ?? "",
    default: () => "",
  }),
  log: Annotation<string[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  finalReport: Annotation<string>({
    value: (a, b) => b ?? a ?? "",
    default: () => "",
  }),
});

// ================================================================
// 节点 1：Planner
// ================================================================
async function planner(state: typeof AgentState.State) {
  console.log("\n[planner] 分析任务，生成计划...");

  const prompt = `你是任务规划助手。请把以下任务拆成 3-5 个具体步骤，每行一个：\n\n${state.userInput}\n\n只输出步骤列表。`;

  const response = await model.invoke(prompt);
  const content =
    typeof response.content === "string"
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
// 节点 2：Executor —— 执行一个任务并标记完成
// ================================================================
async function executor(state: typeof AgentState.State) {
  const idx = state.currentTaskIndex;
  const todo = state.todos[idx];

  if (!todo) {
    return { log: ["[executor] 无待执行任务"] };
  }

  console.log(`\n[executor] 完成任务 ${todo.id}：${todo.title}`);

  const newTodos = state.todos.map((t, i) =>
    i === idx ? { ...t, status: "completed" as const, result: "已完成" } : t,
  );

  return {
    todos: newTodos,
    currentTaskIndex: idx + 1,
    // Bug 修复：执行完后清除审批状态
    needsApproval: false,
    approvalMessage: "",
    log: [`[executor] 已完成：${todo.title}`],
  };
}

// ================================================================
// Router：根据状态决定下一个节点
// ================================================================
function router(state: typeof AgentState.State): string {
  const idx = state.currentTaskIndex;

  // 全部完成
  if (idx >= state.todos.length) {
    console.log("[router] 全部完成 → reporter");
    return "reporter";
  }

  const todo = state.todos[idx];
  const title = todo.title;
  // 精确匹配：任务描述开头包含危险动词才判危险
  const dangerPatterns = [
    /^删除/,
    /删除文件/,
    /删除目录/,
    /覆盖文件/,
    /执行.*命令/,
    /shell/,
  ];

  if (dangerPatterns.some((p) => p.test(title))) {
    console.log(`[router] 危险操作 → human_approval：${title}`);
    return "human_approval";
  }

  console.log(`[router] 安全任务 → executor：${todo.title}`);
  return "executor";
}

// ================================================================
// 节点 3：HumanApproval
// ================================================================
async function humanApproval(state: typeof AgentState.State) {
  const todo = state.todos[state.currentTaskIndex];
  console.log(`\n[approval] 危险操作需要审批：${todo?.title}`);

  return {
    needsApproval: true,
    approvalMessage: `是否执行危险操作：${todo?.title}？`,
    log: [`[approval] 等待审批：${todo?.title}`],
  };
}

// ================================================================
// 节点 4：Reporter
// ================================================================
async function reporter(state: typeof AgentState.State) {
  console.log("\n[reporter] 生成执行报告...");

  const completed = state.todos.filter((t) => t.status === "completed");
  const reportPath = path.join(WORKSPACE, "execution-report.md");

  const lines = [
    "# 执行报告",
    "",
    `> 任务：${state.userInput}`,
    "",
    "## 执行日志",
    ...state.log.map((l) => `- ${l}`),
    "",
    "## 任务状态",
    ...state.todos.map((t) => {
      const m =
        t.status === "completed" ? "X" : t.status === "in_progress" ? ">" : " ";
      return `- [${m}] ${t.id}. ${t.title}`;
    }),
    "",
    `完成 ${completed.length}/${state.todos.length} 个任务。`,
  ];

  fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");
  console.log(`[reporter] 报告已保存到 workspace/execution-report.md`);

  return {
    finalReport: lines.join("\n"),
    log: ["[reporter] 报告已生成"],
  };
}

// ================================================================
// 构建图
// ================================================================
const graph = new StateGraph(AgentState)
  .addNode("planner", planner)
  .addNode("executor", executor)
  .addNode("human_approval", humanApproval)
  .addNode("reporter", reporter)

  // start → planner → executor → router
  .addEdge("__start__", "planner")
  .addEdge("planner", "executor")
  .addConditionalEdges("executor", router, {
    executor: "executor",
    human_approval: "human_approval",
    reporter: "reporter",
  })

  // human_approval → executor（批准后执行）
  .addEdge("human_approval", "executor")

  // reporter → END
  .addEdge("reporter", END)

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

  const stream = await graph.stream({ userInput }, { streamMode: "values" });

  console.log("\n── 开始执行 ──\n");

  for await (const chunk of stream) {
    // 只在审批节点触发时打印，且 finalReport 生成后不再检查
    if (chunk.needsApproval && !chunk.finalReport) {
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
