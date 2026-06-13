/**
 * Demo 01：Tool Calling —— 让模型学会使用工具
 *
 * 核心区别：
 * - Demo 00（纯聊天）：模型只能用自己训练时学到的知识回答
 * - Demo 01（工具调用）：模型可以"调用函数"来获取实时信息或执行计算
 *
 * 流程：
 *   用户提问 → 模型判断是否需要工具 → 如需则调用工具 → 把结果还给模型 → 最终回复
 */

import * as dotenv from "dotenv";
import OpenAI from "openai";
import { toolSchemas, toolRegistry } from "./tools.js";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL,
});

async function main() {
  const userMessage = "北京今天天气怎么样？另外帮我算一下 365 × 24 等于多少。";

  console.log("========== Demo 01：Tool Calling ==========\n");
  console.log("[user] 提问：", userMessage, "\n");

  // 消息列表：system 设定 + user 提问
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "你是一个有用的助手，可以使用工具来回答问题。请用中文回复。",
    },
    { role: "user", content: userMessage },
  ];

  try {
    // ---------- 第 1 轮：模型决定要不要调用工具 ----------
    console.log("── 第 1 轮：发送给模型，附带工具列表 ──\n");

    const response1 = await client.chat.completions.create({
      model: "deepseek-chat",
      messages,
      tools: toolSchemas, // 关键！告诉模型有哪些工具可用
    });

    const choice = response1.choices[0];
    const hasToolCalls =
      choice.finish_reason === "tool_calls" && choice.message.tool_calls;

    if (!hasToolCalls) {
      // 模型直接回答了，没用工具
      console.log("[llm] 模型直接回复（未使用工具）：", choice.message.content);
      return;
    }

    // ---------- 第 2 步：执行工具 ----------
    console.log("[llm] 模型决定调用工具！\n");

    // 把模型的回复（包含工具调用请求）加入消息历史
    messages.push(choice.message);

    for (const toolCall of choice.message.tool_calls!) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

      console.log(`  [tool] 调用工具：${toolName}`);
      console.log(`     参数：${JSON.stringify(toolArgs)}`);

      // 真正执行工具函数
      const toolResult = toolRegistry[toolName](toolArgs);
      console.log(`     结果：${toolResult}\n`);

      // 把工具执行结果加入消息历史
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }

    // ---------- 第 3 轮：把工具结果还给模型，让它生成最终回复 ----------
    console.log("── 第 2 轮：把工具结果还给模型 ──\n");

    const response2 = await client.chat.completions.create({
      model: "deepseek-chat",
      messages,
    });

    console.log(
      "[llm] 最终回复：",
      response2.choices[0]?.message?.content ?? "(空)",
    );
    console.log("\n[usage] 两轮 Token 合计：");
    console.log(`   输入：${response2.usage?.prompt_tokens ?? 0}`);
    console.log(`   输出：${response2.usage?.completion_tokens ?? 0}`);
  } catch (error) {
    console.error("[error] 调用失败：", error);
  }
}

main();
