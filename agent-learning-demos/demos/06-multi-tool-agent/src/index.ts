/**
 * Demo 06：Multi-tool Agent —— 多工具协作
 *
 * 核心：Agent 在一个任务中组合使用不同类型的工具。
 * 本 Demo 集成了 6 个工具（搜索 / 写文件 / 列文件 / 创建任务 / 更新任务 / 列任务）。
 */

import * as dotenv from "dotenv";
import OpenAI from "openai";
import { toolSchemas, executeTool } from "./tools.js";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL,
});

async function main() {
  const userMessage =
    "请帮我完成一份学习报告：\n" +
    "1. 先搜索知识库，找到关于 Agent 基础概念和工具系统的资料\n" +
    "2. 把搜索到的内容整理成一份 Markdown 笔记\n" +
    "3. 保存到 workspace/agent-learning-report.md\n" +
    "请先用 Todo 规划步骤，再逐步执行。";

  console.log("========== Demo 06：Multi-tool Agent ==========\n");
  console.log("[user]", userMessage, "\n");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "你是一个全能助手，拥有 6 个工具。处理复杂任务时必须先规划（createTodo），再逐步执行（updateTodo），" +
        "过程中可以搜索知识库（searchDocs）和写文件（writeFile）。请用中文回复。",
    },
    { role: "user", content: userMessage },
  ];

  const MAX_LOOPS = 20;
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
      return;
    }

    console.log(`[llm] 请求调用 ${choice.message.tool_calls.length} 个工具：`);
    messages.push(choice.message);

    for (const tc of choice.message.tool_calls) {
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments);
      const result = executeTool(name, args);

      // 根据工具类型显示不同格式
      const icon =
        name === "searchDocs" ? "[search]" :
        name === "writeFile" ? "[write]" :
        name === "createTodo" || name === "updateTodo" || name === "listTodos" ? "[todo]" :
        "[tool]";
      console.log(`  ${icon} ${name}(${JSON.stringify(args)})`);
      const preview = result.length > 180 ? result.slice(0, 180) + "..." : result;
      console.log(`         => ${preview.replace(/\n/g, "\n            ")}`);

      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    console.log();
  }

  console.log(`[warn] 达到最大循环次数 ${MAX_LOOPS}`);
}

main();
