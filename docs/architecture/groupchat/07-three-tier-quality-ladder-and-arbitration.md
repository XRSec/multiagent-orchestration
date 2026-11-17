---
doc_id: SPEC-GROUPCHAT-ARBITRATION-07
status: CURRENT
version: 1.0.0
last_verified: 2026-11-10
language: zh-CN
description: 三级阶梯式质量仲裁与防死锁熔断机制规范，涵盖 L1 局部自愈、L2 交叉评审与假阴性仲裁、L3 人类确认哨所与死锁熔断，以及状态提升与脏数据隔离。
type: DOCS_LEAF
parent_node: INDEX.md
sources: [docs/architecture/companion-groupchat-blackboard-v4-production-full-spec.md, docs/proposals/cross-review-v2.md, docs/operating-model/review.md, src/daemon/orchestrator/BlackboardOrchestrator.ts, src/daemon/blackboard/types.ts, src/daemon/blackboard/blackboardMcp.ts]
---

# 三级阶梯式质量仲裁与防死锁熔断机制规范 (Three-Tier Quality Ladder & Deadlock Circuit Breaker Spec)

## 0. 规范定位与核心命题 (Scope & Problem Statement)

在自主多智能体（Multi-Agent）软件研发流水线中，核心执行角色包括开发者（`moCode`）、独立质检与验收官（`moCI`）以及编排调度者（`moAdmin`）。工程实践中，最具破坏性的系统级缺陷是 **“Coder-QA 乒乓死锁”（Ping-Pong Deadlock）** 与 **“测试假失败”（False Negative）** 导致的无界自转。

```
+---------------------------------------------------------------------------------------------------+
|                                  传统双角色协同乒乓死锁机理                                          |
+---------------------------------------------------------------------------------------------------+
|  [moCode (编写业务代码)]  <==== (提交 PR / 请求审查) =====+                                         |
|            |                                              |                                       |
|            | (反复就地盲目修改)                                | (持续驳回 REJECT / 产生对抗性死循环)      |
|            v                                              |                                       |
|  [代码越改越乱/破坏架构]  ==== (假阴性测试失败: 端口冲突) ====> [moCI (黑盒断言失败)]                      |
+---------------------------------------------------------------------------------------------------+
| 根因剖析: 1. 视角盲区 (Coder 看不到测试脚本缺陷; QA 不懂业务意图)                                     |
|           2. 环境脏数据 (残留锁/僵尸进程/未清理 WAL 导致测试非业务级报错)                               |
|           3. 缺乏熔断阶梯 (原地无限制重试，消耗数十万 Token 并污染 Git 分支树)                           |
+---------------------------------------------------------------------------------------------------+
```

### 0.1 传统双角色协同的四大失效根因
1. **测试假失败（False Negative）与过度断言（Over-strict Assertion）**：测试失败并非由业务代码缺陷引起，而是由测试套件自身断言超纲、未考虑并发时序、硬编码端口冲突或 Mock 污染引起。Coder 误以为业务逻辑出错，反复篡改正确业务，产生削足适履的架构退化。
2. **底层环境脏数据与孤儿进程污染**：前序测试崩溃后遗留僵尸 Node 进程、未释放的 SQLite 读写锁或残留的数据测试固件（Fixtures），引发级联误报。
3. **认知幻觉与停滞（Stagnation）**：智能体在失败压力下，倾向于通过微调标点、微调注释或轻微重写口吻规避问题，产生实质内容完全一致的无效提交。
4. **无界自主重试击穿预算（Budget Exhaustion）**：缺乏强制升阶与硬熔断，导致两方在单个工单内交互超过 15 轮，打穿单任务 Token 上限与时间窗口。

### 0.2 三大治理公理 (Governing Axioms)
- **公理一（重试升阶公理，Escalation Invariant）**：重试绝不允许在原地同质化打转。任何一次质检驳回必须严格推进阶梯状态（L1 局部自愈 $\to$ L2 交叉评审 $\to$ L3 哨所熔断），单阶梯严格配额。
- **公理二（对立隔离公理，Party Separation Invariant）**：裁判员绝不能修改被测工程代码；仲裁官必须独立于开发者与质检官，且绝不能是编写原任务规格的规划者（`Arbiter != Planner != Implementer != Acceptance Owner`）。
- **公理三（确定性硬熔断公理，Circuit Breaker Invariant）**：达到阈值时必须强制切断自主循环，将系统状态提升为挂起，阻断智能体自发唤醒，坚决等待人类显式决策。

---

## 1. 三级阶梯仲裁架构全景 (Three-Tier Quality Ladder Architecture)

系统定义三个严格递进的质量仲裁阶梯，驱动工单从缺陷自愈走向终极确定性。

