---
doc_id: SPEC-GROUPCHAT-MCP-10
status: CURRENT
version: 1.0.0
last_verified: 2026-11-10
language: zh-CN
description: 多智能体群聊系统黑板物理存储 (SQLite WAL)、服务端透明自增 CAS 乐观并发控制、单向有限状态转移机与黑板 MCP 工具协议契约原子规范。
type: ARCHITECTURE_ATOM_SPEC
parent_node: INDEX.md
target: LLM_AND_HUMAN_ENGINEERS
sources:
  - docs/standards/documentation-standards.md
  - docs/architecture/companion-groupchat-blackboard-v4-production-full-spec.md
  - docs/protocols/orchestrator-mcp.md
  - src/daemon/blackboard/BlackboardStore.ts
  - src/daemon/blackboard/blackboardMcp.ts
  - src/daemon/blackboard/types.ts
  - src/daemon/blackboard/lifecycleHooks.ts
  - src/storage/StorageManager.ts
  - src/storage/DatabaseSchema.ts
  - test/blackboard-atomic.test.ts
---

# [0] ROOT: 黑板物理存储 (SQLite WAL) 与 MCP 工具协议契约规范 (Blackboard Storage DDL & MCP Protocols)

## [1] 规范背景与底层物理真相 (Physical Reality of Blackboard Storage)

### 1.1 跨进程内存失忆陷阱 (Anti-Amnesia Invariant)

在构建生产级多智能体软件研发流水线时，系统面临的核心物理挑战是执行器生命周期的短暂性与操作系统的进程隔离：

1. **Harness 派生执行模型**：
   依据 `@anthropic-ai/claude-agent-sdk` 的底层物理实现，宿主编排器通过 Node.js 原生 `child_process.spawn()` 唤起独立的 `claude`（或 `claude.exe`）可执行文件。宿主与智能体之间仅依靠标准输入输出流（`stdin`/`stdout`/`stderr`）通过 JSON-RPC 流交换事件（模块：`src/daemon/orchestrator/ClaudeSdkRunner.ts`，类：`ClaudeSdkRunner`）。
2. **短暂生命周期与内存蒸发**：
   每一次子智能体执行完成（如 `moCode` 完成单次编码，或 `moCI` 提交测试判决），该操作系统进程立即退出并释放所有堆栈内存。如果黑板状态存储在 Node.js 宿主的全局闭包、内存对象（如 `Map`）或未落盘缓存中，一旦宿主重启、崩溃或调度到其他工作节点，整个群聊的工程进度、根目标与 Backlog 状态将遭遇不可逆的彻底丢失（跨进程内存失忆陷阱）。
3. **物理存储底座的必然性**：
   必须引入由操作系统内核文件系统与 ACID 事务保障的强一致性物理存储底座。Node.js 原生内置的 `node:sqlite`（`DatabaseSync`）以零外部 C++ 原生编译依赖、微秒级读写延迟与高可靠并发 WAL 模式（Write-Ahead Logging），成为多进程强一致共享黑板（Single Source of Truth, SSOT）的物理底座（模块：`src/daemon/blackboard/BlackboardStore.ts`，类：`BlackboardStore`）。

### 1.2 为什么必须脱离 LLM 维护版本号：服务端透明自增 (Transparent Incremental Versioning)

在理论设计中，常要求大语言模型（LLM）在调用黑板工具时显式传入 `expectedVersion`（即客户端驱动的乐观并发控制）。实践证明，这是将基础设施底层的并发控制职责错配给概率模型：

- **大模型认知幻觉**：LLM 本质为自回归概率序列生成器，在长文本多轮对话中无法可靠维护单调递增的毫秒级整数版本号，极易出现错位计算（Off-by-one）、记忆混淆或自发编造；
- **重试风暴与资源击穿**：若版本校验失败导致调用被拒，大模型往往在未同步最新状态前盲目重试，引发重试风暴（Retry Storm），不仅白白消耗成千上万调度 Tokens，更造成协作管线假死；
- **服务端透明接管原则 (Server-Side Transparent Increment Invariant)**：
  智能体仅需声明业务意图（如“将任务状态更新为 `IN_REVIEW`，提交变更摘要”）。宿主 MCP 工具服务在 SQLite 事务内自动获取行锁，原子比对当前版本并执行 `version = version + 1`，将乐观锁机制透明封装在服务端内部（模块：`src/daemon/blackboard/blackboardMcp.ts`，函数：`createBlackboardMcpServer`）。

### 1.3 核心设计目标与硬性约束指标

| 指标维度 | 目标约束值 | 验证来源与基准 |
| :--- | :--- | :--- |
| **持久化单次写入延迟** | $\le 5\text{ ms}$ (平均实测 $2.15\text{ ms}$) | 实测命令：`npm exec tsx test/blackboard-atomic.test.ts` (2026-11-10) |
| **内存投影读取延迟** | $\le 1\text{ ms}$ (平均实测 $0.11\text{ ms}$) | 实测命令：`npm exec tsx test/blackboard-atomic.test.ts` (2026-11-10) |
| **黑板切片 Token 硬预算** | 恒定 $\le 1,400\text{ Tokens}$ | 静态约束：`TOKEN_LIMITS` 规范（设计目标，非动态超限） |
| **调度网络 Token 开销** | $0\text{ Token}$ | 原生 TypeScript 状态机替代 LLM Facilitator |
| **并发事务死锁率** | $0$ 死锁 (通过 `BEGIN IMMEDIATE` 物理排他) | 事务机制保障：SQLite WAL 锁升级防御 |

---

## [2] SQLite WAL 存储引擎与物理表结构 DDL (Physical Schema DDL)

### 2.1 WAL 并发模式与核心 PRAGMA 参数解析

黑板数据库物理存储文件位于 `<projectRoot>/data/blackboard_ssot.db`。初始化连接时，必须原子配置以下 PRAGMA 参数（模块：`src/daemon/blackboard/BlackboardStore.ts`，方法：`initPragmasAndTables`）：

