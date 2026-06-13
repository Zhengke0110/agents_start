# Demo 08：DeepAgents 风格综合 Agent

## 这是最终 Boss

本 Demo 把前 7 个 Demo 的全部能力整合到一个 Agent 中。

## 六大能力对照

| 能力 | 对应工具 | 对应 Demo | DeepAgents 概念 |
|------|---------|-----------|-----------------|
| **Planning** | createTodo / updateTodo / listTodos | Demo 05 | 任务规划与拆解 |
| **Tools** | searchDocs / 文件工具 / 子 Agent | Demo 01/02/06 | 工具注册与调用 |
| **Filesystem** | readFile / writeFile / listFiles | Demo 03 | 文件系统访问 |
| **Context Mgmt** | offloadContext | **新增** | 上下文窗口管理 |
| **SubAgent** | delegateToSubAgent | Demo 07 | 子任务委托 |
| **Human Approval** | requestApproval | **新增** | 人机协作回路 |

## 10 个工具一览

```
[plan]    createTodo / updateTodo / listTodos     ← 任务规划
[search]  searchDocs                               ← 知识检索
[file]    readFile / writeFile / listFiles         ← 文件系统
[subagent] delegateToSubAgent                      ← 子 Agent
[ctx]     offloadContext                           ← 上下文管理
[approval] requestApproval                         ← 人工审批
```

## DeepAgents 相比普通 Agent 多了什么？

| 普通 Agent | DeepAgents |
|-----------|------------|
| 单一循环 | 多层：主 Agent + 子 Agent |
| 所有内容在上下文 | 长内容卸载到文件系统 |
| 自动执行 | 危险操作暂停等人类确认 |
| 固定工具集 | 工具可动态注册/发现 |

## 关键设计

### 1. Context Management（上下文管理）

LLM 的上下文有 token 上限。当对话变长，Agent 会把中间结果保存到文件，然后引用文件路径而不是全文。

```
第 5 轮：消息数 16，超过阈值 → Agent 调用 offloadContext
         把搜索发现存入 "context-搜索发现.md"
         后续只需 readFile 读取
```

### 2. Human Approval（人类审批）

覆盖已有文件前，Agent 先调用 requestApproval：

```
Agent：文件 report.md 已存在，我先请求审批...
       ╔══════════════════════════╗
       ║  [审批] 确认覆盖 report.md？
       ╚══════════════════════════╝
Agent：已批准，执行写入。
```

本 Demo 中自动批准（方便运行），真实项目会通过 readline 等机制等待用户输入。

### 3. SubAgent（子 Agent 委托）

复杂子任务交给专门的子 Agent，而不是让主 Agent 尝试做所有事：

```
主 Agent：研究任务太复杂，委托给 researcher 子 Agent
          ┌─ [SubAgent:researcher] ─┐
          │ 分析知识库，输出结构化发现  │
          └──────────────────────────┘
主 Agent：拿到发现，委托 writer 子 Agent 写报告
```

## 运行

```bash
pnpm run demo:08
```

最终报告保存在 `workspace/agent-learning-report.md`。

## 后续如何升级成真实项目

1. 用 LangChain 或 DeepAgents 框架替代手写循环
2. 加入向量数据库替代关键词检索
3. 持久化 Todo 到数据库
4. 加入 Web 界面替代控制台
5. 实现流式输出（SSE / WebSocket）
6. 加入权限系统和审计日志
