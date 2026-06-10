/**
 * Demo 02：Simple Agent Loop —— 手写 Agent 循环
 *
 * 核心理念（ReAct = Reasoning + Acting）：
 *   while (模型没给出最终答案) {
 *     模型思考 → 如果需要工具就调用 → 把结果还给模型 → 继续循环
 *   }
 *
 * 和 Demo 01 的区别：
 *   Demo 01 是硬编码的 2 轮（调工具 → 总结），模型只能调一次工具
 *   Demo 02 是真正的循环，模型可以调 0 次、1 次、N 次工具，直到满意为止
 */

import * as dotenv from "dotenv";
import OpenAI from "openai";
import { toolSchemas, executeTool } from "./tools.js";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL,
});

// 最大循环次数：防止模型"卡住"无限循环
const MAX_LOOPS = 10;

async function main() {
  const userMessage = "先查一下北京和上海的天气，然后算出这两天气温差。现在几点了？";

  console.log("========== Demo 02：Simple Agent Loop ==========\n");
  console.log("[user]", userMessage, "\n");

  // 消息历史：记录整段对话（包括工具调用），模型需要完整上下文
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: "你是一个有用的助手，可以使用工具。请用中文回复。" },
    { role: "user", content: userMessage },
  ];

  let loopCount = 0;

  // =====================================================
  // Agent Loop 核心：循环直到模型给出最终答案
  // =====================================================
  while (loopCount < MAX_LOOPS) {
    loopCount++;
    console.log(`── 第 ${loopCount} 轮 ──`);

    // ① 发送消息给模型（带上工具列表）
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages,
      tools: toolSchemas,
    });

    const choice = response.choices[0];

    // ② 判断模型是想调工具，还是直接回复
    const wantsTool =
      choice.finish_reason === "tool_calls" && choice.message.tool_calls;

    if (!wantsTool) {
      // 模型没有请求工具 → 说明它认为答案已经够了，这是最终回复
      console.log("[llm] 最终回复：");
      console.log(choice.message.content);
      console.log(`\n[info] 共 ${loopCount} 轮完成`);
      return; // ← 循环结束！
    }

    // ③ 模型请求调用工具 → 执行每个工具
    console.log(`[llm] 请求调用 ${choice.message.tool_calls!.length} 个工具：`);

    // 先把模型的工具调用请求加入历史
    messages.push(choice.message);

    for (const tc of choice.message.tool_calls!) {
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments);
      const result = executeTool(name, args);

      console.log(`  [tool] ${name}(${JSON.stringify(args)}) => ${result}`);

      // 把工具执行结果加入历史
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }

    console.log(); // 空行分隔
  }

  // 循环超限（极端情况）
  console.log(`[warn] 达到最大循环次数 ${MAX_LOOPS}，强制结束`);
}

main();