```mermaid
flowchart TD
    ReviewVerdict[moCI 质检判决: REJECTED / Gate Exit != 0] --> CheckCounters{核查当前工单计数器}

    %% 阶梯 1: 自我反思与自愈
    CheckCounters -- "rejectionCount == 0 (首轮驳回)" --> L1[Level 1: Bot 自我反思与局部自愈]
    L1 --> L1Action[1. 提取尾部 40 行错误切片并 RE2 正则脱敏<br>2. 工作区执行 1 次快速回滚<br>3. 状态置为 FAILED_RETRY / TODO<br>4. attemptCount += 1, 派发 moCode 定向自愈]
    L1Action --> CoderRetry[moCode 修复后置为 IN_PROGRESS -> IN_REVIEW]
    CoderRetry --> NextReview[进入下一轮测试门禁]

    %% 阶梯 2: 对立交叉复审与仲裁
    CheckCounters -- "rejectionCount == 1 OR TEST_SUITE_DEFECT OR dispute" --> L2[Level 2: 对立视角交叉评审与仲裁]
    L2 --> L2Action[1. 状态置为 CROSS_AUDIT, 冻结业务代码<br>2. 剥夺写权限, 激活独立 Arbiter (moAdmin/独立裁判)<br>3. 在隔离 Detached Worktree 执行洁净室环境核验]
    L2Action --> ArbiterDecision{Arbiter 仲裁裁决}
    
    ArbiterDecision -- "CODE_DEFECT (业务真缺陷)" --> ArbCode[定位 file:line, 注入结构化改错指引<br>attemptCount += 1, 重设为 IN_PROGRESS]
    ArbiterDecision -- "TEST_DEFECT (测试假失败/断言缺陷)" --> ArbTest[不扣减 Coder attempt<br>原工单挂起为 BLOCKED_WAIT_TEST_FIX<br>派发独立工单交由 moCI 修复测试]
    ArbiterDecision -- "SPEC_AMBIGUOUS (规格冲突)" --> ArbSpec[挂起原工单, 通知 Planner 重新澄清需求]
    ArbiterDecision -- "ENV_BLOCKER (环境死锁/端口占用)" --> ArbEnv[状态置为 BLOCKED_ENV, 触发环境清洗引擎]

    ArbCode --> NextReview
    ArbTest --> TestFixed[测试修复完成后唤醒原任务]
    ArbEnv --> EnvCleaned[环境就绪后重试]

    %% 阶梯 3: 人类哨所与硬熔断
    CheckCounters -- "rejectionCount >= 2 OR stagnationCount >= 2 OR 超时" --> L3[Level 3: 人类确认哨所与硬熔断]
    L3 --> L3Action[1. 状态原子提升为 BLOCKED_NEED_HUMAN<br>2. 会话引擎置为 WAIT_USER_DECISION / SUSPENDED_WAIT_CONTINUE<br>3. 固化快照与 Diff 差异树<br>4. 强行终止调度循环, 前端渲染交互哨所卡片]
    L3Action --> HumanCheckpoint{人类操作员介入裁决}
    
    HumanCheckpoint -- "Force Pass (强制放行)" --> StateVerified[状态设为 VERIFIED -> 合并归档]
    HumanCheckpoint -- "Reset & Retry (重置重试)" --> StateReset[重置计数器, 状态设为 TODO]
    HumanCheckpoint -- "Edit Spec / Test (修正需求)" --> StateEdit[调整需求规格或修正断言]
    HumanCheckpoint -- "Abandon (废弃工单)" --> StateAbandoned[状态设为 ABANDONED, 清理工作区]
```

### 1.1 计数器与配额边界 (Quotas & Caps)
- **`attemptCount`**：任务构建与质检消耗尝试次数。上限严格锁定为 **3 次**（`MAX_ATTEMPTS = 3`）。
- **`rejectionCount`**：门禁驳回累计次数。
  - `rejectionCount == 0`（首次驳回）：进入 L1 局部自愈；
  - `rejectionCount == 1`（二次驳回）：强制升跃进入 L2 交叉复审；
  - `rejectionCount >= 2`（三次驳回）：直接触发 L3 人类哨所熔断。
- **`stagnationCount`**：停滞指纹重复计数。上限为 **2 次**（`MAX_STAGNATION = 2`），连续 2 次产生无实质差异的提交立即触发 L3 熔断。
- **`arbitrationCount`**：每个工单允许由独立 Arbiter 仲裁的次数上限为 **2 次**，针对同一失败指纹仅允许仲裁 **1 次**。
- **耗时硬上限（Wall-Clock Cap）**：单任务执行时间绝对上限为 **60 分钟** `(design target, not measured)`。

---

## 2. 第一级：Bot 自我反思与局部自愈 (L1 Self-Healing)

L1 专为偶发性业务逻辑疏漏设计，提供 1 次极低调度开销的就地定向纠偏。

```
+---------------------------------------------------------------------------------------------------+
|                            L1 Self-Healing: 1 次快速回滚与脱敏错误切片                               |
+---------------------------------------------------------------------------------------------------+
| 1. 触发前置: rejectionCount == 0 (初次驳回), Gate Exit != 0 或 QA 驳回                              |
| 2. 错误切片: 截取门禁日志末尾 <= 40 行 (上限 <= 8 KB), 经 RE2 线性脱敏清洗                            |
| 3. 局部回滚: 工作区执行 git checkout -f <attemptSha>, 清理未跟踪破坏性变更                            |
| 4. 增量组装: 写入 activeTask.errorSnippet, 控制注入上下文 <= 500 Tokens                            |
| 5. 行为约束: moCode 仅允许修改业务代码, 严禁触碰测试用例与门禁脚本                                  |
| 6. 单次锁定: attemptCount += 1, rejectionCount 升至 1; 若再失败坚决禁止停留在 L1                        |
+---------------------------------------------------------------------------------------------------+
```

### 2.1 错误日志切片与 RE2 正则脱敏
门禁失败输出往往夹杂大量非确定性噪音（时间戳、内存地址、PID、动态临时端口、毫秒耗时），若直接喂给模型，不仅消耗 Token，还会误导模型推断。宿主提取日志尾部 $\le 40$ 行，并执行线性时间（无嵌套量词）正则清洗：

