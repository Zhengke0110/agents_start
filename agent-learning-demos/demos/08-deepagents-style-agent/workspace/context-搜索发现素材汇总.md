知识库搜索发现汇总：

## Agent基础概念
1. **什么是Agent**：Agent（智能体）是一个能够自主感知环境、做出决策、并采取行动的程序。
2. **Agent vs 普通LLM**：普通LLM只能根据训练数据生成文本；Agent是LLM+工具+决策循环，可获取实时信息、执行操作。
3. **核心三要素**：感知(Perception)→推理(Reasoning)→行动(Action)，三者形成闭环。
4. **ReAct模式**：ReAct = Reasoning + Acting，交替进行推理和行动：Thought→Act→Observation→循环→Final Answer。
5. **ReAct优势**：可解释性、适应性、纠错能力、复杂任务处理。

## 工具系统
1. **工具Schema（说明书）**：JSON格式描述，包含name、description、parameters(JSON Schema)
2. **工具安全原则**：最小权限、路径沙箱、输入验证、用户确认
3. **Schema设计技巧**：description就是Prompt优化、参数命名直观、提供枚举值

## DeepSeek模型
1. **deepseek-chat (DeepSeek-V3)**：通用对话模型，适合工具调用和Agent开发，性价比极高
2. **deepseek-reasoner (DeepSeek-R1)**：专注推理的模型，适合数学证明、复杂逻辑推理、代码调试
3. **API兼容**：完全兼容OpenAI格式，可以使用OpenAI SDK直接调用，只需修改baseURL
4. **开发建议**：80%日常Agent开发用deepseek-chat；复杂推理任务用deepseek-reasoner