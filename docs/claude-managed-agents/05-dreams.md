---
title: "梦境 (Dreams)"
source_url: "https://platform.claude.com/docs/zh-CN/managed-agents/dreams"
platform: "Anthropic Claude Managed Agents"
document_type: "Official Reference Specification"
updated_at: "2026-11-01"
---

# 梦境 (Dreams)

> **原始来源**: [https://platform.claude.com/docs/zh-CN/managed-agents/dreams](https://platform.claude.com/docs/zh-CN/managed-agents/dreams)  
> **归属平台**: Claude Managed Agents (托管智能体)

---

[Managed Agents](</docs/zh-CN/managed-agents/overview>)构建持久记忆

# 梦境

让 Claude 回顾过去的会话，以整理智能体的记忆并发现新的见解。

梦境

功能所属
    [Managed Agents](</docs/zh-CN/managed-agents/overview>)

状态
    研究预览

云平台
    Claude API可用

Beta 请求头
    

两者都需

  * `managed-agents-2026-04-01`
  * `dreaming-2026-04-21`

数据处理
    不具备 ZDR 资格不具备 HIPAA 资格

梦境处于研究预览阶段

[申请访问权限(opens in new tab)](<https://claude.com/form/claude-managed-agents>)

智能体在工作时会写入其[记忆存储](</docs/zh-CN/managed-agents/memory>)，但这些写入是局部且增量的：经过多次会话后，记忆存储会积累重复、矛盾和过时的条目。

**Dreams** （梦境）让 Claude 来清理这些内容。梦境会读取现有的记忆存储以及过去的会话记录，然后生成一个新的、重新组织的记忆存储：合并重复项，用最新值替换过时或相互矛盾的条目，并发现新的见解。

输入存储永远不会被修改，因此您可以审查输出，如果不满意结果可以将其丢弃。

## 工作原理

**梦境** 是一个异步作业，它接收：

  * 一个预先存在的**记忆存储：** Claude 对其进行验证、去重和重新组织的存储，以及
  * 1 到 100 个**会话：** Claude 从中挖掘模式和见解并整合到输出中的过去记录。

梦境会生成另一个**输出记忆存储** ，与输入存储分开。在梦境开始 `running` 后不久，一旦工作流克隆了输入存储，输出存储 ID 就会出现在梦境的 `outputs` 数组中；处于 `running` 状态的梦境可能会短暂报告一个空的 `outputs` 数组。

## 创建梦境

Python

```
dream = client.beta.dreams.create(
    inputs=[
        {"type": "memory_store", "memory_store_id": store_id},
        {"type": "sessions", "session_ids": [session_a, session_b]},
    ],
    model="claude-opus-5-5",
    instructions="Focus on coding-style preferences; ignore one-off debugging notes.",
)
print(dream.id)  # drm_01...
```

梦境的输入包括预先存在的记忆存储和一个会话数组。您选择的模型负责运行梦境管道。仅支持部分模型。您可以选择传入 `instructions` 来引导梦境过程。请参阅使用指令进行引导。

响应是完整的 `dream` 资源，其 `status: "pending"`：

```json
{
  "type": "dream",
  "id": "drm_01AbCDefGhIjKlMnOpQrStUv",
  "status": "pending",
  "inputs": [
    { "type": "memory_store", "memory_store_id": "memstore_01Hx..." },
    { "type": "sessions", "session_ids": ["sesn_01...", "sesn_02..."] }
  ],
  "outputs": [],
  "model": { "id": "claude-opus-5-5" },
  "instructions": "Focus on coding-style preferences; ignore one-off debugging notes.",
  "session_id": null,
  "created_at": "2026-04-29T17:04:10Z",
  "ended_at": null,
  "archived_at": null,
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_creation_input_tokens": 0
  },
  "error": null
}
```

如果您只有会话记录而没有现有存储，请先[创建一个空的记忆存储](</docs/zh-CN/managed-agents/memory#create-a-memory-store>)，并将其作为 `memory_store` 输入传入。

### 使用指令进行引导

可选的 `instructions` 字段用于引导梦境管道综合哪些内容。它在整个管道中都会生效：仔细阅读哪些内容、合并或丢弃哪些内容，以及如何组织输出存储的结构。

将 `instructions` 用于高层次的综合指导，例如重点领域（"专注于编码风格偏好"）、需要原样保留的内容，或您希望在整个存储中应用的输出约定。该管道是对输入进行的综合处理，而不是作用于存储文本的编辑器，因此针对特定行的命令式指令（"将句子 X 改为 Y"、"修正 Z 部分中的计数"）通常不会产生任何变化。如需对单个记忆进行针对性编辑，请直接对输出存储使用 [Memory Stores API](</docs/zh-CN/managed-agents/memory#view-and-edit-memories>)。

## 跟踪进度

梦境以异步方式运行，通常需要几分钟到几个小时，具体取决于输入记录的数量。按 ID 轮询梦境以检查状态：

Python

```
while dream.status in ("pending", "running"):
    time.sleep(10)
    dream = client.beta.dreams.retrieve(dream.id)
    print(f"status={dream.status} input_tokens={dream.usage.input_tokens}")
```

### 生命周期

`status`| 含义  
---|---  
`pending`| 梦境已成功创建并进入队列。  
`running`| 管道正在处理中。`usage` 会随着工作进展而更新。  
`completed`| 已成功完成。`outputs` 的值即为新的记忆存储。  
`failed`| 梦境运行因错误而结束。输出记忆存储保持原样，包含失败前已写入的所有内容。  
`canceled`| 梦境运行已取消。输出记忆存储保持原样。  
  
### 观察管道运行

一旦梦境处于 `running` 状态，其 `session_id` 字段就会指向运行该管道的底层[会话](</docs/zh-CN/managed-agents/sessions>)。您可以对该会话的[事件](</docs/zh-CN/managed-agents/events-and-streaming>)进行流式传输，以实时观察梦境正在读取和写入的内容。当梦境达到终止状态时，该会话会被归档（而不是删除），因此之后仍可查看其记录。

## 使用输出

当 `status` 达到 `completed` 时，`outputs` 中的 `memory_store` 条目会引用一个已完全填充的存储。它是您工作区中的一个普通记忆存储。使用 [Memory Stores API](</docs/zh-CN/managed-agents/memory#view-and-edit-memories>) 或在 Claude Console 中审查它，然后选择：

  * **使用它：** 在未来的会话中将其作为 `memory_store` 资源附加，以替代（或搭配）输入记忆存储，或
  * **丢弃它：** [删除该记忆存储](</docs/zh-CN/api/beta/memory_stores/delete>)或[归档该记忆存储](</docs/zh-CN/api/beta/memory_stores/archive>)。

Python

```
# 梦境结束后，输出中保存着重建的记忆存储
output_store_id = next(
    output.memory_store_id for output in dream.outputs if output.type == "memory_store"
)

session = client.beta.sessions.create(
    agent=agent_id,
    environment_id=environment_id,
    resources=[
        {"type": "memory_store", "memory_store_id": output_store_id},
    ],
)
```

梦境本身永远不会删除或修改其输入。在 `failed` 或 `canceled` 状态下，输出存储会保留部分内容，以便您检查停止前已生成的内容；如果不需要，请通过 Memory Stores API 将其清理。

当梦境处于 `pending` 或 `running` 状态时，400 保护仅适用于归档梦境本身，而不适用于其存储。在运行期间归档或删除 _输入_ 记忆存储（或删除输入会话）将导致梦境失败，并返回 `input_memory_store_unavailable` 或 `input_session_unavailable`。

## 取消梦境

取消操作会立即将 `pending` 或 `running` 状态的梦境转为 `canceled`。取消一个已处于 `canceled` 状态的梦境是幂等的空操作；取消 `completed` 或 `failed` 状态的梦境会返回 400。

取消后，在进行中的工作逐渐结束期间，梦境的 `usage` 字段可能会在几秒钟内继续更新。如果您需要最终计数，请轮询梦境直到 `usage` 稳定下来。

Python

```
client.beta.dreams.cancel(dream.id)
```

## 归档梦境

归档操作会在已达到终止状态（`completed`、`failed` 或 `canceled`）的梦境上设置 `archived_at`；`status` 保持不变。已归档的梦境不会出现在默认的列表响应中，但仍可按 ID 读取。归档一个已归档的梦境是幂等的空操作。归档 `pending` 或 `running` 状态的梦境会返回 400；请先取消它。不支持取消归档。

Python

```
client.beta.dreams.archive(dream.id)
```

归档梦境不会影响其输出记忆存储；请通过 [Memory Stores API](</docs/zh-CN/managed-agents/memory#view-and-edit-memories>) 单独管理该存储。

## 列出梦境

返回工作区中所有未归档的梦境，按最新优先排序。使用 `limit`（默认 20，最大 100）和 `page` 游标进行分页。将 `include_archived` 设置为 `true` 以包含已归档的梦境。

Python

```
for listed_dream in client.beta.dreams.list(limit=20):
    print(listed_dream.id, listed_dream.status)
```

## 错误

以下是可能出现的梦境错误的非详尽列表。

`error.type`| 发生时机  
---|---  
`timeout`| 管道超出了其运行时间预算。  
`internal_error`| 未分类的管道故障。  
`memory_store_org_limit_exceeded`| 在管道配置工作存储时，您的组织达到了记忆存储数量上限。  
`input_memory_store_too_large`| 输入记忆存储超出了管道的大小限制。  
`input_memory_store_unavailable`| 输入记忆存储在梦境创建后被归档或删除。  
`input_session_unavailable`| 某个输入会话在梦境创建后被删除。  
  
## 计费

梦境按您所选模型的标准 API 令牌费率计费；资源上的 `usage` 会报告确切的总量。成本大致随输入会话的数量和长度线性增长。建议先从一小批会话开始，在对整理质量满意后再扩大规模。

## 限制

在此功能处于研究预览期间，梦境创建适用默认的速率限制。如果您需要更高的限制，请[联系支持团队](<https://support.claude.com>)。

## 可用性

梦境在部分模型上处于研究预览阶段。

### API 支持

状态研究预览

云平台

  * Claude API

模型

  * [Claude Mythos 5.1](</docs/zh-CN/models/mythos-5-1/overview>)不支持
  * [Claude Mythos 5](</docs/zh-CN/models/mythos-5/overview>)不支持
  * Claude Mythos Preview不支持
  * [Claude Haiku 5.5](</docs/zh-CN/models/haiku-5-5/overview>)不支持
  * [Claude Haiku 4.5](</docs/zh-CN/models/haiku-4-5/overview>)不支持
  * [Claude Opus 4.6](</docs/zh-CN/models/opus-4-6/overview>)不支持
  * [Claude Opus 4.5](</docs/zh-CN/models/opus-4-5/overview>)不支持
  * [Claude Sonnet 4.5](</docs/zh-CN/models/sonnet-4-5/overview>)不支持
  * 所有其他模型

### 所需的 beta 请求头

[Beta 请求头概览](</docs/zh-CN/api/beta-headers>)

Beta 请求头让您可以在实验性功能和新模型能力成为标准 API 的一部分之前访问它们。

请求头

  * `managed-agents-2026-04-01`

请求头

  * `dreaming-2026-04-21`

梦境端点需要 `dreaming-2026-04-21` beta 标头。仅凭 `managed-agents-2026-04-01` 标头无法访问梦境。会话调用使用 `managed-agents-2026-04-01`，记忆存储调用使用 `agent-memory-2026-07-22`。SDK 会为每个调用设置正确的标头。

### 数据处理

[数据处理概览](</docs/zh-CN/manage-claude/api-and-data-retention#feature-eligibility>)

适用的端点

  * `/v1/agents`
  * `/v1/sessions`
  * `/v1/environments`

零数据保留不具备资格

会话是有状态的资源；对话记录会一直保留，直到您将其删除。适用于所有 Managed Agents 子功能，包括自托管沙箱。

HIPAA不具备资格

适用于所有 Managed Agents 子功能，包括自托管沙箱。

Was this page helpful?