```typescript
export function sanitizeGateTail(rawTail: string): string {
  return rawTail
    .slice(-8192) // 严格硬截断 8 KB
    .split('\n')
    .slice(-40)   // 最多保留最后 40 行
    .join('\n')
    // 抹平高精度时间戳: 2026-11-10T08:12:34.567Z -> [TIMESTAMP]
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '[TIMESTAMP]')
    // 抹平耗时微秒/毫秒: (142ms) -> ([DURATION])
    .replace(/\(\d+(\.\d+)?(ms|s|m)\)/g, '([DURATION])')
    // 抹平临时端口与 PID: port 38291, pid 19284 -> port [PORT], pid [PID]
    .replace(/\b(port\s+)\d{4,5}\b/gi, '$1[PORT]')
    .replace(/\b(pid\s+)\d{1,6}\b/gi, '$1[PID]')
    // 抹平随机生成的十六进制 Hash (长于 8 位): 0x7fff5fbff8a0 / a1b2c3d4e5f6 -> [HEX_ID]
    .replace(/\b(0x)?[0-9a-fA-F]{8,64}\b/g, '[HEX_ID]')
    .trim();
}
```

### 2.2 快速局部回滚与定向自愈约束
1. **工作区状态复位**：宿主执行 `git checkout -f <attemptSha>` 并清除未跟踪文件，确保 Coder 在已知的提交点上进行修复，杜绝脏文件污染重试分支。
2. **黑板状态原子翻转**：状态机在 SQLite 事务内将任务状态置为 `FAILED_RETRY` 并立即恢复为 `TODO`，`rejectionCount` 提升为 1。
3. **单轮自愈铁律**：Coder 获得 1 次定向自愈机会。若该轮修复提交后门禁测试依然报错，系统状态机**物理禁止再次派发 L1 自愈**，必须强行触发阶梯升级。

---

## 3. 第二级：对立视角交叉评审与独立仲裁 (L2 Cross-Review & Arbitration)

当任务遭遇连续第 2 次驳回，或测试类型被标记为 `TEST_SUITE_DEFECT`，或 Coder 提交反驳异议（`dispute`）时，系统自动判定当前已超出 Coder 单方认知范围，强制触发 L2 对立视角交叉评审。

### 3.1 对立视角多方分离架构 (Party Separation Invariant)
为根除“既当运动员又当裁判员”的自审偏见，L2 严格遵循四方物理隔离拓扑：

| 协同角色 | 代理实体 | 权限与物理上下文 | 核心职责 | 绝对红线约束 |
|---|---|---|---|---|
| **开发者 (Implementer)** | `moCode` | 任务 Worktree，具备 `Read`/`Edit`/`Write`/`Bash` | 编写业务代码实现，提交变更 | 严禁自行判决，严禁修改受保护测试集 |
| **质检官 (Acceptance Owner)** | `moCI` | 隔离 Worktree，只读权限 + 门禁 `Bash` | 运行测试套件，执行客观断言 | 严禁编写/修改业务代码，禁止主观放行 |
| **独立仲裁者 (Arbiter)** | `moAdmin` / 独立 Arbiter | 只读沙箱环境，仅开放 `Read`/`Glob`/`Grep` | 审视测试用例自体完备性与契约合规性 | **严禁修改任何代码文件，绝不能是任务 Planning 提出者** |
| **工单规划者 (Planner)** | `moAdmin` (Distiller) | 需求提炼上下文 | 定义初始 Acceptance Criteria | **严禁参与自身所拆解工单的争议仲裁** |

```
+---------------------------------------------------------------------------------------------------+
|                                  模型多样性保障规则 (Model Diversity)                             |
+---------------------------------------------------------------------------------------------------+
| 1. 首选方案: Arbiter 模型等级必须对立或异构 (如 moCode 使用 Opus-4-6, 则 Arbiter 使用 Sonnet-4-6)   |
| 2. 降级保护: 当网关配额耗尽导致所有 Bot 降级为同款模型时，底层在裁决记录中强制标记 diversity: NONE  |
| 3. 透明审计: diversity: NONE 必须显式展示在 Git 提交信息与前端卡片中，严禁伪造异构独立性               |
+---------------------------------------------------------------------------------------------------+
```

### 3.2 仲裁者只读沙箱环境 (Read-Only Sandbox)
Arbiter 在独立的 Detached Worktree 下运行，宿主生命周期拦截器施加物理级安全防护：
- **工具白名单收窄**：仅允许 `Read`, `Glob`, `Grep`, `mcp__blackboard__read_slice`, `mcp__blackboard__post_arbitration`。底层拦截器对任何 `Bash`, `Edit`, `Write` 工具调用直接返回 `deny`。
- **跨目录路径越权拦截**：所有读取路径必须经过 `fs.realpathSync` 计算，严禁逃逸出当前 Worktree 根目录。
- **输入不可信隔离**：Coder 提交的自辩声明在黑板切片中被强制包裹在 `<untrusted_claims>` 容器中，Arbiter 必须且仅能依赖代码仓库的 Git 物理事实出具裁决。

### 3.3 四维仲裁裁决矩阵 (Taxonomy of Arbitration Verdicts)
Arbiter 调用 `post_arbitration` 工具提交不可变裁决，驱动状态机原子分支：

```
+---------------------------------------------------------------------------------------------------+
|                                     L2 仲裁裁决四维分支动作矩阵                                     |
+---------------------------------------------------------------------------------------------------+
| 裁决枚举 (FailureClass)  | 判定物理事实根因            | 状态机流转动作             | Attempt 计数处置    |
+--------------------------+---------------------------+--------------------------+--------------------+
| 1. CODE_DEFECT           | 业务代码真实缺陷 (逻辑错漏)    | 置为 IN_PROGRESS, 派发 Coder | 消耗 1 次 Attempt  |
| 2. TEST_DEFECT           | 测试脚本假阴性/断言过严/Mock错 | 冻结 Coder, 挂起等待测试修复  | 不扣减 Coder 配额  |
| 3. SPEC_AMBIGUOUS        | 需求工单存在冲突或二义性      | 挂起原任务, 触发需求澄清重编  | 不扣减 Coder 配额  |
| 4. ENV_BLOCKER           | 端口冲突/僵尸进程/基础设施挂死 | 状态置为 BLOCKED_ENV     | 不扣减 Coder 配额  |
+---------------------------------------------------------------------------------------------------+
```

