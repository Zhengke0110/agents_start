# Demo 06：Multi-tool Agent 多工具协作

## 学习目标

理解 Agent 如何在一个任务中组合使用不同类型（搜索 + 文件 + Todo）的工具。

## 本 Demo 的 6 个工具

| 工具 | 类型 | 来源 |
|------|------|------|
| `searchDocs` | 知识检索 | Demo 04 |
| `writeFile` | 文件写入 | Demo 03 |
| `listFiles` | 文件列表 | Demo 03 |
| `createTodo` | 任务创建 | Demo 05 |
| `updateTodo` | 任务更新 | Demo 05 |
| `listTodos` | 任务列表 | Demo 05 |

## 任务示例

```
"帮我完成一份学习报告：
 1. 搜索知识库，找到 Agent 基础概念和工具系统
 2. 整理成 Markdown 笔记
 3. 保存到 workspace/agent-learning-report.md"
```

这个任务**必须**使用多类工具：
- 搜索知识库 → searchDocs
- 规划步骤 → createTodo / updateTodo
- 写文件 → writeFile

## Agent 如何决定工具顺序？

Agent 通过 system prompt 理解任务，然后推理出正确的工具调用顺序：

```
searchDocs("Agent 基础")     ← 先获取信息
searchDocs("Agent 工具")     ← 再获取更多信息
createTodo(...)              ← 规划步骤
updateTodo("in_progress")    ← 开始执行
writeFile("report.md", ...)  ← 写出结果
updateTodo("completed")      ← 标记完成
```

## 工具太多可能带来的问题

1. **选择困难**：10+ 工具时模型可能选错
2. **名称混淆**：相似的名称（readFile vs readFileContent）
3. **Schema 描述不清**：模型不知道什么时候该用哪个工具
4. **过度调用**：模型可能调不必要的工具

**缓解方法**：工具 description 写清楚使用场景，工具数量控制在 6-10 个以内。

## 运行

```bash
pnpm run demo:06
```

运行后检查 `workspace/agent-learning-report.md`。
