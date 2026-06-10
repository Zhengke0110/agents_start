/**
 * Demo 03：File Agent —— 让 Agent 读写本地文件
 *
 * 核心能力：
 *   Agent 可以把信息存到文件、读取已有文件、列出文件列表，
 *   从而实现"记忆"和"文档处理"等能力。
 *
 * 安全设计（路径沙箱）：
 *   所有文件操作限制在 workspace/ 目录内，
 *   Agent 不能通过 ../ 等方式访问外部文件。
 */

import * as dotenv from "dotenv";
import OpenAI from "openai";
import { toolSchemas, executeTool } from "./tools.js";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL,
});

const MAX_LOOPS = 10;

async function main() {
  const userMessage =
    "请在 workspace 中帮我做三件事：\n" +
    "1. 创建一个文件 journal.md，内容是一段今天学习 Agent 的简单笔记\n" +
    "2. 创建一个文件 todo.txt，列出接下来要学的 3 个 Demo\n" +
    "3. 最后列出 workspace 中的所有文件";

  console.log("========== Demo 03：File Agent ==========\n");
  console.log("[user]", userMessage, "\n");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: "你是一个文件管理助手，可以读写 workspace 中的文件。请用中文回复。" },
    { role: "user", content: userMessage },
  ];

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

      console.log(`  [tool] ${name}(${JSON.stringify(args)})`);
      // 文件内容可能很长，缩略显示
      const preview = result.length > 150 ? result.slice(0, 150) + "..." : result;
      console.log(`         => ${preview}`);

      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    console.log();
  }

  console.log(`[warn] 达到最大循环次数 ${MAX_LOOPS}`);
}

main();
