# 📝 Agent 开发学习笔记

> 从零开始学习 Agent 开发，记录每个 Demo 的核心概念、代码逻辑和思考。

---

## Demo 00：Hello LLM

### 学到的新概念

#### 1. LLM 调用是什么？

把"LLM 调用"类比成**打电话**：

- 你拨号（初始化 SDK 客户端）
- 你说一句话（发送 message）
- 对方听完后回复你（模型返回 response）

技术上就是：程序通过网络 HTTP 请求，把文字发给模型服务器，服务器处理后返回文字。和普通网页请求没有本质区别。

#### 2. API Key 是什么？

- **身份凭证**：证明"你是谁"，API 服务商通过它来识别调用者
- **计费依据**：调用是按 token 数量收费的，Key 用来记账
- **安全规则**：绝对不能把 Key 写死在代码里或提交到 Git，要放在 `.env` 文件中

#### 3. Message 是什么？

Message = 一条对话记录，有两个关键属性：

| 属性      | 含义     | 示例                            |
| --------- | -------- | ------------------------------- |
| `role`    | 谁说的   | `system` / `user` / `assistant` |
| `content` | 说了什么 | `"你好，请介绍一下自己"`        |

#### 4. 三种角色

| 角色        | 谁说的     | 用途                                           |
| ----------- | ---------- | ---------------------------------------------- |
| `system`    | 开发者设置 | 给模型设定行为规则，比如"请用中文回复"         |
| `user`      | 用户       | 你的提问或指令                                 |
| `assistant` | 模型       | 模型的回复（代码里不需要手动写，模型自动生成） |

#### 5. Token 是什么？

- Token = 模型处理文字的最小单位
- 1 个 token ≈ 0.75 个英文单词 ≈ 0.5 个汉字
- `prompt_tokens`：输入消耗（你发的内容）
- `completion_tokens`：输出消耗（模型回复的内容）
- 计费按照 token 总数来算

### 核心代码逻辑

```typescript
// 1. 加载 .env 中的密钥
dotenv.config();

// 2. 初始化客户端（指向 DeepSeek 服务器）
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

// 3. 发送消息，等待回复
const response = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [
    { role: "system", content: "你是一个有帮助的助手" },
    { role: "user", content: "你好" },
  ],
});

// 4. 取出回复内容
const reply = response.choices[0].message.content;
```

### 常见错误

1. **403 / 401 错误** → API Key 无效或未设置，检查 `.env` 文件
2. **`pnpm run .\demos\00-hello-llm\` 报错** → 应该用 `pnpm run demo:00`，这是脚本名不是路径
3. **忘了创建 `.env`** → 必须先 `cp .env.example .env` 然后填入真实密钥

### 后续可以如何扩展

- 加上多轮对话（把历史 messages 保留下来继续发送）
- 加上 streaming（逐字输出，像 ChatGPT 那样）
- 试试 `deepseek-reasoner` 模型（DeepSeek-R1，擅长推理）

---

## Demo 01：Tool Calling

### 学到的新概念

#### 1. Tool 是什么？

Tool = 模型可以"请求调用"的外部函数。模型本身不知道实时信息（时间、天气），但可以通过工具获取。类比：你问朋友"几点"，朋友看手表（使用工具），而不是凭空猜。

#### 2. 为什么 LLM != Agent？

| | LLM | Agent |
|---|---|---|
| 获取实时信息 | X | OK（通过工具） |
| 执行操作（计算/查天气） | X | OK（通过工具） |
| 数学计算 | 不可靠 | OK（调 calculator） |

**Agent = LLM + 工具 + 决策循环**

#### 3. Tool Schema 是什么？

用 JSON 格式描述工具（名称、参数、用途），发送给模型。模型读完就知道有哪些工具可用、每个工具需要什么参数。

#### 4. 工具调用 vs 普通聊天

- 普通聊天：模型只能从训练数据中回答
- 工具调用：模型输出的是"工具调用请求"，真正执行的是你的代码

### 核心代码逻辑

```typescript
// 1. 发送消息 + 工具列表
const response = await client.chat.completions.create({
  model: "deepseek-chat",
  messages,
  tools: toolSchemas,  // 告诉模型有哪些工具
});