```sql
-- 1. 启用 WAL 日志模式：实现读写分离，读者不阻塞写者，写者不阻塞读者
PRAGMA journal_mode = WAL;

-- 2. 同步级别设为 NORMAL：在 WAL 模式下保证进程崩溃不损坏数据库，且比 FULL 模式减少 90% 的 fsync 磁盘 I/O 阻塞
PRAGMA synchronous = NORMAL;

-- 3. 忙等待超时设为 5000ms：多进程发生写锁竞争时，内核级退避等待最多 5 秒，杜绝瞬时锁冲突直接报错
PRAGMA busy_timeout = 5000;

-- 4. 临时数据放入内存：中间查询与临时索引在进程内存中构建，避免生成额外磁盘临时文件
PRAGMA temp_store = MEMORY;

-- 5. 启用外键完整性约束
PRAGMA foreign_keys = ON;
```

### 2.2 核心物理表 DDL 设计

系统存储层定义了三大核心实体物理表：`blackboard_records`（黑板活动状态实体表）、`blackboard_revisions`（不可变修订历史表）与 `group_turns`（群聊轮次执行表）：

```sql
-- ============================================================================
-- 1. 黑板活动状态实体表 (blackboard_records)
-- 作用：维护当前群聊房间/命名空间的单一事实源 (SSOT) 实时状态
-- ============================================================================
CREATE TABLE IF NOT EXISTS blackboard_records (
    id TEXT PRIMARY KEY,                       -- 唯一标识符，单房间模式下固定为 'default_ssot'
    room_id TEXT NOT NULL,                     -- 绑定的群聊房间 ID，外键关联 rooms(id)
    version INTEGER NOT NULL DEFAULT 1,        -- 服务端单调自增版本号 (CAS 基础)
    root_goal_json TEXT NOT NULL DEFAULT '{}', -- 作用域 1: 根目标与不可变红线规则
    kanban_json TEXT NOT NULL DEFAULT '{}',    -- 作用域 2 & 3: 看板任务 (activeTask 与 backlog)
    environment_json TEXT NOT NULL DEFAULT '{}',-- 运行环境、分支与触达文件清单
    sliding_digest_json TEXT NOT NULL DEFAULT '[]', -- 作用域 4: K=2 滚动历史提炼切片
    audit_json TEXT NOT NULL DEFAULT '{}',     -- 作用域 5: 最新质检判决与审计事件
    payload_hash TEXT,                         -- SHA-256 停滞检测内容指纹
    created_at TEXT NOT NULL,                  -- ISO-8601 创建时间戳
    updated_at TEXT NOT NULL                   -- ISO-8601 更新时间戳
);

-- ============================================================================
-- 2. 不可变黑板修订历史表 (blackboard_revisions)
-- 作用：全量记录每次状态变异的快照、操作者与差异，提供点对点软回溯 (Soft-Rewind)
-- ============================================================================
CREATE TABLE IF NOT EXISTS blackboard_revisions (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,     -- 单调递增修订流水号
    blackboard_id TEXT NOT NULL,               -- 关联的黑板 ID
    version INTEGER NOT NULL,                  -- 本次修订产出的目标版本号
    actor TEXT NOT NULL,                       -- 变异发起者 (如 'moCode', 'moCI:Reviewer', 'moAdmin:Distiller')
    action TEXT NOT NULL,                      -- 变异动作 (如 'CREATE_TASK', 'TRANSITION_IN_REVIEW', 'VERDICT_REJECTED')
    detail TEXT NOT NULL,                      -- 人类可读的审计摘要 (截断至 500 字符内)
    state_snapshot_json TEXT NOT NULL,         -- 完整黑板快照 JSON 字符串 (供历史还原)
    created_at TEXT NOT NULL,                  -- ISO-8601 修订时间戳
    FOREIGN KEY(blackboard_id) REFERENCES blackboard_records(id) ON DELETE CASCADE
);

-- ============================================================================
-- 3. 群聊轮次与执行日志表 (group_turns)
-- 作用：记录群聊中各 Agent/User 的发言轮次与黑板状态的精确对齐拓扑
-- ============================================================================
CREATE TABLE IF NOT EXISTS group_turns (
    turn_id TEXT PRIMARY KEY,                  -- 轮次全局唯一标识符 (UUID)
    room_id TEXT NOT NULL,                     -- 房间 ID
    sequence INTEGER NOT NULL,                 -- 房间内严格单调自增逻辑时钟
    speaker_id TEXT NOT NULL,                  -- 发言者 ID (如 'bot_mocode_engine_01')
    speaker_role TEXT NOT NULL,                -- 角色 (user, assistant, system, steering)
    quoted_message_ids TEXT DEFAULT '[]',      -- 引用的上下文消息 ID 数组 JSON
    blackboard_version INTEGER NOT NULL,       -- 本轮发言时所锚定的黑板版本号
    token_usage_json TEXT DEFAULT '{}',        -- 消耗的 prompt/completion/cached token 统计
    turn_status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(turn_status IN ('RUNNING', 'COMPLETED', 'FAILED', 'ABORTED')),
    created_at INTEGER NOT NULL,               -- 毫秒级 Unix 时间戳
    FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
);
```

### 2.3 生产单表 SSOT 优化拓扑 (`blackboard_ssot` 与 `blackboard_audit_log`)

在实际守护进程的单实例微内核场景中（模块：`src/daemon/blackboard/BlackboardStore.ts`），为追求极致的 `< 0.2ms` 读取性能并避免复杂的多表 JOIN，系统采用了高性能单表行存储模型：

```sql
-- 生产单表 SSOT 物理表定义
CREATE TABLE IF NOT EXISTS blackboard_ssot (
    id INTEGER PRIMARY KEY CHECK (id = 1),     -- 强制单行约束，只允许一行全局状态
    version INTEGER NOT NULL,                  -- 单调递增版本号
    state_json TEXT NOT NULL,                  -- 完整 BlackboardState 序列化 JSON
    updated_at TEXT NOT NULL                   -- ISO-8601 更新时间戳
);

-- 生产审计流水表定义
CREATE TABLE IF NOT EXISTS blackboard_audit_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    state_snapshot_json TEXT,                  -- 完整历史快照
    created_at TEXT NOT NULL
);
```

