/**
 * 模块 2：DeepAgents 风格 Agent
 *
 * 在 LangGraph 基础上新增三大能力：
 *   1. 子 Agent（delegateToSubAgent）—— 委托专门 Agent 处理复杂任务
 *   2. 上下文管理（offloadContext）—— 长内容卸载到文件
 *   3. 长期记忆（saveMemory / loadMemory）—— 跨会话持久化
 *
 * 图结构（和 task-planner 相同）：
 *   start → planner → executor → router → reporter → END
 *                         ↑          ↑
 *                   子Agent/记忆     human_approval
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
import * as readline from "readline";
import {
  writeFile,
  deleteFile,
  confirmDeleteFile,
  listFiles,
} from "../tools/file-tools.js";
import { runSubAgent } from "../agents/sub-agents.js";
import {
  saveMemory,
  loadMemory,
  listMemories,
  getMemoryContext,
} from "../memory/memory-store.js";

const model = new ChatOpenAI({
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY,
  configuration: { baseURL: process.env.DEEPSEEK_BASE_URL },
});

const WORKSPACE = path.resolve(process.cwd(), "workspace");
fs.mkdirSync(WORKSPACE, { recursive: true });
const memorySaver = new MemorySaver();

// ================================================================
// State（新增 contextSize 追踪）
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
  pendingAction: Annotation<{ tool: string; filePath: string } | null>({
    value: (a, b) => b,
    default: () => null,
  }),
  log: Annotation<string[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  finalReport: Annotation<string>({
    value: (a, b) => b ?? a ?? "",
    default: () => "",
  }),
  // 新增：上下文大小追踪
  contextSize: Annotation<number>({
    value: (a, b) => b ?? a ?? 0,
    default: () => 0,
  }),
});

// ================================================================
// Tool Descriptions（新增子Agent、上下文管理、记忆工具）
// ================================================================
const toolDescriptions = `
可用工具：
- writeFile(filePath, content)：创建或覆盖文件。
- deleteFile(filePath)：删除文件（需要审批）。
- listFiles()：列出 workspace 中的所有文件。

【子 Agent】
- delegateToSubAgent(agentType, task)：委托专门 Agent 处理复杂子任务。
  agentType 可选：researcher（研究分析）、writer（撰写报告）。

【上下文管理】
- offloadContext(label, content)：当内容过长时卸载到文件，释放上下文空间。

【长期记忆】
- saveMemory(key, value)：保存信息到长期记忆（跨会话保持）。
- loadMemory(key)：从长期记忆读取信息。
- listMemories()：列出所有长期记忆。
`;

// ================================================================
// 节点 1：Planner（加入长期记忆上下文）
// ================================================================
async function planner(state: typeof AgentState.State) {
  console.log("\n[planner] 分析任务，生成计划...");

  // 加载长期记忆作为上下文
  const memoryCtx = getMemoryContext();
  const memoryHint =
    memoryCtx !== "暂无长期记忆。"
      ? `\n\n历史记忆（可参考）：\n${memoryCtx}`
      : "";

  const prompt = `你是任务规划助手。把用户任务拆成 3-5 个具体步骤，每行一个。

${memoryHint}

用户任务：${state.userInput}

严格规则：
- 只输出 3-5 行，每行一个步骤
- 不要输出标题、介绍、总结
- 不要生成"生成报告""汇总"步骤
- 格式：步骤描述（不加编号也可以）`;

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
  todos.forEach((t) => console.log(`  ${t.id}. ${t.title}`));

  return { todos, log: [`[planner] 生成 ${todos.length} 个步骤`] };
}

// ================================================================
// 节点 2：Executor（新增子Agent、上下文管理、记忆工具）
// ================================================================
async function executor(state: typeof AgentState.State) {
  const idx = state.currentTaskIndex;
  const todo = state.todos[idx];
  if (!todo) return { log: ["[executor] 无待执行任务"] };

  console.log(`\n[executor] 执行任务 ${todo.id}：${todo.title}`);

  // 路口A：审批后恢复
  if (state.pendingAction) {
    const action = state.pendingAction;
    console.log(`[executor] 执行已审批：${action.tool}("${action.filePath}")`);
    const r =
      action.tool === "deleteFile"
        ? confirmDeleteFile(action.filePath)
        : { success: false, message: "未知" };

    const newTodos = state.todos.map((t, i) =>
      i === idx ? { ...t, status: "completed" as const, result: r.message } : t,
    );
    return {
      todos: newTodos,
      currentTaskIndex: idx + 1,
      needsApproval: false,
      approvalMessage: "",
      pendingAction: null,
      log: [`[executor] 已完成：${todo.title} → ${r.message}`],
    };
  }

  // 路口B：LLM 选工具
  const toolPrompt = `你是工具执行器。选择一个工具执行。

${toolDescriptions}

任务：${todo.title}

返回 JSON：{"tool": "工具名", "args": ["参数1", "参数2"]}
如果不需要工具，返回 {"tool": "none", "reason": "原因"}。只返回 JSON。`;

  const response = await model.invoke(toolPrompt);
  const text =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  console.log(`[executor] LLM 决策：${text.slice(0, 150)}`);

  let toolCall: { tool: string; args: string[] };
  try {
    const m = text.match(/\{[\s\S]*\}/);
    toolCall = m ? JSON.parse(m[0]) : { tool: "none", args: [] };
  } catch {
    toolCall = { tool: "none", args: [] };
  }

  // 出口：none
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
      log: [`[executor] ${todo.title} → 无需工具`],
    };
  }

  const [arg1, arg2] = toolCall.args || [];
  console.log(
    `[executor] 调用：${toolCall.tool}(${[arg1, arg2].filter(Boolean).join(", ")})`,
  );

  // 出口：writeFile
  if (toolCall.tool === "writeFile") {
    // 收集所有已完成任务的输出作为素材
    const allResults = state.todos
      .filter(
        (t) => t.status === "completed" && t.result && t.result.length > 30,
      )
      .map((t) => t.result)
      .join("\n\n");
    const contentPrompt = allResults
      ? `基于以下素材，整理成完整的文件内容：\n\n${allResults.slice(0, 1000)}\n\n直接输出。`
      : `请为此任务生成文件内容：\n${todo.title}\n\n直接输出。`;
    const cr = await model.invoke(contentPrompt);
    const content =
      typeof cr.content === "string" ? cr.content : JSON.stringify(cr.content);
    // 去掉路径中多余的 workspace/ 前缀
    const cleanPath = (arg1 || "untitled.md").replace(/^workspace[/\\]/, "");
    const r = writeFile(cleanPath, arg2 || content);
    const newTodos = state.todos.map((t, i) =>
      i === idx ? { ...t, status: "completed" as const, result: r.message } : t,
    );
    return {
      todos: newTodos,
      currentTaskIndex: idx + 1,
      needsApproval: false,
      approvalMessage: "",
      log: [`[executor] writeFile("${arg1}") → ${r.message}`],
      contextSize: state.contextSize + content.length,
    };
  }

  // 出口：deleteFile
  if (toolCall.tool === "deleteFile") {
    const r = deleteFile(arg1 || "");
    if (r.needsApproval) {
      return {
        needsApproval: true,
        approvalMessage: `确认删除：${arg1}？`,
        pendingAction: { tool: "deleteFile", filePath: arg1 || "" },
        log: [`[executor] deleteFile("${arg1}") → 等待审批`],
      };
    }
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

  // 出口：listFiles
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

  // ====== 新增出口：子 Agent ======
  if (toolCall.tool === "delegateToSubAgent") {
    const agentType = arg1 || "researcher";
    const task = arg2 || todo.title;
    const result = await runSubAgent(agentType, task); // 调用子 Agent
    const summary = `[${result.agentType}] ${result.result}`;
    const newTodos = state.todos.map((t, i) =>
      i === idx ? { ...t, status: "completed" as const, result: summary } : t,
    );
    return {
      todos: newTodos,
      currentTaskIndex: idx + 1,
      needsApproval: false,
      approvalMessage: "",
      log: [
        `[executor] delegateToSubAgent(${agentType}) → ${result.result.length} 字符`,
      ],
      contextSize: state.contextSize + result.result.length,
    };
  }

  // ====== 新增出口：上下文管理 ======
  if (toolCall.tool === "offloadContext") {
    const label = (arg1 || "context").replace(/[^a-zA-Z0-9一-龥]/g, "_");
    const content = arg2 || "无内容";
    const filename = `ctx-${label}.md`;
    const target = path.resolve(WORKSPACE, filename);
    fs.writeFileSync(target, content, "utf-8");
    const newTodos = state.todos.map((t, i) =>
      i === idx
        ? { ...t, status: "completed" as const, result: `已卸载到 ${filename}` }
        : t,
    );
    return {
      todos: newTodos,
      currentTaskIndex: idx + 1,
      needsApproval: false,
      approvalMessage: "",
      log: [
        `[executor] offloadContext → ${filename}（${content.length} 字符已卸载）`,
      ],
      contextSize: Math.max(0, state.contextSize - content.length), // 释放空间
    };
  }

  // ====== 新增出口：长期记忆 ======
  if (toolCall.tool === "saveMemory") {
    // 用前面已完成任务的真实结果作为记忆内容
    const prevResults = state.todos
      .filter(
        (t) => t.status === "completed" && t.result && t.result.length > 50,
      )
      .map((t) => t.result)
      .join("\n---\n");
    const key = arg1 && arg1 !== "key" ? arg1 : `task-${idx}-finding`;
    // 始终优先用真实累积结果
    const value = prevResults.slice(0, 800) || arg2 || todo.title;
    const r = saveMemory(key, value);
    const newTodos = state.todos.map((t, i) =>
      i === idx ? { ...t, status: "completed" as const, result: r } : t,
    );
    return {
      todos: newTodos,
      currentTaskIndex: idx + 1,
      needsApproval: false,
      approvalMessage: "",
      log: [`[executor] saveMemory("${key}") → ${r}`],
    };
  }

  if (toolCall.tool === "loadMemory") {
    const value = loadMemory(arg1 || "");
    const result = value ?? "未找到该记忆";
    const newTodos = state.todos.map((t, i) =>
      i === idx ? { ...t, status: "completed" as const, result } : t,
    );
    return {
      todos: newTodos,
      currentTaskIndex: idx + 1,
      needsApproval: false,
      approvalMessage: "",
      log: [`[executor] loadMemory("${arg1}") → ${result.slice(0, 100)}`],
    };
  }

  if (toolCall.tool === "listMemories") {
    const keys = listMemories();
    const newTodos = state.todos.map((t, i) =>
      i === idx
        ? {
            ...t,
            status: "completed" as const,
            result: keys.join(", ") || "空",
          }
        : t,
    );
    return {
      todos: newTodos,
      currentTaskIndex: idx + 1,
      needsApproval: false,
      approvalMessage: "",
      log: [`[executor] listMemories → ${keys.length} 条记忆`],
    };
  }

  // 未知工具
  const newTodos = state.todos.map((t, i) =>
    i === idx
      ? { ...t, status: "completed" as const, result: `未知：${toolCall.tool}` }
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
// Router & Nodes（和 task-planner 相同）
// ================================================================
function router(state: typeof AgentState.State): string {
  if (state.currentTaskIndex >= state.todos.length) return "reporter";
  if (state.needsApproval || state.pendingAction) return "human_approval";
  return "executor";
}

async function humanApproval(state: typeof AgentState.State) {
  const todo = state.todos[state.currentTaskIndex];
  const action = state.pendingAction;
  const msg = `\n⚠️  危险操作：${todo?.title}\n   文件：${action?.filePath ?? "未知"}\n   输入"批准"或"拒绝"：`;
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

async function reporter(state: typeof AgentState.State) {
  console.log("\n[reporter] 生成执行报告...");
  const completed = state.todos.filter((t) => t.status === "completed");
  const reportPath = path.join(WORKSPACE, "execution-report.md");

  const lines = [
    "# DeepAgents 执行报告",
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
    "",
    `上下文用量：${state.contextSize} 字符`,
  ];

  fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");
  console.log(`[reporter] 报告已保存`);

  // 自动保存执行总结到长期记忆
  saveMemory(
    "lastExecution",
    `完成 ${completed.length} 个任务：${completed.map((t) => t.title).join("；")}`,
  );

  return {
    finalReport: lines.join("\n"),
    log: ["[reporter] 报告已生成，记忆已保存"],
  };
}

// ================================================================
// 构建图
// ================================================================
const graph = new StateGraph(AgentState)
  // ── 第 1 步：注册节点 ──
  .addNode("planner", planner)
  .addNode("executor", executor)
  .addNode("human_approval", humanApproval)
  .addNode("reporter", reporter)
  // ── 第 2 步：连线 ──
  .addEdge("__start__", "planner")                                    // 入口 → planner
  .addEdge("planner", "executor")                                     // planner → executor（固定）
  .addConditionalEdges("executor", router, {                          // executor → 岔道
    executor: "executor",                                             //   → 回去干活
    human_approval: "human_approval",                                 //   → 暂停审批
    reporter: "reporter",                                             //   → 生成报告
  })
  .addEdge("human_approval", "executor")                              // 审批完 → 回去干活
  .addEdge("reporter", END)                                           // 报告完 → 结束
  .compile({ checkpointer: memorySaver });

// ================================================================
// 运行
// ================================================================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const askQuestion = (q: string) =>
  new Promise<string>((r) => rl.question(q, r));

async function main() {
  const userInput =
    "请帮我完成一份 Agent 开发学习总结：\n" +
    "1. 用 researcher 子 Agent 分析 Agent 开发的核心要点\n" +
    "2. 用 writer 子 Agent 根据研究结果撰写学习笔记\n" +
    "3. 把学习笔记保存到 workspace/agent-study-notes.md\n" +
    "4. 把关键发现存入长期记忆";

  console.log("========== DeepAgents 风格 Agent ==========\n");
  console.log("[能力] 子Agent | 上下文管理 | 长期记忆\n");
  console.log("[user]", userInput, "\n── 开始执行 ──\n");

  const config = { configurable: { thread_id: "deepagents-session" } };
  let state = await graph.invoke({ userInput }, config);

  while ((state as Record<string, unknown>).__interrupt__) {
    const data = (state as Record<string, unknown>).__interrupt__ as
      | Array<{ value: { question: string } }>
      | undefined;
    if (data?.[0]?.value?.question) {
      console.log(`\n${"=".repeat(50)}`);
      const answer = await askQuestion(data[0].value.question);
      console.log(`${"=".repeat(50)}`);
      state = await graph.invoke(new Command({ resume: answer }), config);
    } else break;
  }

  console.log("\n[info] 图执行完毕");
  console.log("[info] 查看 workspace/execution-report.md 和 agent-memory.json");
  rl.close();
}

main();
