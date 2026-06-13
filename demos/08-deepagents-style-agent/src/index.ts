/**
 * Demo 08：DeepAgents 风格综合 Agent
 *
 * 融合 6 大能力：
 *   1. Planning（Todo 任务规划）
 *   2. Tools（多工具调用）
 *   3. Filesystem（文件读写）
 *   4. Context Management（长内容卸载到文件）
 *   5. SubAgent（委托子 Agent 处理子任务）
 *   6. Human Approval（危险操作前确认）
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
import { toolSchemas, executeTool } from "./tools.js";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL,
});

const WORKSPACE = path.resolve(
  process.cwd(),
  "demos",
  "08-deepagents-style-agent",
  "workspace",
);

// 上下文管理：当消息数量超过阈值，自动触发 offloadContext
const CONTEXT_THRESHOLD = 15;

async function main() {
  const userMessage =
    "请帮我完成一份完整的 Agent 学习报告，主题是「Agent 开发入门」。\n" +
    "要求：\n" +
    "1. 搜索知识库中关于 Agent 基础概念、工具系统、DeepSeek 模型的资料\n" +
    "2. 用子 Agent 分别做研究分析和报告撰写\n" +
    "3. 最终生成 Markdown 报告，保存到 workspace/agent-learning-report.md\n" +
    "4. 先用 Todo 规划所有步骤";

  console.log("========== Demo 08：DeepAgents 风格 Agent ==========\n");
  console.log(
    "[能力清单] Planning | Tools | Filesystem | Context Mgmt | SubAgent | Human Approval\n",
  );
  console.log("[user]", userMessage, "\n");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "你是 DeepAgents 风格的智能助手，拥有 10 个工具，覆盖 6 大能力。\n" +
        "工作方式：\n" +
        "  1. 复杂任务先规划（createTodo）\n" +
        "  2. 需要分析时用 delegateToSubAgent(researcher) 做研究\n" +
        "  3. 需要撰写时用 delegateToSubAgent(writer) 写内容\n" +
        "  4. 中间结果过长时用 offloadContext 保存到文件\n" +
        "  5. 覆盖文件前用 requestApproval 请求确认\n" +
        "  6. 最终报告用 writeFile 保存\n" +
        "请用中文回复。",
    },
    { role: "user", content: userMessage },
  ];

  const MAX_LOOPS = 25;
  let loopCount = 0;

  const DIVIDER = "=".repeat(60);

  while (loopCount < MAX_LOOPS) {
    loopCount++;

    // 轮次分隔：明显的视觉边界
    console.log(`\n${DIVIDER}`);
    console.log(`>> 第 ${loopCount} 轮 <<`);
    console.log(DIVIDER);

    // 上下文管理：如果消息太多，提醒模型卸载
    if (messages.length > CONTEXT_THRESHOLD) {
      console.log(`[ctx] 消息数 ${messages.length} 超过阈值，建议使用 offloadContext\n`);
    }

    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages,
      tools: toolSchemas,
    });

    const choice = response.choices[0];

    // ---- 模型给出最终回复 ----
    if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls) {
      console.log("[llm] 最终回复：\n");
      console.log(choice.message.content);
      console.log(`\n${DIVIDER}`);
      console.log(`[info] 共 ${loopCount} 轮完成`);
      const files = fs.readdirSync(WORKSPACE);
      console.log(`[info] workspace 最终文件：${files.join(", ")}`);
      return;
    }

    // ---- 模型请求工具 ----
    const toolCount = choice.message.tool_calls.length;
    console.log(`[llm] 本轮要调用 ${toolCount} 个工具\n`);
    messages.push(choice.message);

    for (let i = 0; i < choice.message.tool_calls.length; i++) {
      const tc = choice.message.tool_calls[i];
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments);

      // 按能力分类
      const category = ["createTodo", "updateTodo", "listTodos"].includes(name)
        ? "plan"
        : ["searchDocs"].includes(name) ? "search"
        : ["readFile", "writeFile", "listFiles"].includes(name) ? "file"
        : name === "delegateToSubAgent" ? "subagent"
        : name === "offloadContext" ? "ctx"
        : name === "requestApproval" ? "approval"
        : "tool";

      const result = await executeTool(name, args); // 实际执行

      // 序号 + 分类 + 工具名
      console.log(`  ${i + 1}. [${category}] ${name}`);
      console.log(`     参数: ${JSON.stringify(args)}`);

      // 结果处理：截断长输出，保持可读
      const preview = result.length > 200 ? result.slice(0, 200) + "..." : result;
      const lines = preview.split("\n");
      if (lines.length > 5) {
        // 多行结果只显示前 5 行
        console.log(`     结果: ${lines.slice(0, 5).join("\n           ")}`);
        console.log(`           ... (共 ${result.length} 字符，${lines.length} 行)`);
      } else {
        console.log(`     结果: ${preview}`);
      }

      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  console.log(`[warn] 达到最大循环次数 ${MAX_LOOPS}`);
}

main();
