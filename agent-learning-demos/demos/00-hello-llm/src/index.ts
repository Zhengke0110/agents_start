/**
 * Demo 00：Hello LLM —— 第一次用代码调用大模型
 *
 * 核心概念：
 * - LLM 调用 = 通过网络把文字发给模型，然后取回回复
 * - API Key = 你的身份凭证（收费依据）
 * - Message = 对话记录，每条有 role（谁说的）+ content（说了什么）
 *   - system：给模型设定规则
 *   - user：你发的消息
 *   - assistant：模型回复的消息
 */

import * as dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL,
});

async function main() {
  const userMessage =
    "你好！我是 PC，正在学习 Agent 开发。请用一句话鼓励我开始这段学习旅程。";

  console.log("========== Demo 00：Hello LLM ==========\n");
  console.log("[user]我发送的话：", userMessage, "\n");

  try {
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content: "你是一个热情、简洁的编程导师。请用中文回复。",
        },
        { role: "user", content: userMessage },
      ],
    });

    const reply = response.choices[0]?.message?.content ?? "(空)";

    console.log("[llm]模型回复：", reply);
    const u = response.usage;
    console.log("\n[usage] Token 使用详情：");
    console.log(
      `   prompt_tokens     (输入) = ${u?.prompt_tokens ?? "?"}  ← 你发送给模型的内容`,
    );
    console.log(
      `   completion_tokens (输出) = ${u?.completion_tokens ?? "?"}  ← 模型回复的内容`,
    );
    console.log(
      `   total_tokens      (合计) = ${u?.total_tokens ?? "?"}  ← 输入 + 输出`,
    );

    // 简单费用估算（deepseek-chat 参考价：输入 ¥2/百万tokens，输出 ¥8/百万tokens）
    if (u?.prompt_tokens && u?.completion_tokens) {
      const cost =
        (u.prompt_tokens / 1_000_000) * 2 +
        (u.completion_tokens / 1_000_000) * 8;
      console.log(`   [cost] 预估费用：约 ¥${cost.toFixed(6)} 元`);
    }
  } catch (error) {
    console.error("[error] 调用失败！请检查：");
    console.error("  1. .env 文件是否存在且包含 DEEPSEEK_API_KEY");
    console.error("  2. API Key 是否有效且余额充足");
    console.error("\n原始错误：", error);
  }
}

main();
