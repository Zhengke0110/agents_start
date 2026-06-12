# Demo 07：Multi-Agent 多 Agent 协作

## 学习目标

理解如何让多个 Agent 分工合作——每个 Agent 有独立职责、独立 system prompt、独立输入输出。

## 三个角色的分工

```
用户：帮我写一份 Agent 基础知识报告
              │
              ▼
      ┌──────────────┐
      │ Orchestrator │  协调者：控制流程先后
      └──────┬───────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
Researcher  Writer  Reviewer
 查资料    写报告   审核
```

| 角色 | system prompt 核心 | 输入 | 输出 |
|------|-------------------|------|------|
| Researcher | "你是研究员，从材料中找关键信息" | 知识库全文 + 主题 | 关键发现（带来源） |
| Writer | "你是技术写作者，写 Markdown 报告" | Researcher 的发现 | 结构化的报告 |
| Reviewer | "你是审核员，检查报告质量" | Writer 的报告 | PASS / NEEDS_REVISION |

## 每个子 Agent 的本质

一个子 Agent = 一次独立的 LLM 调用 + 一个专门的 system prompt。

和普通工具调用的区别：

| 工具调用 | 子 Agent |
|---------|---------|
| 模型调一个函数 | 模型产生一段文本输出 |
| 返回结构化数据 | 返回自然语言文本 |
| 确定性（计算器一定对） | 非确定性（每次输出不同） |

## 多 Agent 适合什么场景？

1. **角色分明**：需要不同视角（研究 / 写作 / 审核）
2. **任务可分阶段**：输出交给下一个 Agent 继续处理
3. **质量要求高**：一个产出，另一个检查
4. **需要并行处理**：多个子 Agent 同时工作（本 Demo 是串行的）

## 多 Agent 可能产生的失控问题

1. **级联错误**：Researcher 漏了关键信息 → Writer 报告缺内容 → Reviewer 没发现
2. **令牌消耗翻倍**：每个子 Agent 都要独立调用 LLM
3. **审查意见冲突**：多个 Reviewer 意见不一致时听谁的
4. **无限循环**：Writer 改 → Reviewer 不满意 → Writer 再改 → Reviewer 仍不满意...

## 运行

```bash
pnpm run demo:07
```

报告会保存到 `workspace/multi-agent-report.md`。
