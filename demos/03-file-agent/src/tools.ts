/**
 * Demo 03 文件系统工具
 *
 * 安全原则（路径沙箱）：
 *   所有文件操作只能发生在 workspace 目录内，
 *   防止 Agent 读取或破坏项目其他文件。
 */

import * as fs from "fs";
import * as path from "path";

// workspace 的绝对路径 —— 文件操作的"边界"
const WORKSPACE = path.resolve(
  process.cwd(),
  "demos",
  "03-file-agent",
  "workspace",
);

// 确保 workspace 目录存在
fs.mkdirSync(WORKSPACE, { recursive: true });

/**
 * 安全校验：确保目标路径在 workspace 内
 * 防止 Agent 通过 ../../ 等方式逃逸到外部
 */
function safePath(filePath: string): string {
  const resolved = path.resolve(WORKSPACE, filePath);
  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error(`安全限制：禁止访问 workspace 外的路径 → ${filePath}`);
  }
  return resolved;
}

// ============================================================
// 工具 Schema
// ============================================================
export const toolSchemas = [
  {
    type: "function" as const,
    function: {
      name: "listFiles",
      description: "列出 workspace 目录中的所有文件",
      parameters: {
        type: "object",
        properties: {
          subdir: { type: "string", description: "子目录名，不传则列根目录" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "readFile",
      description: "读取 workspace 中指定文件的内容",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "相对于 workspace 的文件路径，如 note.txt",
          },
        },
        required: ["filePath"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "writeFile",
      description:
        "将内容写入 workspace 中的文件。如果目标文件已存在会先检查并提示。",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "相对于 workspace 的文件路径，如 note.txt",
          },
          content: { type: "string", description: "要写入的内容" },
        },
        required: ["filePath", "content"],
      },
    },
  },
];

// ============================================================
// 工具执行
// ============================================================
export function executeTool(
  name: string,
  args: Record<string, unknown>,
): string {
  switch (name) {
    // ---- 列出文件 ----
    case "listFiles": {
      const subdir = String(args.subdir || ".");
      const target = safePath(subdir);
      if (!fs.existsSync(target)) return `目录不存在：${subdir}`;

      const items = fs.readdirSync(target, { withFileTypes: true });
      const lines = items.map((i) => {
        const marker = i.isDirectory() ? "/" : "";
        return `  ${i.name}${marker}`;
      });
      return lines.length > 0
        ? `workspace/${subdir === "." ? "" : subdir} 中的文件：\n${lines.join("\n")}`
        : `workspace/${subdir} 是空的`;
    }

    // ---- 读取文件 ----
    case "readFile": {
      const filePath = String(args.filePath ?? "");
      const target = safePath(filePath);
      if (!fs.existsSync(target)) return `文件不存在：${filePath}`;
      const content = fs.readFileSync(target, "utf-8");
      return `--- ${filePath} ---\n${content}\n--- 文件结尾 ---`;
    }

    // ---- 写入文件 ----
    case "writeFile": {
      const filePath = String(args.filePath ?? "");
      const content = String(args.content ?? "");
      const target = safePath(filePath);

      // 安全检查：如果文件已存在，提示而不是直接覆盖
      if (fs.existsSync(target)) {
        const existing = fs.readFileSync(target, "utf-8");
        return (
          `警告：文件 "${filePath}" 已存在！当前内容：\n` +
          `--- 现有内容 ---\n${existing}\n--- 内容结尾 ---\n` +
          `如果你要覆盖，请再次调用 writeFile 并设置 overwrite: true`
        );
      }

      // 确保父目录存在
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf-8");
      return `文件已写入：${filePath}（${content.length} 个字符）`;
    }

    default:
      return `未知工具：${name}`;
  }
}
