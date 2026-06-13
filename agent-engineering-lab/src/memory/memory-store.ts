/**
 * 长期记忆模块
 *
 * Agent 的重要信息持久化到 JSON 文件，跨会话保持。
 * 类比：电脑关机后硬盘上的文件还在。
 *
 * 两个操作：
 *   saveMemory(key, value) - 保存一条记忆
 *   loadMemory(key)         - 读取一条记忆
 *   listMemories()          - 列出所有记忆
 */

import * as fs from "fs";
import * as path from "path";

const MEMORY_FILE = path.resolve(
  process.cwd(),
  "workspace",
  "agent-memory.json",
);

/** 读取整个记忆文件 */
function readStore(): Record<string, unknown> {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
    }
  } catch {
    // 文件损坏，重建
  }
  return {};
}

/** 写入整个记忆文件 */
function writeStore(data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * 保存一条记忆
 */
export function saveMemory(key: string, value: string): string {
  const store = readStore();
  store[key] = value;
  store["_lastUpdated"] = new Date().toISOString();
  writeStore(store);
  return `记忆已保存：${key}（${value.length} 字符）`;
}

/**
 * 读取一条记忆
 */
export function loadMemory(key: string): string | null {
  const store = readStore();
  const value = store[key];
  if (value === undefined) return null;
  return String(value);
}

/**
 * 列出所有记忆的 key
 */
export function listMemories(): string[] {
  const store = readStore();
  return Object.keys(store).filter((k) => !k.startsWith("_"));
}

/**
 * 获取记忆摘要（给 Agent 看的）
 */
export function getMemoryContext(): string {
  const keys = listMemories();
  if (keys.length === 0) return "暂无长期记忆。";

  return keys
    .map((k) => {
      const v = loadMemory(k);
      const preview = (v ?? "").slice(0, 120);
      return `  - ${k}: ${preview}${(v ?? "").length > 120 ? "..." : ""}`;
    })
    .join("\n");
}