// 2. 检查模型是否想要调工具
if (response.choices[0].finish_reason === "tool_calls") {
  // 3. 执行工具
  const toolCall = response.choices[0].message.tool_calls[0];
  const toolName = toolCall.function.name;
  const toolArgs = JSON.parse(toolCall.function.arguments);
  const result = toolRegistry[toolName](toolArgs);  // 真正执行

  // 4. 把结果还给模型
  messages.push({ role: "tool", content: result });
  const finalResponse = await client.chat.completions.create({ messages });
}
```

### 常见错误

1. **Tool schema 格式不对** → 模型看不懂你在说什么工具，直接忽略
2. **工具参数和 schema 不匹配** → 模型传的参数名和你实现的不一致
3. **忘了把工具结果加入 messages** → 模型不知道工具执行了什么，重复调用

### 后续如何扩展

- 增加更多工具（搜索、数据库查询、发邮件）
- 让工具返回结构化数据（JSON）而不是纯文本

---

## Demo 02：Simple Agent Loop

### 学到的新概念

#### 1. Agent Loop 是什么？

Agent Loop = 把「调模型→执行工具→还给模型」包在 `while` 循环里，模型可以决定调 0 次、1 次、N 次工具，直到信息够了才输出最终答案。

#### 2. ReAct（Reasoning + Acting）思想

- **Reasoning（推理，模型负责）**：分析现状，决定下一步做什么
- **Acting（执行，代码负责）**：真正运行工具函数

两个角色交替工作：思考 → 执行 → 思考 → 执行 → ... → 完成

#### 3. 模型推理 vs 工具执行

| | 模型推理 | 工具执行 |
|---|---|---|
| 谁做 | 模型（远程服务器） | 你的代码（本地） |
| 做什么 | "我需要查北京天气" | 真正调 getWeather() |
| 结果 | 生成一个 tool_calls 请求 | 返回一个字符串 |
| 控制权 | 模型决定何时停 | 代码执行并返回结果 |

#### 4. finish_reason 是关键信号

- `"tool_calls"` → 模型说"我还要工具"，循环继续
- `"stop"` → 模型说"我回答完了"，循环结束

### 核心代码逻辑

```typescript
while (loopCount < MAX_LOOPS) {
  // 发送消息，附带工具列表
  const response = await client.chat.completions.create({
    messages,
    tools: toolSchemas,
  });

  // 模型不想调工具 → 最终答案，退出
  if (response.choices[0].finish_reason !== "tool_calls") {
    console.log(response.choices[0].message.content);
    break;
  }

  // 执行所有工具，结果加入历史
  for (const tc of response.choices[0].message.tool_calls) {
    const result = executeTool(tc.function.name, JSON.parse(tc.function.arguments));
    messages.push({ role: "tool", tool_call_id: tc.id, content: result });
  }
}
```

### 常见错误

1. **忘记把工具调用请求加入 messages** → 模型"失忆"，不知道自己要过什么
2. **忘记把工具结果加入 messages** → 模型不知道工具执行了什么
3. **没有 MAX_LOOPS 限制** → 模型可能陷入死循环，API 费用失控

### 后续如何扩展

- 加入并行工具调用（同时调多个工具）
- 加入错误重试（工具失败时让模型重新决策）
- 加入流式输出（streaming）

---

## Demo 03：File Agent 本地文件助手

### 学到的新概念

#### 1. Agent 为什么需要文件系统？

- **记忆卸载**：对话上下文有长度限制（token 上限），长内容存到文件可以释放上下文
- **持久化**：Agent 写的文件下次启动还在，可以实现跨会话的记忆
- **实用场景**：生成报告、整理笔记、批量处理文档

#### 2. 路径沙箱（Path Sandbox）

核心原则：**限制 Agent 只能访问指定目录**。

```typescript
function safePath(filePath: string): string {
  const resolved = path.resolve(WORKSPACE, filePath);
  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error("禁止访问外部路径");
  }
  return resolved;
}
```

即使 Agent 传入 `"../../../.env"`，`path.resolve` 解析后路径会变成 `d:\projects\.env`，不在 `WORKSPACE` 内，直接拒绝。

#### 3. 为什么需要安全限制？

- Agent 是由模型驱动的，模型可能被恶意 prompt 诱导
- 没有沙箱，Agent 可能读取 `.env` 中的密钥
- 可能误删除或覆盖重要文件
- 安全原则：**永远给 Agent 最小的必要权限**

#### 4. 覆盖保护

writeFile 如果发现文件已存在，先返回警告 + 现有内容，而不是直接覆盖。这模拟了真实系统中的"人类审批"机制——危险操作前暂停，等待确认。

### 核心代码逻辑

```typescript
// Agent Loop 骨架和 Demo 02 完全一样，区别只在工具实现
while (loopCount < MAX_LOOPS) {
  const response = await client.chat.completions.create({ messages, tools });

  if (finish_reason !== "tool_calls") break; // 完成

  for (const tc of response.tool_calls) {
    const result = executeTool(tc.name, tc.args); // 文件操作！
    messages.push({ role: "tool", content: result });
  }
}
```

文件工具的执行就是普通的 Node.js fs 操作，关键是每个操作前都经过 `safePath()` 校验。

### 常见错误

1. **路径逃逸** → Agent 用 `../../` 试图访问外部文件，safePath 拦截
2. **目录不存在** → writeFile 前用 `fs.mkdirSync(dir, { recursive: true })` 确保父目录存在
3. **Agent 凭空编造文件内容** → 模型可能不调工具就声称"文件已创建"，需要通过 `finish_reason` 来判断

### 后续如何扩展

- 加入 `deleteFile` 工具（需要更严格的安全控制）
- 支持读取多种格式（PDF、CSV 等）
- 加入文件变更追踪（记录 Agent 做了什么操作）
