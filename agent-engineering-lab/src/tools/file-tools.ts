/**
 * 文件工具模块
 *
 * 三个工具 + 安全沙箱：
 *   writeFile  - 创建/覆盖文件
 *   deleteFile - 删除文件（危险操作，会标记 needsApproval）
 *   listFiles  - 列出文件
 *
 * 安全：所有操作限制在 workspace/ 目录内
 */

import * as fs from "fs";
import * as path from "path";

const WORKSPACE = path.resolve(process.cwd(), "workspace");

// 确保 workspace 存在
fs.mkdirSync(WORKSPACE, { recursive: true });

/** 安全校验：防止路径逃逸 */
function safePath(filePath: string): string {
  const resolved = path.resolve(WORKSPACE, filePath);
  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error(`安全限制：禁止访问外部路径 → ${filePath}`);
  }
  return resolved;
}

// ================================================================
// 工具函数
// ================================================================

export interface ToolResult {
  success: boolean;
  message: string;
  needsApproval?: boolean;
}

/** 写入文件 */
export function writeFile(filePath: string, content: string): ToolResult {
  const target = safePath(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
  return {
    success: true,
    message: `文件已写入：${filePath}（${content.length} 字符）`,
  };
}

/** 删除文件（危险操作） */
export function deleteFile(filePath: string): ToolResult {
  const target = safePath(filePath);

  if (!fs.existsSync(target)) {
    return {
      success: true,
      message: `文件不存在，无需删除：${filePath}`,
    };
  }

  // 返回 needsApproval 标记，让调用方处理审批
  return {
    success: false,
    message: `即将删除文件：${filePath}（${fs.statSync(target).size} 字节）`,
    needsApproval: true,
  };
}

/** 确认删除（审批通过后调用） */
export function confirmDeleteFile(filePath: string): ToolResult {
  const target = safePath(filePath);
  if (!fs.existsSync(target)) {
    return { success: true, message: "文件已不存在" };
  }
  fs.unlinkSync(target);
  return { success: true, message: `文件已删除：${filePath}` };
}

/** 列出文件 */
export function listFiles(): ToolResult {
  const items = fs.readdirSync(WORKSPACE, { withFileTypes: true });
  const lines = items.map((i) => {
    const stats = fs.statSync(path.join(WORKSPACE, i.name));
    const size = stats.size > 1024 ? `${(stats.size / 1024).toFixed(1)}KB` : `${stats.size}B`;
    return `  ${i.name}${i.isDirectory() ? "/" : ""} (${size})`;
  });
  return {
    success: true,
    message: lines.length > 0 ? `workspace 文件列表：\n${lines.join("\n")}` : "workspace 为空",
  };
}

// ================================================================
// 工具注册表
// ================================================================

export const toolRegistry: Record<string, (...args: string[]) => ToolResult> = {
  writeFile: (filePath: string, content: string) => writeFile(filePath, content),
  deleteFile: (filePath: string) => deleteFile(filePath),
  listFiles: () => listFiles(),
};

/** 工具 Schema（发给 LLM 判断用哪个工具） */
export const toolDescriptions = `
可用工具：
- writeFile(filePath, content)：创建或覆盖文件。filePath 是相对于 workspace 的路径。
- deleteFile(filePath)：删除 workspace 中的文件。此操作需要人工审批。
- listFiles()：列出 workspace 中的所有文件。
`;
