# Demo 01：Tool Calling

## 学习目标

跑完这个 Demo，你将理解：

1. **什么是 Tool**：模型可以调用的外部函数
2. **为什么 LLM ≠ Agent**：纯 LLM 只会聊天，加上工具才变成能"干活"的 Agent
3. **Tool Schema**：用 JSON 格式告诉模型"我有什么工具、每个工具需要什么参数"
4. **工具调用流程**：模型不是"执行"工具，而是"请求调用"工具，真正执行的是你的代码

## 运行方式

```bash
pnpm run demo:01
```

## 本 Demo 包含的工具

| 工具 | 功能 |
|------|------|
| `calculator` | 计算数学表达式 |
| `getCurrentTime` | 获取当前时间 |
| `getWeather` | 查询城市天气（模拟数据） |

## 核心流程

```
用户提问："北京天气怎样？帮我算 365×24"
        │
        ▼
  ① 发送给模型 + 工具列表
        │
        ▼
  ② 模型返回："我需要调用 getWeather('北京') 和 calculator('365*24')"
        │
        ▼
  ③ 你的代码执行这两个工具函数
        │
        ▼
  ④ 把工具结果还给模型
        │
        ▼
  ⑤ 模型整合结果，生成最终回复
```

## 你可以试试修改的问题

修改 `index.ts` 中 `userMessage` 的值：

- `"现在几点了？"` → 会调用 getCurrentTime
- `"上海天气如何？"` → 会调用 getWeather
- `"100 + 200 * 3 等于多少？"` → 会调用 calculator
- `"你好，介绍一下自己"` → 不需要工具，模型直接回答

## 学到的新概念

### Tool 是什么？

Tool = 模型可以"请求调用"的外部函数。类比：

- 你问朋友"现在几点？"→ 朋友看手表（使用工具"手表"）
- 你问 LLM"现在几点？"→ LLM 请求调用 `getCurrentTime()` 函数

LLM 本身不知道当前时间，但它可以通过工具来获取。

### Tool Schema 是什么？

Schema 是工具的"说明书"，告诉模型：

```json
{
  "name": "getWeather",        // 工具名称
  "description": "查询天气",    // 工具用途
  "parameters": {               // 需要什么参数
    "city": { "type": "string" }
  }
}
```

模型读完 Schema 就知道：哦，有个叫 `getWeather` 的工具，需要一个 `city` 参数。

### LLM vs Agent

| | LLM（大语言模型） | Agent（智能体） |
|---|---|---|
| 能聊天 | OK | OK |
| 能获取实时信息 | X | OK（通过工具） |
| 能执行操作 | X | OK（通过工具） |
| 能做数学计算 | 不可靠 | OK（通过工具） |

**Agent = LLM + 工具 + 决策循环**
