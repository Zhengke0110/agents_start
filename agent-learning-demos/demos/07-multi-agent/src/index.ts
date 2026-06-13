/**
 * Demo 07：Multi-Agent —— 多 Agent 协作
 *
 * 三个角色的 Agent，各自有独立的 system prompt：
 *   Researcher - 从知识库查找资料
 *   Writer     - 根据资料撰写报告
 *   Reviewer   - 审核报告是否完整
 *
 * 每个子 Agent 本质上就是一次独立的 LLM 调用，输入不同，输出也不同。
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL,
});

// ---- 知识库材料（加载一次，传给 Researcher 当上下文） ----
const DOCS_DIR = path.resolve(process.cwd(), "demos", "04-rag-agent", "docs");
function loadKnowledgeBase(): string {
  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
  return files
    .map(
      (f) =>
        `=== ${f} ===\n${fs.readFileSync(path.join(DOCS_DIR, f), "utf-8")}`,
    )
    .join("\n\n");
}

// ---- 通用 LLM 调用 ----
async function callLLM(
  systemPrompt: string,
  userMessage: string,
  label: string,
): Promise<string> {
  console.log(`\n  ┌─ [${label}] ─────────────────────`);
  console.log(`  │ system: ${systemPrompt.slice(0, 60)}...`);
  console.log(`  │ user:   ${userMessage.slice(0, 80)}...`);

  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    max_tokens: 2048,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const output = response.choices[0]?.message?.content ?? "(空)";
  console.log(`  │ 输出:   ${output.slice(0, 120)}...`);
  console.log(`  └──────────────────────────────────`);
  return output;
}

// ============================================================
// 子 Agent 1：Researcher —— 查找资料
// ============================================================
async function researcherAgent(
  topic: string,
  knowledge: string,
): Promise<string> {
  return callLLM(
    "你是一名研究员。根据提供的知识库材料，找出与主题最相关的关键信息。" +
      "输出格式：列出关键发现，每条标注来源文档。请用中文。",
    `主题：${topic}\n\n知识库材料：\n${knowledge}`,
    "Researcher",
  );
}

// ============================================================
// 子 Agent 2：Writer —— 撰写报告
// ============================================================
async function writerAgent(
  topic: string,
  researchFindings: string,
): Promise<string> {
  return callLLM(
    "你是一名技术写作者。根据研究员提供的发现，撰写一份结构清晰的 Markdown 报告。" +
      "报告必须包含：标题、摘要、正文（分章节）、总结。请用中文。",
    `主题：${topic}\n\n研究员的发现：\n${researchFindings}`,
    "Writer",
  );
}

// ============================================================
// 子 Agent 3：Reviewer —— 审核报告
// ============================================================
async function reviewerAgent(
  report: string,
  _researchFindings: string,
): Promise<string> {
  return callLLM(
    "你是一名严格的内容审核员。审核这份报告是否满足以下标准：" +
      "1) 有清晰的标题和结构 2) 内容准确、完整 3) 语言通顺。给出 PASS 或 NEEDS_REVISION，说明理由。请用中文。",
    `待审核报告：\n${report}`,
    "Reviewer",
  );
}

// ============================================================
// 主流程（Orchestrator）
// ============================================================
async function main() {
  const topic = "Agent 基础概念与工具系统";

  console.log("========== Demo 07：Multi-Agent ==========\n");
  console.log(`任务主题：${topic}\n`);

  // 1. 加载知识库
  const knowledge = loadKnowledgeBase();
  console.log(`[info] 知识库已加载（${knowledge.length} 字符）`);

  // 2. Researcher 查资料
  console.log("\n── 阶段 1：Researcher 查找资料 ──");
  const findings = await researcherAgent(topic, knowledge);

  // 3. Writer 写报告
  console.log("\n── 阶段 2：Writer 撰写报告 ──");
  const report = await writerAgent(topic, findings);

  // 4. Reviewer 审核
  console.log("\n── 阶段 3：Reviewer 审核 ──");
  const review = await reviewerAgent(report, findings);

  // 5. 汇总输出
  console.log("\n========== 最终输出 ==========\n");

  const finalReport = [
    "# Agent 学习报告",
    "",
    `> 主题：${topic}`,
    `> 协作方式：Researcher → Writer → Reviewer`,
    "",
    "## 研究员（Researcher）的发现",
    "",
    findings,
    "",
    "## 写作者（Writer）的报告",
    "",
    report,
    "",
    "## 审核员（Reviewer）的意见",
    "",
    review,
  ].join("\n");

  console.log(finalReport);

  // 保存报告
  const outDir = path.resolve(
    process.cwd(),
    "demos",
    "07-multi-agent",
    "workspace",
  );
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "multi-agent-report.md"),
    finalReport,
    "utf-8",
  );
  console.log("\n[info] 报告已保存到 workspace/multi-agent-report.md");
}

main();
