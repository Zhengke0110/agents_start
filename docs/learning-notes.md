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

---

## Demo 04：RAG Agent 本地知识库问答

### 学到的新概念

#### 1. 什么是 RAG？

RAG = Retrieval Augmented Generation（检索增强生成）

三步流程：检索 → 增强 → 生成
- 检索：从文档中找相关片段
- 增强：把片段和问题拼在一起作为上下文
- 生成：模型基于增强后的上下文回答

#### 2. RAG 和普通聊天的区别

| | 普通聊天 | RAG |
|---|---|---|
| 知识来源 | 训练数据（可能过时） | 本地文档（可控、可更新） |
| 准确性 | 可能编造 | 基于文档，更可靠 |
| 溯源 | 不知道从哪来 | 能引用来源 |
| 更新 | 重新训练 | 更新文档即可 |

#### 3. Chunk 是什么？

Chunk = 文档片段。长文档不能整篇塞进上下文，需要切成小块。检索时只取最相关的几个 chunk。

拆分方式：按段落、按标题、按固定字数。

#### 4. 检索（Retrieval）是什么？

从文档集合中找到和查询最相关的内容。实现方式：
- **关键词匹配**（本 Demo）：拆分查询词，统计出现次数，打分排序。简单但不理解语义。
- **向量相似度**（进阶）：用 embedding 模型把文本转成向量，计算余弦相似度。
- **混合检索**：关键词 + 向量，兼顾精确匹配和语义理解。

#### 5. 知识泄露风险

检索到的 chunk 可能包含敏感信息（密钥、内部数据），模型会无差别地暴露给用户。所以知识库要审查，敏感内容要隔离。

### 核心代码逻辑

```typescript
// 检索器：关键词打分
function searchDocs(query: string): Chunk[] {
  const keywords = query.toLowerCase().split(/\s+/);
  return chunks
    .map(chunk => ({
      chunk,
      score: keywords.reduce((s, kw) =>
        s + (chunk.content.match(new RegExp(kw, "g"))?.length ?? 0), 0),
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// Agent：调 searchDocs → 拿到片段 → 基于片段回答
```

### 常见错误

1. **检索结果不相关** → 关键词匹配太粗糙，后续需升级为向量检索
2. **上下文过长** → 返回太多 chunk 会撑爆 token 限制，要控制 topK
3. **模型忽略检索结果** → system prompt 要明确要求基于文档回答并引用来源

### 后续如何扩展

- 用 embedding + 向量数据库（如 Chroma、Pinecone）做语义检索
- 支持 PDF 等更多文档格式
- 加入 reranker（对检索结果重新排序，提高精度）

---

## Demo 05：Planning Agent 任务规划

### 学到的新概念

#### 1. Planning 对 Agent 的作用

面对复杂任务（如"准备技术分享"），Agent 不能一步完成。Planning 让它：
- **结构化**：把模糊大任务变成清晰小步骤
- **可追踪**：知道当前做到哪了、还剩什么
- **防遗漏**：不会漏掉步骤
- **可恢复**：中断后可以从 Todo List 继续

#### 2. 任务状态机

```
pending ──→ in_progress ──→ completed
 待办         进行中         已完成
```

每种状态的含义明确，Agent 通过 updateTodo 切换状态，模拟了真实项目管理的流程。

#### 3. 任务拆解为什么重要

复杂任务的步骤之间有逻辑依赖。比如"写报告"依赖"查资料"先完成。没有规划的话：
- Agent 可能先写报告再查资料（顺序错误）
- 可能漏掉中间步骤
- 用户无法判断执行到哪一步了

#### 4. 规划失败可能带来的问题

- **计划太细**：10 步的活列了 50 个 todo，浪费大量 token
- **计划太粗**：步骤描述不清，执行时不知道做什么
- **顺序错误**：依赖关系没考虑
- **忘记更新状态**：Agent 做了事但一直 in_progress

### 核心代码逻辑

```typescript
// Todo 管理（内存存储）
interface Todo {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
  result: string;
}

// 三个工具：createTodo / updateTodo / listTodos
// Agent Loop 和前面 Demo 完全一样
```

关键在 system prompt 的规则：
> 一次只做一个任务（in_progress），完成后标记 completed 再做下一个。

### 常见错误

1. **Agent 跳过规划直接执行** → system prompt 要明确要求"先规划"
2. **并行执行多个任务** → system prompt 要强调"一次只做一个"
3. **Todo ID 对不上** → Agent 可能记错 ID，updateTodo 时要校验

### 后续如何扩展

- 加入子任务（嵌套 Todo）
- 持久化 Todo 到文件（跨会话保持）
- 加入依赖关系（任务 3 依赖任务 1 完成）
- 加入时间估计和实际耗时统计

---

## Demo 06：Multi-tool Agent 多工具协作

