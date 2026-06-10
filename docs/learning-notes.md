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
