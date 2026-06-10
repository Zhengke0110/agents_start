# Demo 00：Hello LLM

## 学习目标

这是你的第一个 LLM 程序。跑完这个 Demo 后，你将理解：

1. **什么是 LLM 调用**：通过代码向大语言模型发送文字并获取回复
2. **什么是 API Key**：你的身份凭证
3. **什么是 Message**：你和模型对话的基本单位
4. **System / User / Assistant 三种角色**的含义

## 运行方式

```bash
# 在项目根目录执行
pnpm install       # 先安装依赖
pnpm run demo:00   # 运行 Demo 00
```

## 预期输出

运行后，控制台会打印类似以下内容：

```
========== Demo 00：Hello LLM ==========

[user] 我发送的话：
"你好！我是 PC，正在学习 Agent 开发。请用一句话鼓励我开始这段学习旅程。"

[llm] 模型回复：
"学习 Agent 开发是一个令人兴奋的旅程，你已经迈出了最重要的第一步！"

[usage] Token 使用详情：
   prompt_tokens     (输入) = 38
   completion_tokens (输出) = 20
   total_tokens      (合计) = 58
```

## 代码讲解

打开 `demos/00-hello-llm/src/index.ts` 查看带注释的完整代码。

### 核心步骤

```
① 加载 .env 文件中的 API Key
② 用 API Key 初始化 OpenAI 客户端（指向 DeepSeek 服务器）
③ 构造消息数组（system 设定角色 + user 提问）
④ 调用 client.chat.completions.create() 发送给模型
⑤ 打印模型的回复
```

## 你将学到的概念

### LLM 调用是什么？

就像你打开浏览器访问一个网站，LLM 调用是：

- 你的程序通过网络，把一段文字发给远端的"大模型服务器"
- 模型读完你的文字，生成一段回复，再通过网络返回给你的程序
- 这个"发过去 → 收回来"的过程，就是一次 LLM 调用

### API Key 是什么？

- 就像你的银行卡密码，证明"你是谁"
- 调用 API 是按量收费的，API Key 用来记账
- **绝对不能**把 API Key 写在代码里提交到 Git！

### Message 是什么？

Message = 一条"对话记录"。每条消息有两个关键属性：

- `role`：谁说的（system / user / assistant）
- `content`：说了什么

### 三种角色

| 角色        | 谁说的 | 用途               | 举例                   |
| ----------- | ------ | ------------------ | ---------------------- |
| `system`    | 开发者 | 给模型设定行为规则 | "你是一个有帮助的助手" |
| `user`      | 用户   | 用户的提问或指令   | "你好，请介绍一下自己" |
| `assistant` | 模型   | 模型的回复         | "你好！我是 AI 助手..." |