### 学到的新概念

#### 1. 多工具协作 vs 单工具调用

| 单工具 | 多工具 |
|--------|--------|
| 所有工具同一类型 | 混合多种类型（搜索 + 文件 + Todo） |
| 简单决策（用不用工具？） | 复杂决策（用**哪个**工具？先调用哪个？） |
| 工具间无依赖 | 工具之间有逻辑顺序 |

#### 2. Agent 如何决定工具顺序？

Agent 通过 system prompt 理解任务，然后根据自己的推理决定调用顺序。正确的顺序是：

```
searchDocs("Agent 基础")  →  先获取信息
searchDocs("工具系统")    →  再获取更多信息
writeFile("report.md")   →  最后写出结果
```

Agent 知道不能先 writeFile 再 searchDocs，因为还没有内容可写。

#### 3. 工具太多可能带来的问题

本 Demo 只有 6 个工具，但 Agent 遇到了实际问题：
- **检索效果不佳**：关键词匹配太粗糙，Agent 多轮搜索才找到需要的资料（第 2-10 轮）
- **重复搜索**：Agent 用不同 query 反复搜索相同内容
- **路径混淆**：Agent 写了 `workspace/agent-learning-report.md`，导致文件路径变成 `workspace/workspace/...`

### 核心代码逻辑

本 Demo 的 tools.ts 是 Demo 03+04+05 的融合——6 个工具共用一套 executeTool。

### 常见错误

1. **重复调用** → Agent 用不同 query 反复搜索同一内容，浪费 token
2. **路径混淆** → Agent 在路径中加了多余的 `workspace/` 前缀 → 修复：自动 strip 多余前缀
3. **搜索效率低** → 关键词匹配的局限性暴露，说明需要向量检索

### 后续如何扩展

- 升级为向量检索（解决关键词匹配不准的问题）
- 加入工具选择的优先级（避免 Agent 在多个工具间犹豫）
- 工具调用计数和限流（防止重复调用浪费资源）

---

## Demo 07：Multi-Agent 多 Agent 协作

### 学到的新概念

#### 1. 什么是子 Agent？

子 Agent = 一次独立的 LLM 调用 + 一个专门的 system prompt。

和工具调用的区别：

| | 工具调用 | 子 Agent |
|---|---|---|
| 本质 | 模型调一个函数 | 模型产生一段文本 |
| 返回 | 结构化数据（计算结果） | 自然语言（分析报告） |
| 确定性 | 高（计算器一定对） | 低（每次输出不同） |
| 用途 | 获取数据、执行操作 | 分析、创作、审核 |

#### 2. 多 Agent 适合什么场景？

- **角色分明**：需要不同视角（研究员/写作者/审核员）
- **任务可分阶段**：上一个 Agent 的输出是下一个 Agent 的输入
- **质量要求高**：一个产出，另一个检查
- **并行化**：多个子 Agent 可以同时工作

#### 3. 子 Agent 和普通函数调用的区别

普通函数输入 → 处理 → 输出，逻辑确定。
子 Agent 输入 → LLM 推理 → 输出，每次结果可能不同。子 Agent 的优势是**灵活性**——你不需要写死处理逻辑，只需要写好 system prompt。

#### 4. 多 Agent 可能产生的失控问题

- **级联错误**：Researcher 漏了信息 → Writer 报告缺内容 → Reviewer 没发现
- **Token 消耗翻倍**：每个子 Agent 都要独立调用 LLM
- **无限修改循环**：Writer 改 → Reviewer 不满意 → 再改 → 仍不满意...
- **角色模糊**：两个 Agent 的 prompt 太相似，做了重复工作

### 核心代码逻辑

```typescript
// 每个子 Agent 就是一次独立的 LLM 调用
async function researcherAgent(topic: string, knowledge: string) {
  return client.chat.completions.create({
    messages: [
      { role: "system", content: "你是一名研究员..." },
      { role: "user", content: `主题：${topic}\n材料：${knowledge}` },
    ],
  });
}

// Writer 和 Reviewer 同理，只是 system prompt 不同
// 主流程串联：
const findings = await researcherAgent(topic, knowledge);
const report = await writerAgent(topic, findings);
const review = await reviewerAgent(report, findings);
```

### 常见错误

1. **子 Agent 的 system prompt 太模糊** → 输出偏离预期，需要写清楚输出格式
2. **上下文过长** → 把整本知识库塞给一个子 Agent，token 不够
3. **没有验证上一步输出** → Researcher 输出为空，Writer 仍然硬写报告

### 后续如何扩展

- 并行化（Researcher A 和 Researcher B 同时查不同主题）
- 加入重试机制（Reviewer 不满意 → Writer 修改 → 再审核）
- 实现真正的 tool-calling 子 Agent（子 Agent 也能调工具）