1. **`CODE_DEFECT`（业务真缺陷）**：
   Arbiter 指出业务实现中未满足契约的具体 `file:line`，生成脱敏诊断。任务状态原子重设为 `IN_PROGRESS`，`attemptCount` 加 1，`rejectionCount` 升至 2。Coder 必须严格依据仲裁指引修改业务逻辑。
2. **`TEST_DEFECT`（测试假失败）**：
   Arbiter 确诊测试脚本存在假阴性（详见第 4 节）。状态机立即**冻结 Coder 业务代码修改权限**，原工单置为 `BLOCKED_WAIT_TEST_FIX`。系统派发子工单交由 `moCI` 修复测试套件；测试修复完成并验证通过后，原工单解除挂起并恢复执行。
3. **`SPEC_AMBIGUOUS`（规格二义性）**：
   原工单验收标准存在不可调和的逻辑冲突。状态机将工单置为 `BLOCKED_SPEC_CONFLICT`，通知规划者角色（Planner）重新签发工单，重签链条上限锁定为 2 次。
4. **`ENV_BLOCKER`（环境物理阻塞）**：
   判定为底层系统级故障，状态机提升为 `BLOCKED_ENV`，激活环境自愈清洗引擎（Clean-Room Sanitizer）。

---

## 4. 测试假失败 (False Negative) 识别与洁净室环境隔离

工业级统计表明，多智能体流水线中 **40% 以上** 的初次驳回属于非业务代码引起的“测试假失败”。若不进行物理鉴别与环境隔离，系统将必然滑向死锁。

### 4.1 假阴性四大典型根因
1. **孤儿进程与端口争用（`EADDRINUSE`）**：测试套件异常退出时未执行 `server.close()`，导致监听端口被孤儿进程霸占，后续测试在 `listen()` 阶段直接崩溃。
2. **SQLite WAL 与持久层污染**：测试未在隔离的临时目录执行，残留的 `.db-wal` 或未回滚事务导致后续连接遭遇 `SQLITE_BUSY` 或脏数据读取冲突。
3. **异步计时器漂移与 CPU 抖动**：在宿主高负载或低配容器环境下，微秒级 `setTimeout(..., 50)` 发生时延膨胀，触发超时断言失败。
4. **全局 Mock 污染扩散**：测试向 `globalThis.fetch` 或全局对象打桩（Monkey Patch），在 `afterEach` 或崩溃时未执行恢复，导致后续测试套件全面雪崩。

### 4.2 洁净室重放验证算法 (Clean-Room Replay Verification)
当 Arbiter 或状态机怀疑测试假失败时，触发洁净室重放引擎：

```
+---------------------------------------------------------------------------------------------------+
|                                  洁净室无变动重放验证流程 (Clean-Room)                             |
+---------------------------------------------------------------------------------------------------+
|  [捕获门禁报错 (Exit != 0)]                                                                        |
|            |                                                                                      |
|            v                                                                                      |
|  [创建临时隔离目录 Clean-Room Dir: $TMPDIR/cleanroom-<attemptSha>-<timestamp>]                    |
|            |                                                                                      |
|            v                                                                                      |
|  [物理环境消毒: 执行 fuser -k 释放残留端口, 清理未跟踪垃圾, 隔离黑板 DB]                                |
|            |                                                                                      |
|            v                                                                                      |
|  [代码零修改重放测试: 在 Clean-Room 中以完全相同的 attemptSha 再次运行验收命令]                         |
|            |                                                                                      |
|            +-----------------------+-----------------------+                                      |
|            | 重放结果: Exit 0 (通过) | 重放结果: Exit != 0   |                                      |
|            v                       v                       v                                      |
|   【确诊为 FLAKY 假失败】       【确诊为真实缺陷/代码 Bug】   【堆栈哈希不一致: 判定为环境严重抖动】       |
|   - 状态标为 FLAKY_ENV_NOISE    - 状态标为 CODE_DEFECT  - 提升至 BLOCKED_ENV 触发宿主自愈           |
|   - 自动放行并不计入 Attempt 扣减 - 派发 Coder 定向修复     - 通知人工排查底层宿主资源                 |
+---------------------------------------------------------------------------------------------------+
```

### 4.3 物理环境隔离与自愈清洗引擎 (Clean-Room Sanitizer)
宿主在运行任何门禁脚本前，必须串行执行四重洁净室前置清洗流水线：
1. **孤儿进程清剿（Process Sweeper）**：通过探测项目指定测试端口（如 `httpPort: 38080`），对残留监听者发送 `SIGTERM`，超时 2000ms 强制 `SIGKILL`。
2. **安全目录重锚**：依据 CLAUDE.md 第 1.7 条规范，严禁执行破坏性 `rm -rf`，所有临时目录的清理一律统一调用安全删除脚本：
   `/opt/xrsec/.env/rmfile <targetDirectory>`。
3. **SQLite 内存化/独立影子库挂载**：测试环境强制注入环境变量 `DATABASE_URL=:memory:` 或将 SQLite 物理文件路径动态重定向至专用临时路径，阻断对生产与黑板持久化库的破坏。
4. **全局对象深度冻结核验**：在单元测试框架配置中挂载前置钩子，在每个用例执行前后核对 `Object.keys(globalThis)` 差异，发现泄漏立即输出隔离警报。

---

## 5. 第三级：人类确认哨所与硬熔断 (L3 Human Checkpoint & Circuit Breaker)

