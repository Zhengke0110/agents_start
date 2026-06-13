# Agent Learning Demos

从零开始学习 Agent 开发，通过 9 个渐进式 Demo 掌握核心概念。

## 学习路线

| Demo | 主题              | 学什么             |
| ---- | ----------------- | ------------------ |
| 00   | Hello LLM         | 第一次调用大模型   |
| 01   | Tool Calling      | 让模型学会使用工具 |
| 02   | Simple Agent Loop | 手写 Agent 循环    |
| 03   | File Agent        | 让 Agent 读写文件  |
| 04   | RAG Agent         | 本地知识库问答     |
| 05   | Planning Agent    | 任务规划与拆解     |
| 06   | Multi-tool Agent  | 多工具协作         |
| 07   | Multi-Agent       | 子 Agent 协作      |
| 08   | DeepAgents Style  | 综合能力展示       |

## 环境要求

- Node.js >= 18
- npm >= 9

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key
cp .env.example .env
# 编辑 .env 文件，填入你的 ANTHROPIC_API_KEY

# 3. 运行 Demo
npm run demo:00
```

## 项目结构

```
agent-learning-demos/
├── demos/           # 所有 Demo 代码
├── docs/            # 学习笔记
├── .env.example     # 环境变量模板
├── package.json     # 项目配置
└── tsconfig.json    # TypeScript 配置
```

## 学习建议

1. 按顺序学习，每个 Demo 建立在前一个的基础上
2. 每个 Demo 的 README 都包含详细的学习说明
3. 学习笔记记录在 `docs/learning-notes.md`
4. 先理解概念，再动手运行，最后看代码