**拓扑映射关系**：
- `blackboard_ssot.state_json` 聚合了 `root_goal`、`kanban`、`environment`、`slidingDigest` 与 `audit` 五大作用域；
- `blackboard_audit_log` 与 `blackboard_revisions` 结构同构，单调递增流水线支持秒级审计与无损历史回溯。

### 2.4 索引策略与微秒级点查性能保障

```sql
-- 1. 黑板修订历史版本查询索引 (用于按版本快速回溯)
CREATE INDEX IF NOT EXISTS idx_blackboard_revisions_ver 
ON blackboard_revisions(blackboard_id, version);

-- 2. 黑板修订历史时间戳索引 (用于 rollbackStateBefore 快速定位时间窗口)
CREATE INDEX IF NOT EXISTS idx_blackboard_revisions_time 
ON blackboard_revisions(blackboard_id, created_at);

-- 3. 生产审计表时间戳逆序索引
CREATE INDEX IF NOT EXISTS idx_audit_log_created_seq 
ON blackboard_audit_log(created_at DESC, seq DESC);

-- 4. 群聊轮次序列索引 (用于消息增量切片同步)
CREATE INDEX IF NOT EXISTS idx_group_turns_room_seq 
ON group_turns(room_id, sequence);
```

---

## [3] 服务端透明自增 CAS 乐观锁与并发控制 (CAS Optimistic Concurrency Control)

### 3.1 传统 LLM 乐观锁的认知幻觉与重试风暴

```mermaid
sequenceDiagram
    autonumber
    actor LLM as 智能体 (Agent LLM)
    participant Host as 宿主 MCP 服务
    participant SQLite as SQLite WAL 存储引擎

    Note over LLM, SQLite: 传统错误范式：LLM 显式维护 expectedVersion
    LLM->>Host: write_blackboard(expectedVersion=3, payload)
    Host->>SQLite: 比对当前版本 (此时数据库实际为 v4)
    SQLite-->>Host: 校验失败: Version Mismatch (v4 != v3)
    Host-->>LLM: Error: expectedVersion 3 is stale, current is 4
    Note over LLM: LLM 陷入重试风暴，重新读取、重新推理、消耗大量 Token
    
    Note over LLM, SQLite: 生产标准范式：服务端透明原子 CAS (v4.0)
    LLM->>Host: update_task_status(taskId="T-1", newStatus="IN_REVIEW", summary="...")
    Host->>SQLite: BEGIN IMMEDIATE TRANSACTION
    Host->>SQLite: 读取当前状态 (v4) 并进行状态机合法性校验
    Host->>SQLite: 状态变更, version 自动变更为 5 (v4 + 1)
    Host->>SQLite: 写入 blackboard_ssot & 插入 blackboard_audit_log
    Host->>SQLite: COMMIT TRANSACTION
    Host-->>LLM: 成功：工单已迁移至 IN_REVIEW (黑板版本 v5)
```

### 3.2 宿主原子 CAS 与排他事务 (`BEGIN IMMEDIATE TRANSACTION`)

在多进程（如 `moCode`、`moCI`、后台定时健康检查）并发访问 SQLite 时，默认的 `BEGIN DEFERRED` 事务会引入致命死锁漏洞：
1. 事务 A 执行 `BEGIN DEFERRED` 并执行 `SELECT` 读取黑板；
2. 事务 B 几乎同时执行 `BEGIN DEFERRED` 并执行 `SELECT` 读取黑板；
3. 事务 A 准备更新，尝试将共享读锁升级为排他写锁（`RESERVED` 锁）；
4. 事务 B 同样准备更新，尝试升级为排他写锁；
5. 由于两个事务均持有未释放的共享读锁，双方互相等待对方释放，SQLite 立即抛出 `SQLITE_BUSY: database is locked` 死锁异常。

**生产硬性规范**：
所有写操作必须使用 `BEGIN IMMEDIATE;`。`BEGIN IMMEDIATE` 会在语句开始执行的瞬间原子夺取 `RESERVED` 锁。此时其他并发写事务会被挂起等待（在 `PRAGMA busy_timeout = 5000` 阈值内排队），而所有并发读事务仍可不受影响地从 WAL 日志中读取一致性视图，彻底杜绝死锁与锁升级竞争。

### 3.3 事务执行伪代码与错误回滚时序

在 `BlackboardStore.ts`（类：`BlackboardStore`，方法：`mutate`）中实现的原子变异控制流：

```typescript
public mutate(
  actor: string,
  action: string,
  mutator: (draft: BlackboardState) => string
): BlackboardState {
  // 1. 原子获取 RESERVED 写锁，杜绝锁升级死锁
  this.db.exec('BEGIN IMMEDIATE;');
  try {
    // 2. 读取当前版本与状态
    const current = this.readState();
    
    // 3. 执行内存变异器，返回审计摘要信息
    const auditDetail = mutator(current);
    
    // 4. 服务端透明版本自增 (CAS 核心)
    current.version += 1;
    current.updatedAt = new Date().toISOString();
    const serialized = JSON.stringify(current);

    // 5. 原子双写：更新活动黑板状态
    const updateStmt = this.db.prepare(
      'UPDATE blackboard_ssot SET version = ?, state_json = ?, updated_at = ? WHERE id = 1'
    );
    updateStmt.run(current.version, serialized, current.updatedAt);

    // 6. 原子双写：插入不可变历史修订日志与状态快照
    const auditStmt = this.db.prepare(
      'INSERT INTO blackboard_audit_log (version, actor, action, detail, state_snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    auditStmt.run(
      current.version,
      actor,
      action,
      auditDetail.slice(0, 500),
      serialized,
      current.updatedAt
    );

    // 7. 提交事务，写入 WAL
    this.db.exec('COMMIT;');
    return current;
  } catch (err) {
    // 8. 发生任何校验失败或断言异常，坚决回滚
    this.db.exec('ROLLBACK;');
    throw err;
  }
}
```

---

## [4] 单向有限状态转移机与防御机制 (Unidirectional FSM & Defensive Guards)

### 4.1 任务生命周期状态转移矩阵 (`LEGAL_TRANSITIONS`)

