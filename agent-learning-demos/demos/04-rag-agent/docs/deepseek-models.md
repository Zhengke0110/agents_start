# DeepSeek 模型介绍

## 主要模型

### deepseek-chat（DeepSeek-V3）

通用对话模型，适合大多数场景：
- 日常对话和问答
- 内容创作和总结
- 工具调用和 Agent 开发
- 性价比高，适合学习和开发

### deepseek-reasoner（DeepSeek-R1）

专注推理的模型，适合复杂任务：
- 数学证明和计算
- 复杂逻辑推理
- 代码调试和分析
- 价格更高但推理能力更强

## API 兼容性

DeepSeek API 完全兼容 OpenAI 格式，可以使用 OpenAI SDK 直接调用，只需修改 baseURL。

## 使用建议

- 一般对话和工具调用：使用 deepseek-chat
- 复杂推理任务：使用 deepseek-reasoner
- 注意控制 max_tokens 避免不必要的费用
