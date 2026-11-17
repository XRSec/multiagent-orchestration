---
title: "智能体记忆 (Memory)"
source_url: "https://platform.claude.com/docs/zh-CN/managed-agents/memory"
platform: "Anthropic Claude Managed Agents"
document_type: "Official Reference Specification"
updated_at: "2026-11-01"
---

# 智能体记忆 (Memory)

> **原始来源**: [https://platform.claude.com/docs/zh-CN/managed-agents/memory](https://platform.claude.com/docs/zh-CN/managed-agents/memory)  
> **归属平台**: Claude Managed Agents (托管智能体)

---

[Managed Agents](</docs/zh-CN/managed-agents/overview>)构建持久记忆

# 使用智能体记忆

使用记忆存储为您的智能体提供可跨会话持久保存的记忆。

记忆存储

功能所属
    [Managed Agents](</docs/zh-CN/managed-agents/overview>)

状态
    Beta

云平台
    Claude API可用Claude Platform on AWS可用Claude Models on Google CloudAnthropic managed可用

Beta 请求头
    

  * `agent-memory-2026-07-22`

数据处理
    不具备 ZDR 资格不具备 HIPAA 资格

默认情况下，每个 Managed Agents 会话都以全新的上下文开始。当会话结束时，智能体积累的任何状态都会消失。"Memory store"（记忆存储）让智能体能够跨会话携带信息：用户偏好、项目约定、先前的错误以及领域上下文。

不要在记忆存储请求中将 `agent-memory-2026-07-22` 与 `managed-agents-2026-04-01` 组合使用：同时发送两者会返回 `400` 错误。如果您的代码显式设置了 beta 请求头，请在记忆存储调用中将 `managed-agents-2026-04-01` 替换为 `agent-memory-2026-07-22`，而不是添加第二个值。会话端点（包括将记忆存储附加到会话）仍然使用 `managed-agents-2026-04-01`。

`GET /v1/memory_stores/{memory_store_id}/memories` 在任一请求头下的行为相同：结果以稳定的、由服务器定义的顺序返回，并且 `path_prefix` 和 `depth` 的应用方式相同。

## 概述

**“memory store”（记忆存储）** 是一个工作区范围内、针对 Claude 优化的文本文档集合。当您将存储附加到会话时，它会作为目录挂载到会话的沙箱中。智能体使用与文件系统其他部分相同的文件工具来读写它，并且描述每个挂载的说明会自动添加到系统提示中，告诉智能体去哪里查找。这些交互需要 [agent toolset（智能体工具集）](</docs/zh-CN/managed-agents/tools>)；请确保在[创建智能体](</docs/zh-CN/managed-agents/agent-setup>)时启用它。在[自托管沙箱](</docs/zh-CN/managed-agents/self-hosted-sandboxes-memory>)上，该目录不是实时挂载。相反，您的环境 worker 会在智能体的工具运行之前将每个附加的存储下载到您的沙箱中，并使该副本与存储保持同步。

存储中的每条**记忆** （memory）都通过路径寻址，可以直接通过 API 或 Claude Console 读取和编辑，从而支持调优、导入和导出。

对记忆的每次更改都会创建一个不可变的**记忆版本** （memory version），为智能体写入的所有内容提供审计跟踪和时间点恢复能力。

## 创建记忆存储

为存储提供 `name` 和 `description`。描述会传递给智能体，告诉它该存储包含什么内容。

CLI

```bash
ant apply memory_store.yaml
```

memory_store.yaml

```
# yaml-language-server: $schema=https://platform.claude.com/schemas/ant/beta/memory_store.json
name: User Preferences
description: Per-user preferences and project context.
```

记忆存储的 `id`（`memstore_...`）是您将存储附加到会话时传递的值。

### 预填充内容（可选）

在任何智能体运行之前，为存储预加载参考资料：

Python

```
client.beta.memory_stores.memories.create(
    store.id,
    path="/formatting_standards.md",
    content="All reports use GAAP formatting. Dates are ISO-8601...",
)
```

存储中的单条记忆上限为 100 kB（约 25k 令牌）。一个存储最多可容纳 10,000 条记忆。请将记忆组织为许多小而专注的文件，而不是少数几个大文件。

## 将记忆存储附加到会话

记忆存储在[创建会话](</docs/zh-CN/managed-agents/sessions#creating-a-session>)时通过会话的 `resources` 数组附加。与文件资源不同，记忆存储只能在创建会话时附加；不支持在运行中的会话中添加或移除记忆存储。对于云端环境和[自托管环境](</docs/zh-CN/managed-agents/self-hosted-sandboxes-memory>)上的会话，附加记忆存储的方式相同；自托管环境仅接受 `memory_store` 资源。

您可以选择包含 `instructions`，为智能体应如何使用此存储提供特定于会话的指导。它会与存储的 `name` 和 `description` 一起展示给智能体，上限为 4,096 个字符。

您还可以配置 `access`。它默认为 `read_write`（在以下示例中显式展示），但也支持 `read_only`。

Python

```
session = client.beta.sessions.create(
    agent=agent.id,
    environment_id=environment.id,
    resources=[
        {
            "type": "memory_store",
            "memory_store_id": store.id,
            "access": "read_write",
            "instructions": "User preferences and project context. Check before starting any task.",
        }
    ],
)
```

记忆存储默认以 `read_write` 访问权限附加。如果智能体处理不受信任的输入（用户提供的提示、抓取的网页内容或第三方工具输出），一次成功的提示注入可能会将恶意内容写入存储。之后的会话会将该内容作为受信任的记忆读取。对于参考资料、共享查询数据以及智能体不需要修改的任何存储，请使用 `read_only`。

每个会话最多支持 **8 个记忆存储** 。当记忆的不同部分有不同的所有者或访问规则时，请附加多个存储。常见原因包括：

  * **共享参考资料：** 一个附加到许多会话的只读存储（标准、约定、领域知识），与每个会话自己的读写存储分开
  * **映射到您产品的结构：** 为每个最终用户、团队或项目各设一个存储，同时共享单一的智能体配置
  * **不同的生命周期：** 一个比任何单个会话存续更久的存储，或者您希望按其自身计划进行归档的存储

### 智能体如何访问记忆

每个附加的存储都作为 `/mnt/memory/` 下的一个目录挂载到会话的沙箱中。目录名是存储的显示名称经过清理后得到的文件系统安全 slug（转为小写；连续的非字母数字字符变为单个连字符），因此名为 “Demo Memory” 的存储会挂载在 `/mnt/memory/demo-memory/`。确切路径会在会话的记忆存储资源的 `mount_path` 字段中返回；请从该字段读取，而不要自行构造。智能体使用标准的[智能体工具集](</docs/zh-CN/managed-agents/tools>)读写存储。挂载路径下的写入会持久化回存储，并在共享该存储的会话之间保持同步；写入 `/mnt/memory/` 下任何其他路径都会失败，因为沙箱以只读方式挂载该父目录。每个挂载的简短描述（显示名称、挂载路径、访问模式、存储的 `description` 以及任何 `instructions`）会自动添加到系统提示中。

`access` 在文件系统层面强制执行：`read_only` 挂载会拒绝写入，而对 `read_write` 挂载的写入会生成归属于该会话的记忆版本。

在[自托管沙箱](</docs/zh-CN/managed-agents/self-hosted-sandboxes-memory>)上，每个存储的目录是由 worker 管理的本地副本，而不是实时挂载。worker 会在工具调用之后将每个副本与其存储进行协调，每个同步间隔（默认 15 秒）最多一次，并在会话结束时再进行一次。智能体的 `write` 和 `edit` 工具只更改本地副本；worker 会在下一次同步时上传这些更改，因此在自托管沙箱上运行的另一个会话只有在两个 worker 都完成同步后才能看到更改。在那里，`/mnt/memory/` 下存储目录之外的路径不是临时空间：worker 的文件工具会拒绝写入这些路径，而 shell 命令写入那里的任何内容都不会同步到存储。

对于 `read_only` 存储，worker 的 `write` 和 `edit` 工具会拒绝该目录下的更改，并且 worker 永远不会从中上传任何内容。要了解 worker 如何解决写入冲突，以及 `bash` 工具仍然可以在只读存储的本地副本中更改什么，请参阅[只读存储和冲突](</docs/zh-CN/managed-agents/self-hosted-sandboxes-memory#read-only-stores-and-conflicts>)。

智能体的读写操作会在[事件流](</docs/zh-CN/managed-agents/events-and-streaming>)中显示为普通的 `agent.tool_use` 和 `agent.tool_result` 事件，对应于触及该挂载的任何工具。

## 查看和编辑记忆

记忆存储可以直接通过 API 管理。可用于构建审核工作流、纠正错误记忆，或在任何会话运行之前预填充存储。

### 列出记忆

列出存储中的记忆。结果以稳定的、由服务器定义的顺序返回。

  * `path_prefix` 将列表范围限定到一个目录。它必须以 `/` 结尾，并匹配完整的路径段，因此 `path_prefix=/notes/` 会返回 `/notes/todo.md`，但不会返回 `/notes-archive/todo.md`。
  * `depth` 控制列表在 `path_prefix` 之下深入的层级：省略它（或传入 `0`）会列出整个子树，传入 `1` 则仅列出直接子项。其他值会返回 `400` 错误。

Python

```
page = client.beta.memory_stores.memories.list(
    store.id,
    path_prefix="/",
)
for item in page.data:
    print(item.type, item.path)
```

有关完整参数和响应结构，请参阅[列出记忆](</docs/zh-CN/api/beta/memory_stores/memories/list>)参考文档。

### 读取记忆

获取单条记忆会返回完整内容。

Python

```
retrieved = client.beta.memory_stores.memories.retrieve(
    mem.id,
    memory_store_id=store.id,
)
print(retrieved.content)
```

有关完整参数和响应结构，请参阅[检索记忆](</docs/zh-CN/api/beta/memory_stores/memories/retrieve>)参考文档。

### 创建记忆

`client.beta.memory_stores.memories.create()` 会在给定的 `path` 处创建一条记忆。创建操作不会覆盖已有内容；要更新现有记忆，请使用 `client.beta.memory_stores.memories.update()`。

Python

```
mem = client.beta.memory_stores.memories.create(
    store.id,
    path="/preferences/formatting.md",
    content="Always use tabs, not spaces.",
)
```

有关完整参数和响应结构，请参阅[创建记忆](</docs/zh-CN/api/beta/memory_stores/memories/create>)参考文档。

### 更新记忆

`client.beta.memory_stores.memories.update()` 按 ID 修改现有记忆。您可以更改 `content`、`path`（即重命名），或两者都更改。以下示例将一条记忆重命名到归档路径：

Python

```
client.beta.memory_stores.memories.update(
    mem.id,
    memory_store_id=store.id,
    path="/archive/2026_q1_formatting.md",
)
```

有关完整参数和响应结构，请参阅[更新记忆](</docs/zh-CN/api/beta/memory_stores/memories/update>)参考文档。

#### 安全的内容编辑（乐观并发）

为避免覆盖并发写入，请传入 `content_sha256` 前置条件。只有当存储的内容哈希仍与您读取时的哈希匹配时，更新才会生效；如果不匹配，请重新读取记忆，并基于最新状态重试。

Python

```
client.beta.memory_stores.memories.update(
    memory_id=mem.id,
    memory_store_id=store.id,
    content="CORRECTED: Always use 2-space indentation.",
    precondition={"type": "content_sha256", "content_sha256": mem.content_sha256},
)
```

### 删除记忆

Python

```
client.beta.memory_stores.memories.delete(
    mem.id,
    memory_store_id=store.id,
)
```

有关完整参数和响应结构，请参阅[删除记忆](</docs/zh-CN/api/beta/memory_stores/memories/delete>)参考文档。

## 审计记忆更改

对记忆的每次变更都会创建一个不可变的**记忆版本** （`memver_...`）。使用版本端点可以审计谁在何时更改了什么、检查或恢复先前的快照，以及通过脱敏（redact）从历史记录中清除敏感内容。

版本属于存储（而非单条记忆），并且在记忆本身被删除时不会被删除，因此审计跟踪也涵盖已删除的记忆，但须遵守后文所述的保留规则。版本在写入后保留 30 天；不过，活动记忆的近期版本无论时间多久都会始终保留，因此不常更改的记忆可能会保留超过 30 天的历史记录。实时的 `client.beta.memory_stores.memories.retrieve()` 调用始终返回最新版本；版本端点则为您提供保留的历史记录。

没有专门的恢复端点；要回滚，请检索您想要的版本，并使用 `client.beta.memory_stores.memories.update()` 将其 `content` 写回（如果父记忆已被删除，则使用 `client.beta.memory_stores.memories.create()`，前提是您想要的版本仍被保留）。

过去的记忆版本可能会在 30 天后被删除。要更长时间地保留记忆历史，请通过 API 导出版本。

### 列出版本

列出存储的版本历史，最新的在前。以下示例筛选出单条记忆的历史：

Python

```
versions = client.beta.memory_stores.memory_versions.list(
    store.id,
    memory_id=mem.id,
)
for version in versions:
    print(f"{version.id}: {version.operation}")

version_id = versions.data[1].id
```

有关完整参数和响应结构，请参阅[列出记忆版本](</docs/zh-CN/api/beta/memory_stores/memory_versions/list>)参考文档。

### 检索版本

获取单个版本会返回与列表响应相同的字段，外加完整的 `content` 正文。

Python

```
version = client.beta.memory_stores.memory_versions.retrieve(
    version_id,
    memory_store_id=store.id,
)
print(version.content)
```

有关完整参数和响应结构，请参阅[检索记忆版本](</docs/zh-CN/api/beta/memory_stores/memory_versions/retrieve>)参考文档。

### 脱敏版本

脱敏会从历史版本中清除内容，同时保留审计跟踪（谁在何时做了什么）。可将其用于合规工作流，例如移除泄露的密钥、个人身份信息（PII）或处理用户删除请求。

作为活动记忆当前头部的版本无法被脱敏。请先写入一个新版本（或删除该记忆），然后再对旧版本进行脱敏。

Python

```
client.beta.memory_stores.memory_versions.redact(
    version_id,
    memory_store_id=store.id,
)
```

有关完整参数和响应模式，请参阅[脱敏记忆版本参考](</docs/zh-CN/api/beta/memory_stores/memory_versions/redact>)。

## 管理记忆存储

除了 [`create`](</docs/zh-CN/api/beta/memory_stores/create>) 之外，记忆存储还支持 [`retrieve`](</docs/zh-CN/api/beta/memory_stores/retrieve>)、[`update`](</docs/zh-CN/api/beta/memory_stores/update>)、[`list`](</docs/zh-CN/api/beta/memory_stores/list>)、[`archive`](</docs/zh-CN/api/beta/memory_stores/archive>) 和 [`delete`](</docs/zh-CN/api/beta/memory_stores/delete>)。

### 列出存储

列出工作区中的存储。默认情况下不包括已归档的存储；将 `include_archived` 设置为 `true` 即可包含它们。

Python

```
for memory_store in client.beta.memory_stores.list(include_archived=True):
    print(memory_store.id, memory_store.name, memory_store.archived_at)
```

有关完整参数和响应结构，请参阅[列出记忆存储](</docs/zh-CN/api/beta/memory_stores/list>)参考文档。

### 归档存储

归档会使存储变为只读，并阻止其被附加到新会话。归档是单向的；没有取消归档操作。

Python

```
client.beta.memory_stores.archive(store.id)
```

有关完整参数和响应结构，请参阅[归档记忆存储](</docs/zh-CN/api/beta/memory_stores/archive>)参考文档。

要[永久删除存储](</docs/zh-CN/api/beta/memory_stores/delete>)及其所有记忆和版本，请调用 `client.beta.memory_stores.delete()`。

## 记忆管理最佳实践

当存储达到 10,000 条记忆的上限时，写入新记忆的操作会失败：包括直接的 `client.beta.memory_stores.memories.create()` 调用，以及智能体对未映射路径的文件写入。现有记忆仍可读取和编辑。以下实践可帮助您远低于该上限，并在达到上限时从容恢复。

  * **使用专注的存储。** 与其使用一个大型通用存储，不如使用更小的专用存储：每个用户一个，共享领域知识一个，项目特定上下文一个。每个存储都有各自 10,000 条记忆的上限，因此限定存储范围可以降低任何单个存储被填满的可能性。

  * **在存储填满之前进行精简或清理。** 使用 `client.beta.memory_stores.memories.delete()` 删除过时或冗余的记忆。您还可以运行一个[梦境会话](</docs/zh-CN/managed-agents/dreams>)，它会将零散的内容整合到一个单独的新输出存储中，而不是修改原始存储。将您的会话切换到该输出存储，然后归档或删除原始存储。

  * **在合适的时候附加新存储。** 如果某个存储已经超出其有用范围，请为新内容附加一个全新的存储，并以 `read_only` 访问权限附加原始存储。智能体可以从两者读取，同时只写入新存储。

  * **在适当的情况下限制写入权限。** 仅读取共享参考资料的会话不需要 `read_write`。将写入权限限定在实际添加新记忆的会话上，可以更容易地追踪增长的来源。

## 可用性

记忆存储在所有模型上处于 beta 阶段。

### API 支持

状态Beta

云平台

  * Claude API

在记忆存储调用中同时发送 `managed-agents-2026-04-01` 和 `agent-memory-2026-07-22` 会返回 400 错误。

状态Beta

云平台

  * [Claude Platform on AWS](</docs/zh-CN/build-with-claude/claude-platform-on-aws>)

在 Claude Platform on AWS 上，自托管环境中的会话无法附加记忆存储。在记忆存储调用中同时发送 `managed-agents-2026-04-01` 和 `agent-memory-2026-07-22` 会返回 400 错误。

状态Beta

云平台

  * [Claude Models on Google Cloud](</docs/zh-CN/build-with-claude/claude-models-on-google-cloud/anthropic-managed>)Anthropic managed

在 Claude Models on Google Cloud (Anthropic managed) 上，自托管环境中的会话不支持记忆存储。在记忆存储调用中同时发送 `managed-agents-2026-04-01` 和 `agent-memory-2026-07-22` 会返回 400 错误。

### 所需的 beta 请求头

[Beta 请求头概览](</docs/zh-CN/api/beta-headers>)

Beta 请求头让您可以在实验性功能和新模型能力成为标准 API 的一部分之前访问它们。

请求头

  * `agent-memory-2026-07-22`

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
