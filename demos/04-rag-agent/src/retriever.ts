/**
 * Demo 04 简易检索器
 *
 * 用关键词匹配实现文档检索。
 * 这是 RAG 的最简实现——不需要向量数据库，适合新手理解。
 * 后续升级方向：embedding + 向量相似度搜索。
 */

import * as fs from "fs";
import * as path from "path";

const DOCS_DIR = path.resolve(process.cwd(), "demos", "04-rag-agent", "docs");

// 文档块：一段文档内容 + 来源信息
interface Chunk {
  content: string;   // 文本内容
  source: string;    // 来源文件名
  title: string;     // 段落标题
}

let chunks: Chunk[] = [];

/**
 * 加载所有文档，按 ## 标题拆分成 chunk
 */
export function loadDocs(): void {
  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
  chunks = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(DOCS_DIR, file), "utf-8");
    // 按 ## 标题拆分（最简拆分方式）
    const sections = raw.split(/\n## /);
    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;

      // 第一行是标题
      const lines = trimmed.split("\n");
      const title = lines[0].replace(/^## /, "").trim();
      const content = lines.join("\n");

      chunks.push({ content, source: file, title });
    }
  }

  console.log(`[retriever] 已加载 ${files.length} 个文档，共 ${chunks.length} 个片段\n`);
}

/**
 * 关键词检索：根据查询词匹配最相关的 chunk
 * 返回 Top-3 最相关的结果
 */
export function searchDocs(query: string, topK: number = 3): Chunk[] {
  // 把查询拆成关键词
  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);

  // 为每个 chunk 打分：关键词出现次数
  const scored = chunks.map((chunk) => {
    const lower = chunk.content.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      // 全局匹配，每次出现 +1 分
      const matches = lower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
      if (matches) score += matches.length;
    }
    return { chunk, score };
  });

  // 按分数排序，取 topK
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}
