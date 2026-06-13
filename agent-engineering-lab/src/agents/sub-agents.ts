/**
 * 子 Agent 模块
 *
 * 主 Agent 可以把复杂子任务委托给专门的子 Agent。
 * 每个子 Agent = 独立的 LLM 调用 + 专用的 system prompt。
 *
 * 两个角色：
 *   researcher - 深度研究分析，输出结构化发现
 *   writer     - 撰写报告/文档，输出完整的 Markdown
 */

import * as dotenv from "dotenv";
dotenv.config();

import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY,
  configuration: { baseURL: process.env.DEEPSEEK_BASE_URL },
});

interface SubAgentResult {
  agentType: string;
  result: string;
  tokenUsage: { prompt: number; completion: number };
}

/**
 * Researcher 子 Agent：深度分析信息
 */
export async function researcherAgent(task: string): Promise<SubAgentResult> {
  console.log(`  [sub:researcher] 启动研究...`);

  const response = await model.invoke([
    {
      role: "system",
      content:
        "你是研究员。根据任务要求进行深度分析，输出结构化的研究发现。" +
        "格式：先列出关键发现（带编号），再给出分析结论。请用中文。",
    },
    { role: "user", content: task },
  ]);

  const content =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  console.log(`  [sub:researcher] 完成（${content.length} 字符）`);

  return {
    agentType: "researcher",
    result: content,
    tokenUsage: {
      prompt: response.usage_metadata?.input_tokens ?? 0,
      completion: response.usage_metadata?.output_tokens ?? 0,
    },
  };
}

/**
 * Writer 子 Agent：撰写文档
 */
export async function writerAgent(task: string): Promise<SubAgentResult> {
  console.log(`  [sub:writer] 启动撰写...`);

  const response = await model.invoke([
    {
      role: "system",
      content:
        "你是技术写作者。根据提供的信息撰写专业文档。" +
        "要求：结构清晰（标题+章节+总结）、Markdown 格式、内容详实。请用中文。",
    },
    { role: "user", content: task },
  ]);

  const content =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  console.log(`  [sub:writer] 完成（${content.length} 字符）`);

  return {
    agentType: "writer",
    result: content,
    tokenUsage: {
      prompt: response.usage_metadata?.input_tokens ?? 0,
      completion: response.usage_metadata?.output_tokens ?? 0,
    },
  };
}

/**
 * 子 Agent 统一入口
 */
export async function runSubAgent(
  agentType: string,
  task: string,
): Promise<SubAgentResult> {
  switch (agentType) {
    case "researcher":
      return researcherAgent(task);
    case "writer":
      return writerAgent(task);
    default:
      return {
        agentType,
        result: `未知的子 Agent 类型：${agentType}。可选：researcher, writer`,
        tokenUsage: { prompt: 0, completion: 0 },
      };
  }
}
