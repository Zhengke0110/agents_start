# Agent 开发入门：从 LLM 到自主智能体

## 目录

1. [什么是 Agent？](#1-什么是-agent)
2. [Agent 三要素：感知、推理、行动](#2-agent-三要素感知推理行动)
3. [ReAct 决策循环：边想边做，边做边学](#3-react-决策循环边想边做边做边学)
4. [工具系统：智能体的手脚](#4-工具系统智能体的手脚)
5. [DeepSeek 模型：Agent 开发的理想选择](#5-deepseek-模型agent-开发的理想选择)
6. [实践建议：从零启动你的第一个 Agent](#6-实践建议从零启动你的第一个-agent)

---

## 1. 什么是 Agent？

### 1.1 一句话定义

**Agent（智能体）** 是一个能够**自主感知环境、做出决策、并采取行动**的程序。它不是被动等待指令的工具，而是具备主动思考和行动能力的存在。

### 1.2 Agent 与普通 LLM 的本质区别

| 对比维度 | 普通 LLM | Agent |
|---------|----------|-------|
| 能力边界 | 文本生成 | 执行任务 |
| 交互方式 | 单轮回复 | 多轮决策循环 |
| 环境感知 | 无 | 感知并适应环境 |
| 行动能力 | 无 | 调用工具、修改状态 |
| 错误处理 | 无法纠正 | 从反馈中学习调整 |

**核心差异**：普通 LLM 是"会说话的顾问"，Agent 是"能动手的助手"。

### 1.3 Agent 的工作流程概览

```
用户请求 → 感知（理解输入） → 推理（LLM 制定计划） → 行动（调用工具/生成回复） → 观察（获取结果） → 再推理（评估并调整） → 直到目标完成
```

---

## 2. Agent 三要素：感知、推理、行动

### 2.1 感知（Perception）

感知是 Agent 获取环境信息的通道，确保智能体能准确理解当前状态。

**主要感知来源：**
- 用户消息（自然语言）
- API 返回数据（结构化数据）
- 传感器信息（如温度、位置）
- 文件内容（文档、图片、音频）
- 系统状态（数据库、缓存、日志）

**示例：感知用户输入并提取意图**
```python
def perceive(user_input: str) -> dict:
    # 简单实现：提取关键信息
    if "查天气" in user_input:
        return {"intent": "query_weather", "raw": user_input}
    elif "发送邮件" in user_input:
        return {"intent": "send_email", "raw": user_input}
    else:
        return {"intent": "unknown", "raw": user_input}
```

### 2.2 推理（Reasoning）

推理是 Agent 的大脑核心，通常由大语言模型（LLM）承担。负责：
- 理解用户意图
- 制定行动计划（如多步骤分解、工具选择）
- 选择最佳行动路径
- 评估行动结果并调整

**推理的核心能力：**
1. **意图识别**：用户想要什么？
2. **计划生成**：分几步完成？每一步做什么？
3. **工具选择**：当前步骤用哪个工具？
4. **结果评估**：刚才的行动是否成功？接下来怎么办？

### 2.3 行动（Action）

行动是 Agent 将决策转化为具体结果的手段。主要形式包括：
- **调用外部工具**（API、数据库、文件系统）
- **生成回复**（自然语言响应）
- **修改系统状态**（更新配置、存储数据）

**行动的三要素：**
- 清晰的目标
- 可执行的接口
- 可观察的结果

### 小结

| 要素 | 核心功能 | 技术载体 |
|------|---------|---------|
| 感知 | 获取环境信息 | 输入处理、API 调用 |
| 推理 | 决策与规划 | 大语言模型 |
| 行动 | 执行与操作 | 工具函数、回复生成 |

---

## 3. ReAct 决策循环：边想边做，边做边学

### 3.1 什么是 ReAct？

**ReAct = Reasoning + Acting**，是一种将推理与行动交替进行的决策框架。Agent 并非一次性制定全局计划，而是在执行过程中不断观察、反馈、调整。

### 3.2 ReAct 循环流程

```
[初始状态] → 推理 → 行动 → 观察 → 再推理 → 再行动 → ... → 到达目标
```

**典型示例：订机票任务**

```python
# 伪代码示意：ReAct 循环
while task_not_completed:
    # Step 1: 推理
    observation = get_current_state()
    thought = llm.reason(observation)
    plan = thought.split("\n")[-1]  # 提取行动指令
    
    # Step 2: 行动
    if "search_flight" in plan:
        result = search_flight_api(destination="北京", date="2024-06-15")
    elif "book_flight" in plan:
        result = book_flight_api(flight_id="CA1234")
    else:
        result = "无法解析行动指令"
    
    # Step 3: 观察并记录
    add_to_memory(f"行动: {plan}, 结果: {result}")
    
    # 如果任务完成则退出
    if "任务完成" in result or user_confirmed:
        task_not_completed = False
```

### 3.3 ReAct 的核心价值

1. **动态适应**：不依赖预设路径，可随时根据新信息调整
2. **错误恢复**：行动失败后能自动重试或换方案
3. **信息累积**：每一步行动都丰富上下文，后续推理更精准
4. **透明度高**：可追踪每一步"思考-行动-观察"的链条

### 小结

ReAct 让 Agent 具备"边想边做、边做边看"的能力，是构建可靠、灵活智能体的核心模式。

---

## 4. 工具系统：智能体的手脚

### 4.1 工具的定义与结构

每个工具本质上是一个带有清晰描述的**函数**。Agent 通过 LLM 判断何时调用哪个工具。

**工具必须包含：**
- 函数名称（唯一标识）
- 功能描述（供 LLM 理解用途）
- 参数定义（类型、格式、约束）
- 执行逻辑（实际代码）

**示例：天气查询工具**
```python
def get_weather(city: str, date: str = None) -> str:
    """
    查询指定城市在指定日期的天气情况。
    
    参数:
    - city: 城市名称，例如"北京"、"上海"
    - date: 日期，格式为"YYYY-MM-DD"，默认当天
    
    返回:
    - 格式化的天气信息字符串
    """
    # 实际调用天气 API
    # return weather_api_response
    return f"{city}在{date}的天气：晴，22-28°C"
```

### 4.2 工具调用流程（Function Calling）

```
用户请求 → LLM 推理 → 识别需要工具 → 输出函数调用 Schema → 执行工具 → 结果返回给 LLM → LLM 生成最终回复
```

**DeepSeek API 工具调用示例：**
```python
import openai

client = openai.OpenAI(
    api_key="your-api-key",
    base_url="https://api.deepseek.com/v1"
)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "查询城市的天气信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市名称"
                    },
                    "date": {
                        "type": "string",
                        "description": "日期，格式YYYY-MM-DD"
                    }
                },
                "required": ["city"]
            }
        }
    }
]

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "北京今天天气如何？"}],
    tools=tools
)
```

### 4.3 多工具协作

当任务需要多个能力时，Agent 能自动组合工具链：

**示例：预订行程的完整流程**
1. `search_flight` → 查询航班
2. `book_flight` → 预订机票
3. `search_hotel` → 查找酒店
4. `book_hotel` → 预订房间
5. `generate_itinerary` → 生成行程单

### 小结

工具系统让 Agent 从"能说"变为"能做"。精心设计的工具描述是 Agent 可靠性的关键。

---

## 5. DeepSeek 模型：Agent 开发的理想选择

### 5.1 模型矩阵：选择合适的 DeepSeek 模型

| 模型 | 类型 | 适用场景 | 推荐度 |
|------|------|---------|--------|
| **deepseek-chat (DeepSeek-V3)** | 通用型 | 大多数 Agent 场景，性价比最优 | ⭐⭐⭐⭐⭐ |
| **deepseek-reasoner (DeepSeek-R1)** | 增强推理型 | 复杂逻辑、数学、代码分析 | ⭐⭐⭐⭐ |

### 5.2 deepseek-chat（DeepSeek-V3）：Agent 开发首选

**特点：**
- 完整的工具调用（Function Calling）支持
- 超长上下文处理能力
- 极高的性价比，适合学习和开发
- 响应速度快，交互流畅

**推荐场景：**
- 日常对话和问答 Agent
- 内容创作和总结 Agent
- 标准工具调用 Agent（如天气查询、信息检索）
- 学习入门阶段的全部场景

### 5.3 deepseek-reasoner（DeepSeek-R1）：复杂推理利器

**特点：**
- 在数学证明、逻辑推理方面表现卓越
- 适合需要深度分析的复杂任务
- 价格较高，不适合通用场景

**推荐场景：**
- 代码调试和漏洞分析 Agent
- 复杂数学问题求解 Agent
- 需要深度推理的决策支持系统

### 5.4 API 兼容性：零成本迁移

DeepSeek API **完全兼容 OpenAI 格式**，只需修改 `base_url`：
```python
# 从 OpenAI 迁移到 DeepSeek，只需改一行
client = openai.OpenAI(
    api_key="your-deepseek-api-key",
    base_url="https://api.deepseek.com/v1"  # 仅需修改此处
)
```

### 5.5 双模型架构（进阶玩法）

对于复杂 Agent 系统，可考虑"双模型"架构：
- **deepseek-chat**：作为主控模型，处理常规交互和工具调用
- **deepseek-reasoner**：处理高难度推理子任务

这种架构既保证了日常交互的效率，又能在关键时刻提供强大的推理能力。

### 小结

DeepSeek 为 Agent 开发提供了完整、高性价比的模型矩阵。初学者推荐从 `deepseek-chat` 开始。

---

## 6. 实践建议：从零启动你的第一个 Agent

### 6.1 从最简单的 ReAct 模式入手

不要一开始就追求复杂的框架。理解并手动实现一个最简的 ReAct 循环，是理解 Agent 核心的最佳方式：

1. 写一个简单的 LLM 调用
2. 定义 1-2 个工具函数（如查询天气、搜索信息）
3. 实现循环：LLM 输出 → 解析函数调用 → 执行工具 → 结果反馈给 LLM
4. 观察循环，直到任务完成

### 6.2 精心设计工具描述

工具描述的质量直接影响 LLM 选择的准确性：
- 用清晰、精确的语言描述工具功能
- 参数定义要完整，包括类型、格式、取值范围
- 提供典型示例，帮助 LLM 理解用法

### 6.3 选择正确的模型

- **起步阶段**：直接使用 `deepseek-chat`，成本低、效果好
- **遇到推理瓶颈**：引入 `deepseek-reasoner` 处理特定子任务
- **持续优化**：根据实际使用反馈调整模型选择

### 6.4 做好异常处理

Agent 注定会犯错——关键是优雅地处理错误：
- 为每个工具调用添加 try-except
- 将错误信息返回给 LLM，让它知道"此路不通"
- 设计重试和降级策略

```python
def safe_call_tool(tool_func, **kwargs):
    try:
        return tool_func(**kwargs)
    except Exception as e:
        return f"工具调用失败: {str(e)}"  # 错误信息反馈给 LLM
```

### 6.5 管理对话状态

Agent 是"有状态的"——需要维护完整的上下文：
- 记录每一步的思考和行动
- 保存工具调用的结果
- 追踪任务进度和已完成步骤

### 6.6 学习路径建议

| 阶段 | 目标 | 实践内容 |
|------|------|---------|
| 🟢 入门 | 理解 Agent 概念 | 阅读本文，理解三要素和 ReAct |
| 🟡 基础 | 实现第一个 Agent | 用 deepseek-chat + 2个工具写一个 ReAct Agent |
| 🟠 进阶 | 构建复杂工具链 | 设计多工具协作，引入异常处理 |
| 🔴 高级 | 双模型架构 | 结合 deepseek-chat 和 deepseek-reasoner |
| 🟣 专家 | 生产级部署 | 状态管理、监控、优化、安全防护 |

---

## 总结

Agent 开发是 AI 应用的前沿方向。通过将大语言模型与工具系统结合，我们能够创建真正"能动手"的智能助手。

**核心要点回顾：**
1. **Agent = LLM + 工具 + 决策循环**
2. **三要素闭环**：感知→推理→行动→再感知→再推理→再行动...
3. **ReAct 模式**：边想边做，动态适应
4. **工具系统**：精心设计的工具描述是关键
5. **DeepSeek 模型**：高性价比的 Agent 开发首选

从今天开始，用 `deepseek-chat` 构建你的第一个 Agent 吧！