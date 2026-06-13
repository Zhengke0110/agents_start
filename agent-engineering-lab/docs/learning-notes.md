# Agent Engineering Lab 学习笔记

> 第二阶段：从 Demo 到工程

---

## 模块 1：LangGraph 任务规划 Agent

### 学到的新概念

#### 1. StateGraph = 有向图 + 共享状态

LangGraph 把 Agent 逻辑建模为图：
- **State**：在节点之间流转的共享数据（类比：火车车厢）
- **Node**：处理 State 的函数（类比：站点）
- **Edge**：节点间的固定连线
- **Conditional Edge**：根据条件动态选择下一节点（类比：岔道）
- **Checkpoint**：每步自动保存 State 快照，支持暂停/恢复

#### 2. Annotation 和 Reducer

`Annotation.Root()` 定义 State 结构。每个字段需要 `value`（reducer 函数）和 `default`（默认值）。

**关键 Bug 教训**：reducer `(a, b) => b ?? a ?? default` 有陷阱——当 `b` 是 falsy（`null`、`false`、`""`）时，`??` 会回退到旧值，导致"清空"操作不生效。

**正确写法**：`(a, b) => b`——直接取新值（LangGraph 只在字段被显式返回时才调用 reducer）。

#### 3. interrupt() —— 人在回路中

`interrupt()` 是 LangGraph 最强大的特性之一：
- 在节点内调用，立即暂停图执行
- 返回的 state 包含 `__interrupt__` 字段
- 外部通过 `new Command({ resume: "用户输入" })` 恢复
- 需要启用 checkpoint（`MemorySaver`）

#### 4. Checkpoint = 状态快照

`MemorySaver` 在内存中保存每步的 State 快照。作用：
- 暂停后可以从快照恢复
- 可以回溯到任意历史状态
- 同一个 `thread_id` 的多次 `invoke` 共享一个会话

#### 5. LLM 作为工具路由器

Executor 用 LLM 选择工具，而不是硬编码的 if-else：
```typescript
// 交给 LLM 决策
const toolCall = await model.invoke(`
  可用工具：writeFile, deleteFile, listFiles
  任务：${todo.title}
  返回 JSON：{"tool": "...", "args": [...]}
`);
```

优点：灵活、不需要维护规则。缺点：LLM 可能选错（如对"检查是否存在"选了 listFiles 而非 deleteFile）。

### 核心图结构

```
__start__ → planner → executor → router ──→ executor（下一任务）
                                    ├──→ human_approval → interrupt()
                                    └──→ reporter → END
```

### 常见错误

1. **reducer 中 `b ?? a` 导致 falsy 值无法清空** → 用 `(a, b) => b`
2. **interrupt 后 state.__interrupt__ 为空** → 检查 `while` 循环条件
3. **LLM 选错工具** → 优化 tool prompt，给明确的规则和示例
4. **planner 生成冗余步骤** → prompt 中说明系统自动处理的步骤

### 后续如何扩展

- 持久化 checkpoint 到数据库（替换 MemorySaver）
- 支持并行工具调用
- 加入重试机制（工具失败时让 LLM 重新选择）
- 用 interrupt 实现多级审批（操作员 → 管理员）
