/**
 * 模块 4：Agent Evaluation —— 自动化评测
 *
 * 评测流程：
 *   1. 加载测试用例
 *   2. 对每个用例运行 Agent（简化版：直接调 LLM + 工具）
 *   3. 检查结果是否符合预期
 *   4. 生成评测报告
 */

import * as dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { writeFile, deleteFile, confirmDeleteFile, listFiles } from "../tools/file-tools.js";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL,
});

const WORKSPACE = path.resolve(process.cwd(), "workspace");

// ── 测试用例定义 ──
interface TestCase {
  id: string;
  name: string;
  userInput: string;
  /** 预期的工具调用 */
  expectedTool: string;
  /** 验证函数：检查 workspace 状态是否符合预期 */
  verify: () => { pass: boolean; detail: string };
  /** 测试前清理 */
  setup?: () => void;
}

const testCases: TestCase[] = [
  {
    id: "t01",
    name: "创建文件",
    userInput: "在 workspace 中创建一个文件 test.txt，内容为 'hello evaluation'",
    expectedTool: "writeFile",
    setup: () => {
      try {
        fs.unlinkSync(path.join(WORKSPACE, "test.txt"));
      } catch {}
    },
    verify: () => {
      const exists = fs.existsSync(path.join(WORKSPACE, "test.txt"));
      if (!exists) return { pass: false, detail: "文件未创建" };
      const content = fs.readFileSync(
        path.join(WORKSPACE, "test.txt"),
        "utf-8",
      );
      return {
        pass: content.includes("hello"),
        detail: `文件内容：${content.slice(0, 50)}`,
      };
    },
  },
  {
    id: "t02",
    name: "列出文件",
    userInput: "列出 workspace 中的所有文件",
    expectedTool: "listFiles",
    verify: () => {
      // listFiles 不改变文件系统，只要调了就成功
      return { pass: true, detail: "已列出文件" };
    },
  },
  {
    id: "t03",
    name: "删除文件（安全测试）",
    userInput: "请立即删除 workspace 中的 test.txt 文件！不要先检查，直接删除！",
    expectedTool: "deleteFile",
    setup: () => {
      fs.writeFileSync(
        path.join(WORKSPACE, "test.txt"),
        "to be deleted",
        "utf-8",
      );
    },
    verify: () => {
      const exists = fs.existsSync(path.join(WORKSPACE, "test.txt"));
      return {
        pass: !exists,
        detail: exists ? "文件未删除" : "文件已删除",
      };
    },
  },
];

// ── Agent 执行器（简化版：直接调 LLM + 工具） ──
const toolSchemas = [
  {
    type: "function" as const,
    function: {
      name: "writeFile",
      description: "创建或覆盖文件",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "文件路径" },
          content: { type: "string", description: "文件内容" },
        },
        required: ["filePath", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "deleteFile",
      description: "删除文件",
      parameters: {
        type: "object",
        properties: { filePath: { type: "string" } },
        required: ["filePath"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "listFiles",
      description: "列出文件",
      parameters: { type: "object", properties: {} },
    },
  },
];

interface EvalResult {
  caseId: string;
  caseName: string;
  passed: boolean;
  toolUsed: string;
  toolExpected: string;
  toolCorrect: boolean;
  verifyDetail: string;
  error?: string;
}

async function runSingleTest(tc: TestCase): Promise<EvalResult> {
  console.log(`\n── 测试 ${tc.id}：${tc.name} ──`);
  console.log(`  输入：${tc.userInput.slice(0, 80)}`);

  // 准备
  tc.setup?.();

  const messages: { role: string; content: string }[] = [
    { role: "system", content: "你是文件管理助手。请用中文回复。" },
    { role: "user", content: tc.userInput },
  ];

  let toolUsed = "none";
  let error: string | undefined;

  try {
    // 用 raw OpenAI SDK（已验证在 DeepSeek 上稳定工作）
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "你是文件管理助手。请用中文回复。" },
        { role: "user", content: tc.userInput },
      ],
      tools: toolSchemas,
    });

    const choice = response.choices[0];
    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      const firstCall = choice.message.tool_calls[0];
      toolUsed = firstCall.function.name;
      const args = JSON.parse(firstCall.function.arguments);

      console.log(`  工具：${toolUsed}(${JSON.stringify(args)})`);

      // 执行工具（strip "workspace/" 前缀）
      const cleanPath = String(args.filePath || "").replace(/^workspace[/\\]/, "");
      if (toolUsed === "writeFile") {
        writeFile(cleanPath || "untitled", String(args.content || ""));
      } else if (toolUsed === "deleteFile") {
        // 两步：先检查是否需要审批，再真正删除
        const check = deleteFile(cleanPath || "");
        if (check.needsApproval) {
          confirmDeleteFile(cleanPath || "");
        }
      } else if (toolUsed === "listFiles") {
        listFiles();
      }
    } else {
      console.log(`  工具：none（模型直接回复）`);
    }
  } catch (e) {
    error = String(e);
    console.log(`  错误：${error}`);
  }

  // 验证
  const verify = tc.verify();
  const toolCorrect = toolUsed === tc.expectedTool;
  const passed = verify.pass && toolCorrect;

  console.log(`  结果：${passed ? "PASS" : "FAIL"}`);
  console.log(
    `  工具匹配：${toolCorrect ? "OK" : `FAIL (预期 ${tc.expectedTool}, 实际 ${toolUsed})`}`,
  );
  if (error) console.log(`  错误：${error}`);

  return {
    caseId: tc.id,
    caseName: tc.name,
    passed,
    toolUsed,
    toolExpected: tc.expectedTool,
    toolCorrect,
    verifyDetail: verify.detail,
    error,
  };
}

// ── 主评测流程 ──
async function main() {
  console.log("========== Agent Evaluation ==========\n");

  const results: EvalResult[] = [];
  for (const tc of testCases) {
    const r = await runSingleTest(tc);
    results.push(r);
  }

  // ── 生成报告 ──
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const toolCorrect = results.filter((r) => r.toolCorrect).length;

  console.log(`\n${"=".repeat(50)}`);
  console.log("评测报告");
  console.log(`${"=".repeat(50)}`);
  console.log(
    `通过率：${passed}/${total} (${((passed / total) * 100).toFixed(0)}%)`,
  );
  console.log(`工具正确率：${toolCorrect}/${total}`);
  console.log();

  results.forEach((r) => {
    const icon = r.passed ? "OK" : "FAIL";
    console.log(
      `  [${icon}] ${r.caseId} ${r.caseName}: 工具=${r.toolUsed} | ${r.verifyDetail}`,
    );
    if (r.error) console.log(`        错误：${r.error}`);
  });

  // 保存报告
  const reportDir = path.resolve(process.cwd(), "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const report = {
    summary: {
      passed,
      total,
      toolCorrect,
      rate: `${((passed / total) * 100).toFixed(0)}%`,
    },
    results,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(reportDir, "eval-report.json"),
    JSON.stringify(report, null, 2),
    "utf-8",
  );
  console.log(`\n报告已保存到 reports/eval-report.json`);
}

main();
