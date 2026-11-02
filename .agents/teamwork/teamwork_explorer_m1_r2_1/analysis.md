# 架构与实现详勘：Helper 1, 2, 5 (IntentPreflight, PromptCacheLock, PromptDistillation)

## 1. 勘测目标与工程基准
- **目标 Helper**：
  1. `IntentPreflightHelper` (Helper 1): 意图预检 + 顺延词 0ms 旁路直通
  2. `PromptCacheLockHelper` (Helper 2): System Prompt 静态化锁定 + 尾部注入
  3. `PromptDistillationHelper` (Helper 5): Prompt 客套词精炼 + 冷热分离前缀缓存
- **语言与运行环境**：Node.js 18+ 原生 ESM (`.mjs`)，原生 `node:test` + `node:assert/strict`。
- **解耦契约**：与 PipelineContext 进行纯数据解耦，三个 Helper 之间零交叉引用，零第三方 npm 依赖。
- **行数约束**：每个 Helper 控制在 150~300 行，单测文件控制在 150~300 行，单文件严格 <= 600 行。

---

## 2. Helper 1 (IntentPreflightHelper) 深度技术规格

### 2.1 顺延词集合与 0ms 直通逻辑
- **顺延词列表 (Exact Lowercase Phrases)**:
  `['ok', 'okay', '继续', '好', '好的', 'yes', 'y', 'proceed', 'go on', '1', '收到', '确认', 'next', 'continue', '行', '可以', '没问题', '赞成', '准了']`
- **判定清洗规则**：
  去除首尾空白及标点符号（包括中英文逗号、句号、感叹号、波浪号、问号、空格、换行）。
  正则表达式：`/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu`。
  判定逻辑：清洗后转小写，若包含在顺延词集合中，且无其他额外文字，则判定为纯顺延词。
- **0ms 直通处理**：
  - 若 `isContinuationPhrase(input) === true`：
    - 检查 `prevContext`：
      - 若存在 `prevContext?.lastCapabilities` 且大小 > 0：直接复用上一轮能力集与工具集，`isBypass: true, intentType: 'BYPASS_CONTINUATION'`。
      - 若不存在 `prevContext`（首轮异常或冷启动）：回退降级为默认安全只读能力 `READ_EXPLORE`，能力集为 `['FILE_READ']`。
    - 性能度量：使用 `performance.now()` 计算 `latencyMs`，要求实测耗时 `< 0.2ms`。

### 2.2 词法规则分类器与最小能力集计算
- **能力定义 (CapabilityType)**:
  - `FILE_READ`: 基础只读探索
  - `FILE_WRITE`: 代码编写/文件修改
  - `COMMAND_RUN`: 终端与构建/测试
  - `MCP_GATEWAY`: MCP 工具网关调用
  - `SKILL_LOAD`: 技能微胶囊加载
- **关键词匹配拓扑**：
  - `FILE_WRITE`: 匹配 `['edit', 'write', 'replace', 'modify', 'create', 'touch', '修改', '编写', '重构', '创建', '更新', '删除', '写入', '修复', 'fix', 'patch']`
  - `COMMAND_RUN`: 匹配 `['run', 'exec', 'pnpm', 'npm', 'node', 'test', 'build', 'compile', 'bash', 'terminal', '运行', '执行', '测试', '构建', '启动']`
  - `MCP_GATEWAY`: 匹配 `['mcp', 'gateway', 'browser', 'driver', 'cua', '元工具', '外部工具']`
  - `SKILL_LOAD`: 匹配 `['skill', 'capsule', '技能', '加载技能', 'load_skill']`
  - `FILE_READ`: 包含 `['read', 'view', 'grep', 'search', 'find', 'list', '查看', '搜索', '勘测', '阅读', '查阅']`，以及任何默认查询。