当任务消耗尽阶梯配额、发生无实质进展的停滞循环、或遭遇不可调和的仲裁冲突时，触发确定性硬熔断。

### 5.1 硬熔断触发条件矩阵 (Deadlock Triggers)
系统在每一次门禁结束、判决提交或状态转移时，原子核查以下四重熔断条件（First Match Wins）：

| 熔断编号 | 触发边界条件 | 判定物理指标 | 系统行为与熔断原因 |
|---|---|---|---|
| **TR-1** | **尝试配额耗尽** | `attemptCount >= 3` 或 `rejectionCount >= 3` | 阶梯配额消耗完毕，防 Token 穿透 |
| **TR-2** | **停滞死循环 (Stagnation)** | `stagnationCount >= 2` | 连续两次提交的 Git Tree SHA 或清洗后失败指纹完全相同 |
| **TR-3** | **时钟预算击穿** | 任务持续时间 $\ge 60$ 分钟 | 超过单工单最大生命周期阈值 |
| **TR-4** | **仲裁争议升级** | Arbiter 裁决为不可调和争议或二次异议 | 多智能体认知边界已达极限，必须人类裁决 |

### 5.2 状态原子提升 (State Elevation to WAIT_USER_DECISION)
触发熔断时，宿主调度器立即执行原子提升机制：
1. **黑板任务状态提升**：在 SQLite 事务中将任务状态原子翻转为 `BLOCKED_NEED_HUMAN`。
2. **群聊会话生命周期提升**：将群聊会话状态提升为 `WAIT_USER_DECISION` 或 `SUSPENDED_WAIT_CONTINUE`。
3. **物理切断调度循环**：状态机主循环执行无条件 `break`（退出 `runFsmLoop`），**绝对禁止拉起后续任何排队 Bot**，严格遵守用户所有者铁律（Owner-Only Trigger Law）。

### 5.3 法医级证据快照固化 (Forensic Snapshot)
在状态提升的同时，宿主必须在黑板数据库与磁盘中同步持久化一份不可篡改的 `CircuitBreakerSnapshot`：

```typescript
export interface CircuitBreakerSnapshot {
  snapshotId: string;           // UUIDv4
  taskId: string;
  attemptSha: string;           // 触发熔断时的 Git Commit SHA
  treeSha: string;              // git rev-parse <attemptSha>^{tree}
  unifiedDiff: string;          // 与基线分支的完整 diff 补丁文本
  reproCommand: string;         // 可直接复现失败的完整终端命令
  sanitizedTail: string;        // 尾部 40 行已脱敏错误堆栈
  rejectionCount: number;
  stagnationCount: number;
  lastArbitrationReport?: string; // L2 阶段 Arbiter 出具的完整分析
  frozenAt: string;             // ISO-8601 时间戳
}
```

### 5.4 前端交互式哨所卡片与阻断协议 (Frontend Interlock Card)
当状态提升至 `WAIT_USER_DECISION` 时，宿主通过 WebSocket 信道（`ws://127.0.0.1:38080/gateway`）向前端推送包含强阻断动作的信封：
- **前端输入框锁定**：冻结普通消息输入流，在会话区域顶部高亮悬浮 `ExecutionStatusCard`。
- **渲染四大恢复操作按钮**：

```
+---------------------------------------------------------------------------------------------------+
|                     ⚠️ 质量哨所安全熔断已触发 (工单 TASK-101 已挂起等待人工裁决)                    |
+---------------------------------------------------------------------------------------------------+
| 累计驳回: 3 次 | 停滞指数: 0 | 根因分类: ASSERTION_FAILED | 复现指令: pnpm test -- -t auth         |
| 错误诊断: auth_middleware.ts:42 expected 200 received 401 (JWT 签名算法不匹配)                     |
+---------------------------------------------------------------------------------------------------+
|                                     人类操作员确定性恢复入口                                         |
|  [ 按钮 1: 强制放行合并 (Force Pass) ]  --> 核实为测试过严，直接置为 VERIFIED 并合入主干             |
|  [ 按钮 2: 现场就地重试 (Reset & Retry)] --> 人工微调代码后，重置计数器为 0，重新置为 TODO 启动自测   |
|  [ 按钮 3: 调整需求规格 (Edit Spec)]     --> 弹出抽屉修改验收断言，派发新规格工单                    |
|  [ 按钮 4: 废弃终止工单 (Abandon Task)]  --> 彻底放弃本工单，状态置为 ABANDONED，清理隔离 Worktree    |
+---------------------------------------------------------------------------------------------------+
```

### 5.5 恢复入口单向约束 (Strict Resume Gate)
从 `BLOCKED_NEED_HUMAN` 恢复的唯一合法路径是**人类操作员显式调用系统端点**（如点击前端卡片或调用受保护的 `resume_blocked_task` 管理工具）。任何 Bot 角色调用 `update_task_status` 试图将任务从 `BLOCKED_NEED_HUMAN` 变更为其他状态均会被底座拦截器以 `PermissionDeniedError` 强行拒绝。

---

## 6. 核心算法、状态机与 TypeScript 实现规范 (Algorithms & FSM Implementation)

### 6.1 合法状态转移拓扑 (Legal State Transition Matrix)
系统底座内嵌严格的单向有限状态转移表，杜绝非法逆向跃迁与状态幻觉：

