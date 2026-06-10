/**
 * Demo 04：RAG Agent —— 本地知识库问答
 *
 * RAG = Retrieval Augmented Generation（检索增强生成）
 *
 * 流程：
 *   用户提问 → 检索器从文档中找到相关片段 → 把片段和问题一起发给模型 → 模型基于文档回答
 *
 * 和普通聊天的区别：
 *   普通聊天：模型只能凭记忆（训练数据）回答
 *   RAG：模型可以"查阅"本地文档，回答更准确，还能引用来源
 */

import * as dotenv from "dotenv";
import OpenAI from "openai";
import { loadDocs, searchDocs } from "./retriever.js";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL,
});

// 唯一的工具：搜索文档
const toolSchemas = [
  {
    type: "function" as const,
    function: {
      name: "searchDocs",
      description:
        "在本地知识库中搜索相关文档内容。传入你的问题，返回最相关的文档片段。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索查询，使用关键词" },
        },
        required: ["query"],
      },
    },
  },
];

function executeTool(name: string, args: Record<string, unknown>): string {
  if (name === "searchDocs") {
    const query = String(args.query ?? "");
    const results = searchDocs(query);

    if (results.length === 0) {
      return "未找到相关文档。请尝试用不同关键词搜索。";
    }

    return results
      .map((r, i) => {
        return `[来源 ${i + 1}：${r.source} - ${r.title}]\n${r.content}`;
      })
      .join("\n\n---\n\n");
  }
  return `未知工具：${name}`;
}

async function main() {
  // 程序启动时加载文档
  loadDocs();

  const userMessage =
    "什么是 Agent？Agent 和普通 LLM 有什么区别？Agent 可以使用哪些类型的工具？";

  console.log("========== Demo 04：RAG Agent ==========\n");
  console.log("[user]", userMessage, "\n");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "你是一个知识库助手。你可以通过 searchDocs 工具搜索本地文档来回答问题。回答时请引用文档来源。请用中文回复。",
    },
    { role: "user", content: userMessage },
  ];

  const MAX_LOOPS = 10;
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
    // console.log("choice===>", choice);
    // console.log("tool_calls===>", choice.message.tool_calls);

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

      console.log(`  [tool] ${name}("${String(args.query)}")`);
      const preview =
        result.length > 200 ? result.slice(0, 200) + "..." : result;
      console.log(`         => ${preview}`);

      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    console.log();
  }

  console.log(`[warn] 达到最大循环次数 ${MAX_LOOPS}`);
}

main();