- **工具映射表 (Suggested Tools Map)**:
  - `FILE_READ`: `['view_file', 'list_dir', 'grep_search', 'find_by_name']`
  - `FILE_WRITE`: `['write_to_file', 'replace_file_content']`
  - `COMMAND_RUN`: `['run_command']`
  - `MCP_GATEWAY`: `['mcp_gateway_list_tools', 'mcp_gateway_call_tool']`
  - `SKILL_LOAD`: `['read_skill', 'load_skill_capsule']`

---

## 3. Helper 2 (PromptCacheLockHelper) 深度技术规格

### 3.1 System Prompt 静态基座绝对锁定
- **前缀段结构 (StaticPromptSegment)**：
  - `id`: 唯一标识（例如 `'standing-order'`, `'harness-contract'`, `'base-soul'`, `'partner-soul'`, `'tools-schema'`）
  - `priority`: 整数权重（按 10, 20, 30, 40 顺序排列）
  - `content`: 静态 Markdown 字符串
- **组装与锁定算法**：
  1. 按 `priority` 升序稳定排序。
  2. 使用 `\n\n` 拼接所有静态段。
  3. 计算 SHA-256 哈希：`crypto.createHash('sha256').update(staticPrefix, 'utf8').digest('hex')`。
  4. 锁定机制：调用 `lockBaseHash(hash)`。后续若传入不同的静态前缀，`verifyLockedHash` 将返回 `false` 或抛出 `CacheLockTamperedError`。

### 3.2 Tail Injection 规范 (尾部注入围栏)
- **分隔符常量**：`\n\n=== [EPHEMERAL_TAIL_CONTEXT] ===\n`
- **动态 Payload 组织**：
  - `timestampIso`: 当前 UTC 时间戳（如 `2026-11-02T06:07:09Z`）
  - `steeringDirectives`: 动态注入的干预指令数组（如 `['[STEERING_OVERRIDE]: requirements updated']`）
  - `activeSessionId`: 当前会话 UUID
  - `turnEphemeralState`: 仅本轮有效的瞬时状态键值对
- **组装保证**：
  - 动态内容被严格放置于 `=== [EPHEMERAL_TAIL_CONTEXT] ===` 之后。
  - `fullPrompt.startsWith(staticPrefix)` 恒为 `true`。
  - 静态部分字节流零变动，锁定 95%+ KV 缓存命中率。

---

## 4. Helper 5 (PromptDistillationHelper) 深度技术规格

### 4.1 客套词精炼过滤算法
- **过滤字典与正则**：
  - 包含中文虚词：`['请问一下', '请问', '麻烦你', '麻烦', '劳驾', '可不可以', '能否', '拜托', '辛苦了', '非常感谢', '谢谢', '你好', '您好']`
  - 包含英文虚词：`['please', 'could you kindly', 'would you please', 'thank you very much', 'thanks', 'hello', 'hi']`
- **语义保护边界**：
  - 遇到否定词（如 "请不要", "请勿", "please do not"）时，必须保留否定语义，严禁将 "请不要修改" 清洗为 "修改"。
  - 正则清洗前进行关键句法保护，清洗后去除连续多余空格与空白行。

### 4.2 冷热分离与确定性前缀哈希
- **冷区规则 (Cold Static Directives)**：
  - 提取包含格式规约、单文件行数限制、禁止行为、角色规范等指令（例如含有 "规范:", "要求:", "必须", "严禁", "格式:" 等行）。
- **热区参数 (Hot Dynamic Parameters)**：
  - 剩余的具体操作对象、文件路径、参数、临时提问。
- **确定性前缀哈希 LRU 缓存**：
  - 对冷区内容执行标准正规化（trim、统一 `\n`、移除无用空格），计算 SHA-256 哈希。
  - 使用原生 `Map` 实现 LRU Cache（默认容量 200）：
    - `get(key)`：命中时将 key 重排至 Map 尾部。
    - `set(key, value)`：若超出容量，删除 Map 中最早插入的 key（`map.keys().next().value`）。