```typescript
export const LEGAL_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'ABANDONED'],
  IN_PROGRESS: ['IN_REVIEW', 'BLOCKED_NEED_HUMAN', 'ABANDONED'],
  IN_REVIEW: [
    'VERIFIED',           // 门禁通过
    'FAILED_RETRY',      // 触发 L1 自愈
    'CROSS_AUDIT',       // 触发 L2 仲裁
    'BLOCKED_NEED_HUMAN' // 触发 L3 熔断
  ],
  FAILED_RETRY: ['IN_PROGRESS'],
  CROSS_AUDIT: [
    'IN_PROGRESS',            // 判定为 CODE_DEFECT, 重回构建
    'BLOCKED_WAIT_TEST_FIX',  // 判定为 TEST_DEFECT, 挂起等测试修复
    'BLOCKED_SPEC_CONFLICT',  // 判定为规格冲突
    'BLOCKED_ENV',            // 判定为环境阻塞
    'BLOCKED_NEED_HUMAN'      // 仲裁直接触发熔断
  ],
  BLOCKED_WAIT_TEST_FIX: ['TODO', 'ABANDONED'],
  BLOCKED_SPEC_CONFLICT: ['TODO', 'ABANDONED'],
  BLOCKED_ENV: ['TODO', 'IN_REVIEW', 'BLOCKED_NEED_HUMAN', 'ABANDONED'],
  VERIFIED: ['DONE'],
  DONE: [],
  // 仅允许人类通过恢复哨所显式解除挂起
  BLOCKED_NEED_HUMAN: ['TODO', 'IN_PROGRESS', 'VERIFIED', 'ABANDONED'],
  ABANDONED: [],
};
```

### 6.2 算法 1：三级阶梯仲裁决策流引擎 (DecideAndArbitrate Engine)
以下为宿主在收到质检门禁反馈后的核心状态机伪代码实现：

```typescript
export async function executeDecideAndArbitrateFsm(
  store: BlackboardStore,
  task: ActiveTask,
  gateResult: { exitCode: number; rawTail: string }
): Promise<'PROCEED' | 'HALT_HUMAN_INTERVENTION'> {
  // 1. 若门禁完全通过 (Exit Code == 0)
  if (gateResult.exitCode === 0) {
    store.mutate('HostFSM', 'GATE_PASSED', (draft) => {
      const active = draft.kanban.activeTask!;
      active.status = 'VERIFIED';
      draft.audit.lastVerdict = { taskId: active.id, verdict: 'VERIFIED' };
      return `Task ${active.id} verified successfully.`;
    });
    return 'PROCEED';
  }

  // 2. 门禁失败，提取并脱敏错误切片与失败指纹
  const sanitizedTail = sanitizeGateTail(gateResult.rawTail);
  const failureFingerprint = computeSha256(sanitizedTail);
  const currentTreeSha = await getGitTreeSha(task.id);

  // 3. 停滞死锁检测 (Stagnation Check)
  const isStagnant =
    task.lastTreeSha === currentTreeSha ||
    task.lastFailureFingerprint === failureFingerprint;

  const nextStagnation = isStagnant ? task.stagnationCount + 1 : 0;
  const nextRejection = task.rejectionCount + 1;

  // 4. 判定是否触发 Level 3 硬熔断
  if (nextRejection >= 3 || nextStagnation >= 2) {
    const snapshot = await freezeForensicSnapshot(task, sanitizedTail, currentTreeSha);
    store.mutate('HostFSM', 'TRIP_CIRCUIT_BREAKER', (draft) => {
      const active = draft.kanban.activeTask!;
      active.status = 'BLOCKED_NEED_HUMAN';
      active.rejectionCount = nextRejection;
      active.stagnationCount = nextStagnation;
      draft.audit.circuitBreakerSnapshot = snapshot;
      return `Circuit breaker tripped on task ${active.id}. Escalated to human.`;
    });
    return 'HALT_HUMAN_INTERVENTION';
  }

  // 5. 判定是否触发 Level 2 交叉复审与独立仲裁
  if (nextRejection === 2 || task.isDisputed) {
    store.mutate('HostFSM', 'ENTER_CROSS_AUDIT', (draft) => {
      const active = draft.kanban.activeTask!;
      active.status = 'CROSS_AUDIT';
      active.rejectionCount = nextRejection;
      active.stagnationCount = nextStagnation;
      active.lastFailureFingerprint = failureFingerprint;
      active.lastTreeSha = currentTreeSha;
      return `Task ${active.id} escalated to Level 2 Cross-Audit.`;
    });
    
    // 异步派发只读仲裁者 Turn
    await dispatchReadOnlyArbitrationTurn(task, sanitizedTail);
    return 'PROCEED';
  }

  // 6. Level 1 局部自愈与快速重试 (rejectionCount === 1)
  store.mutate('HostFSM', 'ENTER_L1_SELF_HEALING', (draft) => {
    const active = draft.kanban.activeTask!;
    active.status = 'FAILED_RETRY';
    active.rejectionCount = nextRejection;
    active.stagnationCount = nextStagnation;
    active.lastFailureFingerprint = failureFingerprint;
    active.lastTreeSha = currentTreeSha;
    draft.audit.lastVerdict = {
      taskId: active.id,
      verdict: 'REJECTED',
      errorSnippet: sanitizedTail,
    };
    return `Task ${active.id} assigned to Level 1 Self-Healing retry.`;
  });

  await rollbackWorktreeToCleanState(task.id);
  return 'PROCEED';
}
```

### 6.3 算法 2：SHA-256 失败指纹与停滞检测算法
为防止智能体仅微调非功能性文字规避停滞检测，系统实施双重指纹校验：
1. **Tree 指纹**：基于 Git 底层树对象 `git rev-parse HEAD^{tree}`，直接核验实际代码文件树是否存在任何物理变更。若代码树完全一致，直接计入停滞。
2. **堆栈指纹**：对脱敏后的标准堆栈计算 SHA-256 哈希。

```typescript
import { createHash } from 'node:crypto';

export function computeSha256(content: string): string {
  return createHash('sha256').update(content.trim(), 'utf8').digest('hex');
}
```