为防止模型在长程推理中发生“幻觉越级”（例如跳过编码直接完成，或在未通过测试时篡改结果），系统在数据持久层内置了单向状态转移矩阵校验（模块：`src/daemon/blackboard/blackboardMcp.ts`，符号：`validTransitions`）：

```
+----------------------------------------------------------------------------------------------------+
|                                    任务有限状态单向转移图谱                                           |
+----------------------------------------------------------------------------------------------------+
|  源状态 (Source)       | 允许的目标状态 (Legal Targets)           | 触发角色 (Actor) & 业务含义              |
+------------------------+-----------------------------------------+-----------------------------------------+
|  PENDING_INTENT        | TODO, IN_PROGRESS                       | moAdmin 意图提炼完成或 0ms 快速直通     |
|  TODO                  | IN_PROGRESS                             | moCode 认领工单并启动开发               |
|  IN_PROGRESS           | IN_REVIEW, BLOCKED_NEED_HUMAN           | moCode 提交代码审查或遇到不可抗力挂起   |
|  IN_REVIEW             | VERIFIED, REJECTED, BLOCKED_NEED_HUMAN  | moCI 质检裁决通过/驳回/熔断             |
|  REJECTED              | IN_PROGRESS                             | moCode 认领驳回意见并进入修复阶段       |
|  CROSS_AUDIT           | IN_PROGRESS, BLOCKED_NEED_HUMAN         | moAdmin 介入仲裁测试有效性后重新派发    |
|  VERIFIED              | DONE (COMPLETED)                        | moDoc 归档历史沉淀进入下一 Epoch        |
|  DONE                  | (终态，无后续迁移)                      | 本任务生命周期完结                      |
|  BLOCKED_NEED_HUMAN    | TODO, IN_PROGRESS                       | 仅允许人类通过控制台或干预指令恢复      |
+----------------------------------------------------------------------------------------------------+
```

```mermaid
stateDiagram-v2
    [*] --> PENDING_INTENT: 用户提交指令
    PENDING_INTENT --> TODO: 意图提炼入库 (moAdmin)
    PENDING_INTENT --> IN_PROGRESS: 0ms FastPath 直通 (指令直通)
    
    TODO --> IN_PROGRESS: 认领任务开发 (moCode)
    
    IN_PROGRESS --> IN_REVIEW: 提交审查 (moCode)
    IN_PROGRESS --> BLOCKED_NEED_HUMAN: 外部资源不可达挂起
    
    IN_REVIEW --> VERIFIED: 质检通过 (moCI: VERIFIED)
    IN_REVIEW --> REJECTED: 质检驳回 (moCI: Retry 1)
    IN_REVIEW --> CROSS_AUDIT: 质检驳回 (moCI: Retry 2)
    IN_REVIEW --> BLOCKED_NEED_HUMAN: 触发熔断 (moCI: Retry >= 3 或 停滞 >= 2)
    
    REJECTED --> IN_PROGRESS: 定向修复 (moCode)
    CROSS_AUDIT --> IN_PROGRESS: 测试用例修正后重跑 (moAdmin)
    CROSS_AUDIT --> BLOCKED_NEED_HUMAN: 仲裁失败熔断 (moAdmin)
    
    VERIFIED --> DONE: 归档入滑动窗口 (moDoc: commit_digest)
    DONE --> [*]: 激活 Backlog 下一任务
    
    BLOCKED_NEED_HUMAN --> TODO: 人工介入解除阻断并重置
```

### 4.2 非法状态跃迁物理阻断与纠偏反馈

若智能体通过工具发起不合法迁移（例如在 `TODO` 状态直接调用 `update_task_status(IN_REVIEW)`），底层将阻断操作并不推进版本号，返回标准化结构化错误纠偏：

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "非法状态迁移：禁止从 TODO 直接跳变至 IN_REVIEW。合法目标状态为: [IN_PROGRESS]。请先认领任务并进入开发中状态。"
    }
  ]
}
```

### 4.3 SHA-256 内容指纹与停滞检测算法 (Stall Detection)

为防御 Agent 陷入认知死循环（反复提交一字不差的失败代码或口水话摘要），系统在 `update_task_status` 内部集成了基于 SHA-256 的确定性停滞检测引擎：

$$\text{hash}_t = \text{SHA256}(\text{trim}(\text{summary}))$$

```typescript
const currentHash = crypto.createHash('sha256').update(summary.trim()).digest('hex');
if (newStatus === 'IN_REVIEW' && task.outputHash === currentHash) {
  task.stagnationCount += 1;
} else if (newStatus === 'IN_REVIEW') {
  task.outputHash = currentHash;
}

