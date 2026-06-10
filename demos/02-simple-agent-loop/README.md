# Demo 02：Simple Agent Loop

## 学习目标

理解 Agent 最核心的机制 —— **循环（Loop）**。

## 和 Demo 01 的关键区别

| | Demo 01 | Demo 02 |
|---|---|---|
| 调用工具次数 | 固定 1 次 | 不限次数（循环直到完成） |
| 控制方式 | 手动写了 2 次 API 调用 | `while` 循环自动控制 |
| 能处理复杂任务 | 勉强 | 可以！模型可以分多步完成 |

## Agent Loop 流程

```
用户提问
    │
    ▼
┌─────────────────────────┐
│   while (还没完成) {      │ ← 循环开始
│                          │
│   ① 发送消息给模型       │
│   ② 模型返回：           │
│      - "我要调工具" → ③  │
│      - "这是答案"   → 结束│
│   ③ 执行工具，结果还给模型│
│   ④ 回到 ①              │
│                          │
│   }                      │ ← 循环结束
└─────────────────────────┘
    │
    ▼
最终答案
```

## ReAct 思想

ReAct = **Re**asoning + **Act**ing（推理 + 执行）

- **Reasoning（模型负责）**：分析当前信息，决定下一步做什么
- **Acting（代码负责）**：执行模型选中的工具，返回结果

模型和代码交替工作：模型思考 → 代码执行工具 → 模型根据结果再思考 → 代码再执行...

这就像你和一个研究员合作：研究员说"帮我查一下北京天气"，你查完告诉他，他可能又说"再查一下上海天气"，你查完告诉他，他说"好，我现在可以写总结了"。

## 关键代码

```typescript
while (loopCount < MAX_LOOPS) {
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages,      // 完整对话历史
    tools: tools,  // 可用工具列表
  });

  const choice = response.choices[0];

  // 模型不调工具 = 它觉得任务完成了
  if (choice.finish_reason !== "tool_calls") {
    console.log(choice.message.content);  // 打印最终答案
    break;
  }

  // 模型要调工具 → 执行，结果加入历史，继续循环
  for (const tc of choice.message.tool_calls) {
    const result = executeTool(tc.function.name, tc.function.arguments);
    messages.push({ role: "tool", content: result });
  }
}
```

## 你能看到的东西

运行后你会观察到：

1. 模型可能一次调用多个工具（如同时查北京和上海天气）
2. 模型得到结果后可能再次调用工具（如拿到温度后调用计算器）
3. 最终模型判断"信息够了"才输出答案

## 安全机制：MAX_LOOPS

`MAX_LOOPS = 10` 是循环的"紧急刹车"。防止模型陷入无限循环。

真实项目中这很关键——如果模型每轮都调工具但始终不满足，你的 API 费用会一直跑。
