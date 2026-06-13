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

import {
  StateGraph,
  Annotation,
  END,
  interrupt,
  MemorySaver,
  Command,
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import * as fs from "fs";
import * as path from "path";
import {
  writeFile,
  deleteFile,
  confirmDeleteFile,
  listFiles,
  toolDescriptions,
} from "../tools/file-tools.js";

const model = new ChatOpenAI({
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY,
  configuration: { baseURL: process.env.DEEPSEEK_BASE_URL },
});

const WORKSPACE = path.resolve(process.cwd(), "workspace");
fs.mkdirSync(WORKSPACE, { recursive: true });

// Checkpoint 存储器：保存每步状态，支持暂停/恢复
const memorySaver = new MemorySaver();

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
    value: (a, b) => b,
    default: () => false,
  }),
  approvalMessage: Annotation<string>({
    value: (a, b) => b,
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
  pendingAction: Annotation<{ tool: string; filePath: string } | null>({
    value: (a, b) => b, // 直接取新值，包括 null（清空也生效）
    default: () => null,
  }),
});

// ================================================================
// 节点 1：Planner
// ================================================================
async function planner(state: typeof AgentState.State) {
  console.log("\n[planner] 分析任务，生成计划...");

  const prompt = `你是任务规划助手。请把以下任务拆成 3-5 个具体步骤，每行一个：\n\n${state.userInput}\n\n规则：不要生成"生成报告""汇总报告"之类的步骤，系统会自动生成最终报告。只输出步骤列表。`;

  const response = await model.invoke(prompt); // 模型调用
  const content =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content); // 兼容 JSON

  const steps = content
    .split("\n")
    .map((line: string) => line.replace(/^\d+[.)]\s*/, "").trim())
    .filter((line: string) => line.length > 5); //  把 LLM 返回按行拆开

  const todos = steps.map((title: string, index: number) => ({
    id: index + 1,
    title,
    status: "pending" as const,
    result: "",
  })); // 生成待办列表

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
// 节点 2：Executor —— 用 LLM 选工具 + 真正执行
// ================================================================
async function executor(state: typeof AgentState.State) {
  const idx = state.currentTaskIndex;
  const todo = state.todos[idx];

  if (!todo) {
    return { log: ["[executor] 无待执行任务"] };
  }

  console.log(`\n[executor] 执行任务 ${todo.id}：${todo.title}`);

  // 如果有待审批的操作且审批已通过，执行它
  if (state.pendingAction) {
    const action = state.pendingAction;
    console.log(
      `[executor] 执行已审批的操作：${action.tool}("${action.filePath}")`,
    );

    let result: string;
    if (action.tool === "deleteFile") {
      const r = confirmDeleteFile(action.filePath); // 确认删除操作
      result = r.message;
    } else {
      result = `未知操作：${action.tool}`;
    }

    const newTodos = state.todos.map((t, i) =>
      i === idx ? { ...t, status: "completed" as const, result } : t,
    );

    return {
      todos: newTodos,
      currentTaskIndex: idx + 1,
      needsApproval: false,
      approvalMessage: "",
      pendingAction: null,
      log: [`[executor] 已完成：${todo.title} → ${result}`],
    };
  }

  // 用 LLM 决定执行哪个工具
  const toolPrompt = `你是一个工具执行器。根据任务描述，选择一个工具执行。

${toolDescriptions}

规则：
- 直接执行任务要求的操作，不要先"检查"再执行。deleteFile 会自动处理文件不存在的情况。
- 如果任务是"删除 temp.txt"，直接调 deleteFile("temp.txt")，不要先调 listFiles。
- 如果任务是"创建笔记"，直接调 writeFile。
- 如果任务说"生成报告"或"汇总"，返回 {"tool": "none", "reason": "由系统生成"}

任务描述：${todo.title}

请返回 JSON：{"tool": "工具名", "args": ["参数1", "参数2"]}
只返回 JSON。`;

  const response = await model.invoke(toolPrompt); // 模型调用
  const text =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  console.log(`[executor] LLM 决策：${text.slice(0, 150)}`);

  // 解析 LLM 返回的 JSON
  let toolCall: { tool: string; args: string[] };
  try {
    // 提取 JSON（可能被 markdown 包裹）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    toolCall = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : { tool: "none", args: [] };
  } catch {
    toolCall = { tool: "none", args: [] };
  }

  // 不需要工具 → 标记完成
  if (toolCall.tool === "none") {
    const newTodos = state.todos.map((t, i) =>
      i === idx
        ? { ...t, status: "completed" as const, result: "无需工具" }
        : t,
    );
    return {
      todos: newTodos,
      currentTaskIndex: idx + 1,
      needsApproval: false,
      approvalMessage: "",
      log: [`[executor] ${todo.title} → 无需工具，标记完成`],
    };
  }

  // 执行工具
  const [arg1, arg2] = toolCall.args || []; // 从args中解析arg1和arg2，其中arg1是文件名，arg2是文件内容
  console.log(
    `[executor] 调用工具：${toolCall.tool}(${[arg1, arg2].filter(Boolean).join(", ")})`,
  );

  if (toolCall.tool === "writeFile") {
    // 对于"创建笔记"这类任务，用 LLM 先生成内容
    const contentPrompt = `请为以下任务生成合适的文件内容：\n${todo.title}\n\n直接输出文件内容，不要解释。`;
    const contentRes = await model.invoke(contentPrompt);
    const content =
      typeof contentRes.content === "string"
        ? contentRes.content
        : JSON.stringify(contentRes.content);

    const r = writeFile(arg1 || "untitled.md", arg2 || content); // arg1 是文件名，arg2 是内容
    const newTodos = state.todos.map((t, i) =>
      i === idx ? { ...t, status: "completed" as const, result: r.message } : t,
    );
    return {
      todos: newTodos,
      currentTaskIndex: idx + 1,
      needsApproval: false,
      approvalMessage: "",
      log: [`[executor] writeFile("${arg1}") → ${r.message}`],
    };
  }

  if (toolCall.tool === "deleteFile") {
    const r = deleteFile(arg1 || ""); //  arg1 是文件名
    if (r.needsApproval) {
      // 需要审批：不标记完成，不推进索引，设置审批状态
      return {
        needsApproval: true,
        approvalMessage: `确认删除文件：${arg1}？`,
        pendingAction: { tool: "deleteFile", filePath: arg1 || "" },
        log: [`[executor] deleteFile("${arg1}") → 等待审批`],
      };
    }
    // 文件不存在，直接完成
    const newTodos = state.todos.map((t, i) =>
      i === idx ? { ...t, status: "completed" as const, result: r.message } : t,
    );
    return {
      todos: newTodos,
      currentTaskIndex: idx + 1,
      needsApproval: false,
      approvalMessage: "",
      log: [`[executor] deleteFile("${arg1}") → ${r.message}`],
    };
  }

  if (toolCall.tool === "listFiles") {
    const r = listFiles();
    const newTodos = state.todos.map((t, i) =>
      i === idx ? { ...t, status: "completed" as const, result: r.message } : t,
    );
    return {
      todos: newTodos,
      currentTaskIndex: idx + 1,
      needsApproval: false,
      approvalMessage: "",
      log: [`[executor] listFiles → 完成`],
    };
  }

  // 未知工具
  const newTodos = state.todos.map((t, i) =>
    i === idx
      ? {
          ...t,
          status: "completed" as const,
          result: `未知工具：${toolCall.tool}`,
        }
      : t,
  );
  return {
    todos: newTodos,
    currentTaskIndex: idx + 1,
    needsApproval: false,
    approvalMessage: "",
    log: [`[executor] 未知工具：${toolCall.tool}`],
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

  // 有待审批的操作 → human_approval
  if (state.needsApproval || state.pendingAction) {
    const todo = state.todos[idx];
    console.log(`[router] 需要审批 → human_approval：${todo?.title}`);
    return "human_approval";
  }

  // 继续执行下一个任务
  const todo = state.todos[idx];
  console.log(`[router] 继续 → executor：${todo?.title}`);
  return "executor";
}

// ================================================================
// 节点 3：HumanApproval —— 使用 interrupt() 暂停等待人类输入
// ================================================================
async function humanApproval(state: typeof AgentState.State) {
  const todo = state.todos[state.currentTaskIndex];
  const action = state.pendingAction;
  const msg = `\n⚠️ 危险操作：${todo?.title}\n   文件：${action?.filePath ?? "未知"}\n   输入"批准"或"拒绝"：`;

  // interrupt() 会暂停图执行，等待外部 Command({ resume: "..." })
  const decision = interrupt({
    question: msg,
    action: action?.tool,
    filePath: action?.filePath,
  });

  console.log(`[approval] 收到决策：${decision}`);

  return {
    needsApproval: false,
    approvalMessage: "",
    log: [`[approval] 用户决策：${decision}`],
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
// addNode：添加节点
// addEdge：添加边
// addConditionalEdges：根据条件添加边（if/eslse）
// END：结束节点
// compile：编译图
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

  .compile({ checkpointer: memorySaver });

// ================================================================
// 运行
// ================================================================
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
}); // 创建一个 readline 接口，用于获取用户输入

function askQuestion(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  const userInput =
    "请帮我完成以下任务：\n" +
    "1. 在工作区创建一个学习笔记 notes.md，内容是关于 LangGraph 的核心概念\n" +
    "2. 删除临时文件 temp.txt（如果存在的话）\n" +
    "3. 生成一份执行报告";

  console.log("========== LangGraph 任务规划 Agent ==========\n");
  console.log("[user]", userInput, "\n");
  console.log("── 开始执行 ──\n");

  // 配置：thread_id 让 LangGraph 知道这是同一个会话
  const config = { configurable: { thread_id: "session-1" } };

  // 第 1 次 invoke：图会跑到 interrupt() 处暂停
  let state = await graph.invoke({ userInput }, config);

  // 检查是否被 interrupt 暂停了
  // LangGraph 1.x: interrupt 后 state 包含 __interrupt__ 字段
  while ((state as Record<string, unknown>).__interrupt__) {
    const interruptData = (state as Record<string, unknown>).__interrupt__ as
      | Array<{ value: { question: string; action: string; filePath: string } }>
      | undefined;

    if (interruptData && interruptData.length > 0) {
      const q = interruptData[0].value;
      console.log(`\n${"=".repeat(50)}`);
      const answer = await askQuestion(q.question);
      console.log(`${"=".repeat(50)}`);

      // 用用户输入恢复执行
      state = await graph.invoke(new Command({ resume: answer }), config);
    } else {
      break;
    }
  }

  console.log("\n[info] 图执行完毕");
  console.log("[info] 查看 workspace/execution-report.md");

  rl.close();
}

main();