---

## 7. 数据模型、DDL 与 MCP 协议契约 (Data Models & Contracts)

### 7.1 SQLite 物理表结构定义 (DDL)
系统底层状态持久化依托 Node.js 原生 `node:sqlite`（WAL 模式）。涉及仲裁与熔断的物理表结构如下：

```sql
-- 1. 仲裁审计记录表
CREATE TABLE IF NOT EXISTS arbitration_records (
    arbitration_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    attempt_count INTEGER NOT NULL,
    arbiter_bot_id TEXT NOT NULL,
    arbiter_model TEXT NOT NULL,
    model_diversity TEXT NOT NULL CHECK(model_diversity IN ('DIVERSE', 'NONE')),
    verdict_class TEXT NOT NULL CHECK(verdict_class IN ('CODE_DEFECT', 'TEST_DEFECT', 'SPEC_AMBIGUOUS', 'ENV_BLOCKER')),
    target_file_line TEXT,
    diagnosis_summary TEXT NOT NULL,
    repro_command TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE INDEX IF NOT EXISTS idx_arbitration_task ON arbitration_records(task_id);

-- 2. 现场法医级熔断快照表
CREATE TABLE IF NOT EXISTS circuit_breaker_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    attempt_sha TEXT NOT NULL,
    tree_sha TEXT NOT NULL,
    rejection_count INTEGER NOT NULL,
    stagnation_count INTEGER NOT NULL,
    sanitized_tail TEXT NOT NULL,
    unified_diff TEXT NOT NULL,
    repro_command TEXT NOT NULL,
    frozen_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    resolution_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(resolution_status IN ('PENDING', 'RESOLVED_OVERRIDE', 'RESOLVED_RETRY', 'ABANDONED'))
);
```

### 7.2 MCP 工具协议定义 (Tool JSON Schema)
为确保大模型通过严格结构化协议与状态机交互，定义以下专属 MCP 工具：

#### 工具 1：`mcp__blackboard__post_arbitration` (仅供 Arbiter 调用)
```json
{
  "name": "mcp__blackboard__post_arbitration",
  "description": "提交 L2 阶段的独立交叉仲裁裁决。严禁修改代码，仅依据物理代码仓库事实判定根因归属。",
  "parameters": {
    "type": "object",
    "properties": {
      "taskId": { "type": "string", "description": "正在仲裁的活动工单 ID" },
      "verdictClass": {
        "type": "string",
        "enum": ["CODE_DEFECT", "TEST_DEFECT", "SPEC_AMBIGUOUS", "ENV_BLOCKER"],
        "description": "缺陷根因分类: CODE_DEFECT(业务代码Bug), TEST_DEFECT(测试套件假失败), SPEC_AMBIGUOUS(需求冲突), ENV_BLOCKER(底层环境死锁)"
      },
      "targetFileLine": { "type": "string", "description": "缺陷精准定位，格式如 src/auth/jwt.ts:42" },
      "diagnosis": { "type": "string", "maxLength": 600, "description": "客观技术诊断与纠偏指导说明" },
      "patchSuggestion": { "type": "string", "description": "若为测试假失败，提供建议的测试脚本补丁 diff" }
    },
    "required": ["taskId", "verdictClass", "diagnosis"]
  }
}
```

#### 工具 2：`mcp__blackboard__resume_blocked_task` (仅供人类操作员调用)
```json
{
  "name": "mcp__blackboard__resume_blocked_task",
  "description": "解除 L3 哨所挂起任务，恢复至合法执行状态。仅限人类所有者触发。",
  "parameters": {
    "type": "object",
    "properties": {
      "taskId": { "type": "string", "description": "挂起工单 ID" },
      "action": {
        "type": "string",
        "enum": ["FORCE_PASS", "RESET_RETRY", "REVISE_SPEC", "ABANDON"],
        "description": "人类决策动作: FORCE_PASS(强制通过), RESET_RETRY(重置重试), REVISE_SPEC(修改需求), ABANDON(废弃)"
      },
      "operatorNote": { "type": "string", "description": "人类操作附言与指导备注" }
    },
    "required": ["taskId", "action"]
  }
}
```

---

## 8. 边缘用例与反模式防御矩阵 (Edge Cases & Anti-Pattern Defenses)

