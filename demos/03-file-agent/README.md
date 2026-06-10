# Demo 03：File Agent 本地文件助手

## 学习目标

让 Agent 具备读写本地文件的能力，同时理解安全限制的必要性。

## 本 Demo 的工具

| 工具 | 功能 |
|------|------|
| `listFiles` | 列出 workspace 中的文件 |
| `readFile` | 读取 workspace 中的文件内容 |
| `writeFile` | 写入内容到 workspace 中的文件 |

## 安全设计：路径沙箱

Agent 的所有文件操作被限制在 `workspace/` 目录内：

```
项目根目录/
├── demos/03-file-agent/
│   ├── workspace/       ← Agent 只能访问这里
│   │   ├── journal.md   ← 可以
│   │   └── todo.txt     ← 可以
│   └── src/
│       └── tools.ts     ← 不能访问（在 workspace 外）
├── .env                 ← 不能访问（在 workspace 外）
```

核心实现 `safePath()` 函数：

```typescript
function safePath(filePath: string): string {
  const resolved = path.resolve(WORKSPACE, filePath);
  // 如果解析后的路径不在 workspace 内 → 拒绝
  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error(`禁止访问外部路径`);
  }
  return resolved;
}
```

即使模型传入 `"../../../.env"`，`path.resolve` 会把路径解析成绝对路径，然后 `startsWith` 检查会发现它不在 workspace 内，直接拒绝。

## 覆盖保护

`writeFile` 第一次写入文件时正常写入。如果文件已存在，会先返回警告并要求确认：

```
警告：文件 "note.txt" 已存在！当前内容：...
如果你要覆盖，请再次调用 writeFile
```

这模拟了真实 Agent 系统中的"人类审批"机制。

## 运行

```bash
pnpm run demo:03
```

运行后检查 `demos/03-file-agent/workspace/` 目录，你会看到 Agent 创建的文件。

## 为什么 Agent 需要文件系统？

1. **记忆**：对话上下文有长度限制，长内容存到文件可以"卸载"记忆
2. **持久化**：模型回复写进文件，下次启动还能看到
3. **文档处理**：读取本地文档、生成报告等实用场景

## 为什么需要安全限制？

如果 Agent 没有任何文件访问限制：

- 可能读取你的 `.env` 文件获取密钥
- 可能误删系统文件
- 可能被恶意 prompt 利用

给 Agent 加"笼子"（沙箱）是工程化的基本要求。