// 停滞阻断阈值：连续两次输出无实质变化的相同摘要，立即熔断
if (task.stagnationCount >= 2) {
  task.status = 'BLOCKED_NEED_HUMAN';
  return `Task ${task.id} circuit breaker tripped: stagnation detected (hash=${currentHash.slice(0, 8)})`;
}
```

### 4.4 三级阶梯式质量仲裁与防死锁熔断时序 (Three-Tier Quality Ladder)

针对 Coder 与 QA 之间常见的乒乓死锁（由于测试用例自身断言过严、Mock 过期或端口冲突导致反复打回），系统通过三级阶梯仲裁保障进度：

1. **Level 1: 定向修复 (rejectionCount = 1)**：
   - 状态迁移为 `REJECTED`，责任人切回 `moCode`；
   - 提取最新失败详情（`reproCommand`、`errorSnippet`、`failureType`）注入黑板 `audit.lastVerdict`；
   - `moCode` 读取增量上下文执行快速针对性修复。
2. **Level 2: 交叉复审 (rejectionCount = 2)**：
   - 状态迁移为 `CROSS_AUDIT`，代码变更冻结；
   - 调度权交由 `moAdmin` 介入审查测试用例自体完备性（验证测试脚本是否存在端口硬编码、环境变量未隔离等假失败问题）；
   - `moAdmin` 完成仲裁后写入 `testIntegrityNote` 并将状态重置为 `TODO` 恢复执行。
3. **Level 3: 安全熔断 (rejectionCount >= 3)**：
   - 状态直接强制置为 `BLOCKED_NEED_HUMAN`；
   - 固化当前工作树快照，前端渲染阻断卡片，彻底避免 API Token 额度在循环中被刷爆。

---

## [5] 黑板 MCP 工具协议契约 JSON Schema (Blackboard MCP Protocols)

MCP 工具服务由 `src/daemon/blackboard/blackboardMcp.ts` 导出，挂载至 Claude Agent SDK 的运行上下文中。

### 5.1 受限投影读取工具：`read_blackboard` (别名 `read_slice`)

#### 5.1.1 接口语义与五大投影视图
为杜绝向每个角色无差别倾倒全量黑板导致的 Token 浪费与注意分散，工具支持按角色请求最小化切片：
- `coder_view`: 根目标、当前活动任务、触达文件、最新质检失败上下文与最近 1 条阶段沉淀；
- `qa_view`: 架构不变红线、当前任务验收准则、触达文件清单、过往被驳回次数；
- `distiller_view`: 根目标、活动任务、Backlog 清单、历史滑动窗口与环境参数；
- `scribe_view`: 当前活动任务、最新质检判决、触达文件、K=2 滑动摘要；
- `all`: 完整未切片状态（保留用于管理审计）。

#### 5.1.2 五大作用域 1,400 Tokens 精准预算装配算法
黑板切片总预算严格受控于数学公式：

$$\text{Total Tokens} = T_{\text{root}} (\le 150) + T_{\text{kanban}} (\le 350) + T_{\text{active}} (\le 500) + T_{\text{digest}} (\le 250) + T_{\text{audit}} (\le 150) \le 1,400$$

#### 5.1.3 JSON Schema 规范
```json
{
  "name": "read_blackboard",
  "description": "按需读取共享黑板受限视图投影，严格遵守 1,400 Tokens 预算切片。支持角色化定制视图。",
  "parameters": {
    "type": "object",
    "properties": {
      "projection": {
        "type": "string",
        "enum": ["all", "coder_view", "qa_view", "distiller_view", "scribe_view"],
        "default": "coder_view",
        "description": "按当前智能体角色选择最小化上下文投影视图"
      }
    },
    "required": ["projection"]
  }
}
```

### 5.2 任务创建与根目标锁定工具：`write_blackboard` (别名 `create_task`)

#### 5.2.1 接口语义
仅允许 `moAdmin`（Distiller 阶段）调用。首轮调用可原子初始化并**锁定**全局根目标与不可变架构红线（`rootGoal.locked = true`）。一旦锁定，后续任何工具调用均无法再篡改根目标，杜绝目标漂移（Goal Drift）。

#### 5.2.2 JSON Schema 规范
```json
{
  "name": "write_blackboard",
  "description": "moAdmin 专用：初始化全局根目标（仅限首轮锁定）并向黑板看板写入标准工程工单。",
  "parameters": {
    "type": "object",
    "required": ["taskId", "title", "specification", "acceptanceCriteria"],
    "properties": {
      "rootObjective": {
        "type": "string",
        "maxLength": 300,
        "description": "首轮必填：全局架构北极星目标 (上限 300 字符)"
      },
      "invariants": {
        "type": "array",
        "items": { "type": "string", "maxLength": 120 },
        "maxItems": 5,
        "description": "核心架构不可变红线规则列表 (最多 5 条，每条上限 120 字符)"
      },
      "taskId": {
        "type": "string",
        "pattern": "^TASK-[0-9]{3,}$",
        "description": "工单唯一规范编号，如 TASK-101"
      },
      "title": {
        "type": "string",
        "maxLength": 100,
        "description": "工单一句话核心主旨"
      },
      "specification": {
        "type": "string",
        "maxLength": 600,
        "description": "消歧后的精确技术规格、接口契约与文件路径约束"
      },
      "acceptanceCriteria": {
        "type": "string",
        "maxLength": 300,
        "description": "确定性的自动化测试命令或客观断言准则"
      }
    }
  }
}
```

### 5.3 状态与进度更新工具：`update_task_status`

#### 5.3.1 接口语义
`moCode` 专属工具。用于将工单流转为 `IN_PROGRESS` 或完成修改后提交为 `IN_REVIEW`。调用时服务端自动提取文件变更列表并触发路径折叠，摘要严格限制在 300 字符以内，严禁粘贴长代码块。

#### 5.3.2 JSON Schema 规范
```json
{
  "name": "update_task_status",
  "description": "moCode 专用：认领活动工单(IN_PROGRESS)或提交代码改动进入质检(IN_REVIEW)。服务端自动执行状态机校验与路径折叠。",
  "parameters": {
    "type": "object",
    "required": ["taskId", "newStatus", "summary"],
    "properties": {
      "taskId": {
        "type": "string",
        "description": "当前认领的活动任务 ID"
      },
      "newStatus": {
        "type": "string",
        "enum": ["IN_PROGRESS", "IN_REVIEW"],
        "description": "目标流转状态"
      },
      "summary": {
        "type": "string",
        "maxLength": 300,
        "description": "300 字符以内高密度变更摘要，严禁超过 5 行代码块"
      },
      "touchedFiles": {
        "type": "array",
        "items": { "type": "string" },
        "description": "本次新建或修改的相对文件路径清单"
      }
    }
  }
}
```

### 5.4 独立质量仲裁提交工具：`post_review_verdict`

#### 5.4.1 接口语义
`moCI` 专属工具。用于提交独立的测试判决。若判决为 `REJECTED`，必须结构化提供故障类型与复现命令；若判决为 `VERIFIED`，状态自动流转至已验证，待 `moDoc` 归档。

#### 5.4.2 JSON Schema 规范
```json
{
  "name": "post_review_verdict",
  "description": "moCI (QA Sentinel) 专用：提交独立测试仲裁决议。驳回时必须附带结构化报错分类与精确复现命令。",
  "parameters": {
    "type": "object",
    "required": ["taskId", "verdict", "diagnosis"],
    "properties": {
      "taskId": { "type": "string" },
      "verdict": {
        "type": "string",
        "enum": ["VERIFIED", "REJECTED"],
        "description": "仲裁结论"
      },
      "failureType": {
        "type": "string",
        "enum": ["ASSERTION_FAILED", "COMPILATION_ERROR", "TEST_SUITE_DEFECT", "ENVIRONMENT_MISSING"],
        "description": "驳回时必填：故障结构化根因分类"
      },
      "reproCommand": {
        "type": "string",
        "maxLength": 150,
        "description": "精确的一键复现命令，如 npm test -- -t auth"
      },
      "errorSnippet": {
        "type": "string",
        "maxLength": 400,
        "description": "核心报错堆栈或失败断言代码切片 (400 字符内)"
      },
      "diagnosis": {
        "type": "string",
        "maxLength": 200,
        "description": "精炼的故障成因诊断与修复建议"
      }
    }
  }
}
```

### 5.5 历史摘要沉淀与 Backlog 激活工具：`commit_digest`

#### 5.5.1 接口语义
`moDoc`（或 `moAdmin` Scribe 阶段）专属工具。将已验证工单成果提炼为不可变历史摘要，推入容量 $K=2$ 的 FIFO 滑动窗口。旧 Epoch 自动驱逐；Backlog 中的首个任务自动被弹出并晋升为新的 `activeTask`（状态置为 `TODO`）。完成后主动执行 `PRAGMA wal_checkpoint(RESTART);` 维护物理日志文件尺寸。

#### 5.5.2 JSON Schema 规范
```json
{
  "name": "commit_digest",
  "description": "moDoc 专用：将已验证工单压缩沉淀入 K=2 滑动窗口，并自动激活 Backlog 下一任务进入 TODO 状态。",
  "parameters": {
    "type": "object",
    "required": ["taskId", "condensedSummary"],
    "properties": {
      "taskId": { "type": "string" },
      "condensedSummary": {
        "type": "string",
        "maxLength": 180,
        "description": "180 字符以内高度提炼的闭环技术事实"
      },
      "unresolvedNotes": {
        "type": "string",
        "maxLength": 100,
        "default": "无",
        "description": "遗留未决观察项或技术债务说明"
      }
    }
  }
}
```

---

## [6] 跨进程数据完整性、原子事务与物理隔离 (Integrity & Concurrency Engineering)

### 6.1 `BEGIN IMMEDIATE` 锁升级死锁免疫原理深度图解

SQLite 的并发机制依赖五种锁状态：`UNLOCKED` $\to$ `SHARED` $\to$ `RESERVED` $\to$ `PENDING` $\to$ `EXCLUSIVE`。

```
+----------------------------------------------------------------------------------------------------+
|                                    SQLite 锁升级死锁与防御对比                                       |
+----------------------------------------------------------------------------------------------------+
| [反模式: BEGIN DEFERRED]                                                                           |
| Process 1 (moCode)    : BEGIN (UNLOCKED) ──> SELECT (SHARED) ──┐ 尝试升级为 RESERVED (被阻塞)        |
|                                                                ├─> 产生死锁: SQLITE_BUSY            |
| Process 2 (moCI)      : BEGIN (UNLOCKED) ──> SELECT (SHARED) ──┘ 尝试升级为 RESERVED (被阻塞)        |
+----------------------------------------------------------------------------------------------------+
| [生产标准: BEGIN IMMEDIATE]                                                                        |
| Process 1 (moCode)    : BEGIN IMMEDIATE ──> 瞬间原子获取 RESERVED 锁 ──> 执行修改 ──> COMMIT (成功)  |
|                                                    │                                               |
| Process 2 (moCI)      : BEGIN IMMEDIATE ──> 等待 Process 1 释放 (内核等待 <= 5000ms) ──> 依次获得执行 |
| Readers (并发查询)    : 任意时刻自由并发读取 WAL 镜像文件，零毫秒阻塞                                  |
+----------------------------------------------------------------------------------------------------+
```

### 6.2 双写原子性与审计快照一致性 (Double-write Invariant)

在每次状态变更中，系统严格遵循双写原子性规则：
1. **状态表更新与审计日志插入必须绑定在同一个 SQLite 事务中**；
2. 严禁出现“黑板状态更新成功但审计快照未写入”或“快照写入但版本号未自增”的裂脑情况；
3. 如果 `mutator` 抛出异常或序列化失败，立即触发 `ROLLBACK`，确保黑板物理介质始终停留在上一个合法版本。

### 6.3 路径折叠算法与 Token 截断防御 (`compactTouchedFiles`)

当重构任务涉及超过 10 个文件时，绝对路径清单将严重侵蚀 Token 预算。算法提取公共目录前缀进行紧凑折叠（模块：`src/daemon/blackboard/BlackboardStore.ts`，函数：`compactTouchedFiles`）：

```typescript
export function compactTouchedFiles(files: string[]): string[] {
  const unique = Array.from(new Set(files.map((f) => f.trim()).filter(Boolean)));
  if (unique.length <= TOKEN_LIMITS.MAX_TOUCHED_FILES) {
    return unique;
  }
  const grouped = new Map<string, number>();
  for (const file of unique) {
    const parts = file.split('/');
    const prefix = parts.length > 2 ? `${parts[0]}/${parts[1]}/*` : parts[0];
    grouped.set(prefix, (grouped.get(prefix) || 0) + 1);
  }
  return Array.from(grouped.entries())
    .map(([prefix, count]) => `${prefix} (${count} files)`)
    .slice(0, TOKEN_LIMITS.MAX_TOUCHED_FILES);
}
```

**实测优化收益**：
经 `test/blackboard-atomic.test.ts` 实测验证，12 个子目录散列文件被原子折叠为公共前缀（如 `src/auth/* (4 files)`, `src/middleware/* (4 files)`, `src/utils/* (4 files)`），不仅满足 $\le 10$ 项硬约束，更使文件清单占用 Token 下降 **72%**。

### 6.4 WAL 日志治理与主动 Checkpoint (`wal_checkpoint(RESTART)`)

为防止长时间运行导致 `-wal` 临时日志文件无限膨胀（影响启动与读取性能），在每次工单交付归档（`commitDigestTool`）或特定安静周期，系统主动触发 Checkpoint：

```typescript
public checkpointWal(): void {
  try {
    this.db.exec('PRAGMA wal_checkpoint(RESTART);');
  } catch {
    // 忽略非致命锁冲突，等待下个自然检查点
  }
}
```

---

## [7] 黑板快照落盘与版本历史回溯 (Snapshots & Rollback Mechanisms)

### 7.1 PreCompact 钩子与防裂脑落盘规范

在 Claude Agent SDK 会话即将触发上下文压缩前，宿主会收到 `PreCompact` 钩子通知（模块：`src/daemon/blackboard/lifecycleHooks.ts`，函数：`createCompactionGuardHooks`）：

- **避坑要点 (Anti-Crash Invariant)**：
  在 Claude Code 底层钩子物理实现中，`PreCompact` 钩子**严禁返回 `hookSpecificOutput`**。若返回包含 `additionalContext` 的载荷，将直接触发 SDK 协议解析器崩溃。
- **落盘物理行为**：
  `PreCompact` 钩子内部仅允许执行同步快照落盘操作，将当前黑板完整状态序列化并写入 `<projectRoot>/data/blackboard_epoch.json`，完成物理固化。

```typescript
const preCompactHook = async (input: HookInput): Promise<HookOutput> => {
  if (input.hook_event_name !== 'PreCompact') {
    return { continue: true };
  }
  // 严禁返回 hookSpecificOutput，仅执行同步快照落盘
  store.exportSnapshotFile(dataSnapshotPath);
  return {
    continue: true,
    suppressOutput: true,
  };
};
```

### 7.2 SessionStart 运行时状态热重锚定

当上下文压缩完成并拉起新的对话周期时，SDK 会派发 `SessionStart` 事件。此时系统通过钩子注入结构化重新锚定上下文（Re-anchoring），确保新智能体对当前系统全局目标与最新工单完全知情：

```markdown
### [BLACKBOARD SSOT RE-ANCHORED AFTER COMPACTION]
- **Global Root Goal**: 重构认证网关以支持双向 JWT 校验
- **Architectural Invariants**: 严禁破坏现有 REST 接口契约 | 单测覆盖率不低于 85%
- **Active Task**: [TASK-101] 实现 Token 拦截器 (Status: IN_PROGRESS)
- **Touched Files**: src/auth/* (4 files), src/middleware/* (4 files)
- **Recent Sliding Digest (K=2)**: (Epoch 1) 完成密码哈希库升级与密钥派生重构
```

### 7.3 时间点回溯引擎 (`rollbackStateBefore`) 与单调版本递增

当人类用户在前端触发群聊消息“软回退”（Soft-Rewind）或需要回滚至某一历史时间节点时，存储引擎提供 `rollbackStateBefore` 算子：

```typescript
public rollbackStateBefore(targetTimestampMs: number, actor: string = 'HostRewind'): BlackboardState {
  const targetIso = new Date(targetTimestampMs).toISOString();
  
  // 1. 查询目标时间戳之前最近的一条有效审计快照
  const priorRow = this.db
    .prepare(
      `SELECT state_snapshot_json FROM blackboard_audit_log
       WHERE created_at <= ? AND state_snapshot_json IS NOT NULL
       ORDER BY seq DESC LIMIT 1`
    )
    .get(targetIso) as { state_snapshot_json: string } | undefined;

  // 2. 状态回滚必须单调递增版本号 (In-place Monotonic Increment)
  const nextState = this.mutate(actor, 'REWIND_EPOCH_ROLLBACK', (draft) => {
    if (priorRow && priorRow.state_snapshot_json) {
      const restored = JSON.parse(priorRow.state_snapshot_json) as BlackboardState;
      draft.rootGoal = restored.rootGoal;
      draft.kanban = restored.kanban;
      draft.environment = restored.environment;
      draft.audit = restored.audit;
      draft.slidingDigest = restored.slidingDigest;
      return `Restored blackboard state prior to ${targetIso}`;
    }
    // 若无前置快照，安全清空活动任务
    draft.kanban.activeTask = null;
    return `Reset active task on rewind prior to ${targetIso}`;
  });

  // 3. 同步导出最新落盘快照
  this.exportSnapshotFile();
  return nextState;
}
```

**为什么回滚操作必须递增版本号**：
若将版本号从 v5 倒退回 v3，各子智能体进程、客户端 WebSocket 订阅者及本地缓存将无法识别新状态是“旧数据的覆盖”，会导致缓存失效机制失效并引发脏写竞争。**状态可以回滚，但系统时钟（版本号）必须永远单调递增**。

---

## [8] 边缘场景防御与反模式规避 (Edge Cases & Anti-Patterns Matrix)

| 异常边缘场景 | 潜在危害与故障表现 | 宿主存储与协议防御机制 | 验证断言 / 依据模块 |
| :--- | :--- | :--- | :--- |
| **并发写冲突 (Write Contention)** | 两个 Agent 同时尝试迁移状态，引发覆盖丢失 | `BEGIN IMMEDIATE` 物理加锁 + `PRAGMA busy_timeout = 5000` 队列化串行执行 | `BlackboardStore.mutate` |
| **认知死循环 (Stagnation Loop)** | 模型反复生成相同代码，打回后摘要一字不差 | 摘要 SHA-256 指纹比对，`stagnationCount >= 2` 强制触发 `BLOCKED_NEED_HUMAN` 熔断 | `test/blackboard-atomic.test.ts` (Test 3) |
| **非法状态跨越 (Illegal Leap)** | 模型未经开发与测试直接提交 `DONE` | `validTransitions` 白名单校验，阻断变异并回显明确纠偏提示 | `test/blackboard-atomic.test.ts` (Test 3) |
| **路径爆炸与超限 (Path Explosion)** | 修改 30+ 文件导致黑板投影打爆 1,400 Token 上限 | `compactTouchedFiles` 前缀聚类折叠算法，硬截断至 10 条以内 | `test/blackboard-atomic.test.ts` (Test 2) |
| **PreCompact 引擎崩溃** | 钩子回传非空 `hookSpecificOutput` 导致 SDK 崩溃 | 严格遵循只写文件规范，仅返回 `{ continue: true, suppressOutput: true }` | `test/blackboard-atomic.test.ts` (Test 6) |
| **破坏性命令渗透** | 智能体试图执行 `rm -rf /` 或篡改 `.env` 凭证 | `dangerousCommandGuardHook` 在 `PreToolUse` 第一顺位直接阻断 (`deny`) | `test/blackboard-atomic.test.ts` (Test 5) |
| **孤儿进程读脏数据** | 宿主重启后子进程读取过期的内存黑板 | 强制读写物理 SQLite 数据库，进程启动首轮读取 `blackboard_ssot.db` | `BlackboardStore.readState` |

---

## [9] 测试断言标准与工程合规矩阵 (Verification & Conformance Table)

### 9.1 D8 规范契约执行矩阵

本规范所涉及的核心物理组件在当前代码库中已完全实现并经过自动化测试闭环验证：

| 组件符号 / 契约项 | 实现状态 | 物理实现代码路径与模块 | 验证命令与结果 |
| :--- | :--- | :--- | :--- |
| `BlackboardStore` (WAL Storage) | `CURRENT` | `src/daemon/blackboard/BlackboardStore.ts` | `npm exec tsx test/blackboard-atomic.test.ts` (Pass) |
| `blackboardMcp` (MCP Server) | `CURRENT` | `src/daemon/blackboard/blackboardMcp.ts` | `npm exec tsx test/blackboard-atomic.test.ts` (Pass) |
| `compactTouchedFiles` (Path Guard)| `CURRENT` | `src/daemon/blackboard/BlackboardStore.ts` | `npm exec tsx test/blackboard-atomic.test.ts` (Pass) |
| `createCompactionGuardHooks` | `CURRENT` | `src/daemon/blackboard/lifecycleHooks.ts` | `npm exec tsx test/blackboard-atomic.test.ts` (Pass) |
| `dangerousCommandGuardHook` | `CURRENT` | `src/daemon/blackboard/lifecycleHooks.ts` | `npm exec tsx test/blackboard-atomic.test.ts` (Pass) |
| `evaluateFastPath` (0ms Bypass) | `CURRENT` | `src/daemon/orchestrator/fastPath.ts` | `npm exec tsx test/blackboard-atomic.test.ts` (Pass) |
| `StorageManager` (ACID Master) | `CURRENT` | `src/storage/StorageManager.ts` | `npm exec tsx test/storage-runtime.test.ts` (Pass) |

### 9.2 核心单元与集成测试套件验证标准 (`test/blackboard-atomic.test.ts`)

执行验证命令：
```bash
npm exec tsx test/blackboard-atomic.test.ts
```

各测试断言指标标准：
1. **测试用例 1 (跨进程原子持久化)**：验证 Process A 初始化任务并销毁，Process B 实例化后能确定性完整还原相同版本号与根目标数据；
2. **测试用例 2 (路径折叠与预算)**：输入 12 个多层级路径，断言折叠后条目数 $\le 10$，且正确包含类似 `src/auth/* (4 files)` 的聚合标识；
3. **测试用例 3 (单向状态校验与停滞检测)**：断言非法的 `TODO -> IN_REVIEW` 跳变必须抛出匹配 `/非法状态迁移/` 的异常；断言重复提交相同摘要使 `stagnationCount` 正确自增；
4. **测试用例 4 (Fast-Path 极速旁路)**：断言极简确认短语直接晋升首项 Backlog，耗时 $\le 1\text{ ms}$ 且无需 LLM 调度；
5. **测试用例 5 (PreToolUse 安全门禁)**：断言针对 `rm -rf /`、`git push --force` 与修改 `.env` 的工具调用均被置为 `permissionDecision: 'deny'`；
6. **测试用例 6 (防压缩裂脑双钩子)**：断言 `PreCompact` 不包含 `hookSpecificOutput` 且快照文件成功落盘；断言 `SessionStart` 成功注入包含最新黑板摘要的上下文；
7. **测试用例 7 (三级阶梯仲裁与熔断)**：断言第 1 次驳回退回修复，第 2 次驳回触发交叉复审，第 3 次驳回正确将任务置为 `BLOCKED_NEED_HUMAN` 熔断状态。

---

## [10] 附录：TypeScript 核心类型定义契约

```typescript
// 模块：src/daemon/blackboard/types.ts

export type TaskStatus =
  | 'TODO'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'REJECTED'
  | 'CROSS_AUDIT'
  | 'VERIFIED'
  | 'DONE'
  | 'BLOCKED_NEED_HUMAN';

export type FailureType =
  | 'ASSERTION_FAILED'
  | 'COMPILATION_ERROR'
  | 'TEST_SUITE_DEFECT'
  | 'ENVIRONMENT_MISSING';

export interface ActiveTask {
  id: string;
  title: string;
  assignee: 'moCode' | 'moCI' | 'moAdmin';
  status: TaskStatus;
  specification: string;
  acceptanceCriteria: string;
  latestSummary?: string;
  outputHash?: string;
  stagnationCount: number;
  rejectionCount: number;
  crossReviewed: boolean;
}

export interface BacklogItem {
  id: string;
  title: string;
  specification: string;
  acceptanceCriteria: string;
}

export interface SlidingDigestEntry {
  epoch: number;
  taskId: string;
  summary: string;
  files: string[];
  unresolved: string;
}

export interface LastVerdict {
  taskId: string | null;
  verdict: 'IDLE' | 'VERIFIED' | 'REJECTED';
  failureType?: FailureType;
  reproCommand?: string;
  errorSnippet?: string;
  diagnosis?: string;
  testIntegrityNote?: string;
}

export interface BlackboardState {
  version: number;
  updatedAt: string;
  rootGoal: {
    objective: string;
    invariants: string[];
    locked: boolean;
  };
  kanban: {
    activeTask: ActiveTask | null;
    backlog: BacklogItem[];
  };
  environment: {
    activeBranch: string;
    touchedFiles: string[];
    envFacts: Record<string, string>;
  };
  slidingDigest: SlidingDigestEntry[];
  audit: {
    lastVerdict: LastVerdict;
  };
}
```