| 场景编号 | 极端边缘场景 | 实际系统失效后果 | 底层架构防御机理 | 恢复与验收断言标准 |
|---|---|---|---|---|
| **E1** | **Coder 与 QA 互相指责死循环** | Coder 坚称代码无错，QA 机械驳回，循环 10+ 轮耗尽额度 | 阶梯计数器硬约束：第 2 次驳回强制进入 L2 剥夺两方发言权，由第三方 Arbiter 介入裁决 | 验证 `rejectionCount === 2` 时状态必为 `CROSS_AUDIT`，无同质化轮次 |
| **E2** | **测试断言过严引发架构腐化** | Coder 为迎合不合理的测试假失败，篡改正确的数据结构 | L2 Arbiter 确诊 `TEST_DEFECT`，物理冻结 Coder 写权限，派发工单修正测试用例 | Coder 工作区代码原样保留，`attemptCount` 不被恶意扣减 |
| **E3** | **规划者自己仲裁自己 (自审漏洞)** | `moAdmin` 既是需求编写者又是 Arbiter，无法识别需求二义性 | 角色分离断言：系统在拉起 Arbiter 时校验工单元数据，若 `plannerBotId === arbiterBotId`，强制剔除 Planner 记忆或切换仲裁模型 | 仲裁记录中 `arbiter_bot_id != planner_bot_id` 成立 |
| **E4** | **仲裁过程崩溃或模型超时 (Infra Timeout)** | Arbiter 进程崩溃或响应超时，整个 FSM 停滞挂起 | 基础设施重试熔断器（D1）：单个仲裁角色最多重试 2 次（指数退避 30s, 60s），再次超时状态置为 `BLOCKED_INFRA` 并报警 | 宿主无挂死进程，60s 内向操作员发出基础设施阻塞告警 |
| **E5** | **微调注释规避 SHA-256 停滞检测** | 智能体在失败代码中添加一行注释改变文本哈希，骗过检测 | 引入 `git rev-parse HEAD^{tree}` 物理树检测：过滤非代码变动，或对 AST/清洗后文件树计算哈希 | 虽文本有变但语法树或关键逻辑未变时，`stagnationCount` 依然自增 |
| **E6** | **熔断后后续 Bot 抢跑执行** | 任务挂起后，队列中的第 4、第 5 位 Bot 自动被触发发言 | 用户所有者铁律（Owner-Only Trigger Law）：会话状态提升为 `WAIT_USER_DECISION`，调度器立即 `break` 循环 | 终端与 Web 界面 0 气泡产生，等待按钮挂起 |
| **E7** | **网关降级导致模型多样性丧失** | 外部 API 故障，所有 Bot 降级为同款单模（如 `gemini-3.8-flash`） | 强制落盘 `model_diversity: NONE`，在前端显著标黄提醒用户，且降低熔断容忍度（L2 仅允许 1 轮仲裁） | 数据库字段精准记录，不阻断降级可用性 |
| **E8** | **测试残留脏数据污染后续任务** | 前序任务残留未杀掉的守护进程占用 38080 端口 | 洁净室前置收割器（Process Sweeper）在每次 Gate 启动前执行端口探针并杀死残留占用者 | 测试门禁启动前，目标端口处于自由监听状态 |

---

## 9. 测试验证矩阵与断言标准 (Verification & Test Matrix)

本规范所定义的三级阶梯机制在以下自动化测试套件中得到严格断言验证：

```bash
# 1. 运行核心原子持久化与三级阶梯熔断单元测试
npm exec tsx test/blackboard-atomic.test.ts

# 2. 运行端到端韧性与挂起恢复测试
pnpm test test/milestone-3-e2e-resilience.test.ts
```

### 9.1 核心测试断言清单
- **断言 1（L1 自愈与状态翻转）**：
  在 `test/blackboard-atomic.test.ts` 中验证：初次驳回后，任务状态为 `REJECTED`，`rejectionCount === 1`，通过 `FAILED_RETRY` 回滚后可再次被 Coder 领取为 `IN_PROGRESS`。
- **断言 2（L2 交叉复审触发与测试缺陷隔离）**：
  在连续第 2 次驳回时，验证状态转移进入 `CROSS_AUDIT`；Arbiter 调用 `post_arbitration` 提交 `TEST_DEFECT` 后，`activeTask.crossReviewed === true`，且 `audit.lastVerdict.testIntegrityNote` 包含完整的仲裁诊断切片。
- **断言 3（L3 硬熔断与现场快照完备性）**：
  当 `rejectionCount >= 3` 或 `stagnationCount >= 2` 时，断言状态机原子推进至 `BLOCKED_NEED_HUMAN`，且 `readState().audit.lastVerdict` 包含合法的 `reproCommand` 与 `errorSnippet`。
- **断言 4（CAS 非法逆向转移物理阻断）**：
  验证试图直接调用工具将 `BLOCKED_NEED_HUMAN` 变更为 `IN_PROGRESS`（未经人类显式端点放行）将直接抛出 `InvalidStateTransitionError`。

---

## 10. 实现状态与代码对齐表 (Conformance & Drift Ledger)

根据 `docs/standards/documentation-standards.md` (D8) 规范，下表记录本规范关键机制与既有代码资产的实现对齐状态：

| 模块符号 / 机制名称 | 源码所在物理文件 | 当前实现状态 | 验证命令与测试证据 | 现状差异分析与演进说明 |
|---|---|---|---|---|
| `BlackboardStore.mutate` | `src/daemon/blackboard/BlackboardStore.ts` | **IMPLEMENTED** | `npm exec tsx test/blackboard-atomic.test.ts` | 已支持 SQLite WAL 原子事务与自增版本 CAS |
| `handleRejectionPolicy` | `src/daemon/orchestrator/BlackboardOrchestrator.ts` | **TARGET** | `docs/operating-model/review.md` [4.1] | 现有代码逻辑完整，但当前主网关使用 `AgentOrchestrator`，阶梯逻辑正在合入主干流水线 |
| `post_review_verdict` | `src/daemon/blackboard/blackboardMcp.ts` | **IMPLEMENTED** | `test/blackboard-atomic.test.ts` (测试 7) | 已支持 `rejectionCount` 自增与熔断至 `BLOCKED_NEED_HUMAN` |
| `sanitizeGateTail` | `src/daemon/blackboard/BlackboardStore.ts` | **TARGET** | `docs/proposals/cross-review-v2.md` [3.7.2] | 目前截取纯文本，正在合入 RE2 线性脱敏正则清洗模块 |
| `Clean-Room Sweeper` | `scripts/ci/clean-room-sweeper.sh` | **PROPOSED** | `<projectRoot>/scripts/ci/clean-room-sweeper.sh` | 提案中洁净室端口清剿与安全删除脚本 |
| `WAIT_USER_DECISION` 挂起 | `src/daemon/orchestrator/SessionLifecycleEngine.ts` | **IMPLEMENTED** | `test/milestone-3-e2e-resilience.test.ts` | 会话引擎已完全支持挂起与前端 WebSocket 状态流推送 |
