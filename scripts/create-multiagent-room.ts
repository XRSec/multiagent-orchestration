/**
 * @file scripts/create-multiagent-room.ts
 * @description Bootstrap and initialize the "multiagent-orchestration" development room.
 * Registers 7 core Mo-Bots, establishes GROUP_CHARTER.md and GROUP_MEMORY.md,
 * and records the baseline session in SQLite.
 */

import * as fs from 'fs';
import * as path from 'path';
import { StorageManager } from '../src/storage/StorageManager';
import { getUserStorageDir, resolveBotDir } from '../src/storage/Paths';

const projectRoot = path.resolve(__dirname, '..');

// Sync to user data directory as well as workspace .daemon/.sessions
const dataDirs = [
  getUserStorageDir(),
  path.join(projectRoot, '.daemon'),
  path.join(projectRoot, '.sessions'),
];

const CORE_BOT_IDS = [
  'bot_moadmin_director_03',
  'bot_mocode_engine_01',
  'bot_modoc_scribe_02',
  'bot_moci_sentinel_07',
  'bot_mogit_scm_05',
  'bot_modeep_scout_04',
  'bot_mo_meta_06',
];

const BOT_NAMES = ['moAdmin', 'moCode', 'moDoc', 'MoCI', 'MoGit', 'MoDeep', 'Mo'];

const charterContent = `# Multi-Agent Orchestration 开发核心组章程 (GROUP_CHARTER.md)

**群组名称**: Multi-Agent Orchestration 开发核心组  
**群组标识**: \`multiagent-orchestration\`  
**核心使命**: 全权负责 \`multiagent-orchestration\` 多智能体编排系统与设备网关的架构演进、代码实现、单元测试、持续集成与技术文档维护。

---

## 1. 团队组织架构与成员职责

| 伙伴 ID | 伙伴名称 | 角色定位 | 核心职责 |
|---|---|---|---|
| \`bot_moadmin_director_03\` | **moAdmin** | 核心调度与主管 | 负责开发任务分解、讨论主持、单发言人调度推进与整体交付验收。 |
| \`bot_mocode_engine_01\` | **moCode** | 核心全栈工程师 | 负责 Gateway 通信、SDK 进程内调度器、存储层及业务代码高质量实现。 |
| \`bot_modoc_scribe_02\` | **moDoc** | 架构文胆与文档专员 | 负责系统架构规范撰写、README/MEMORY 维护及黑板事实沉淀。 |
| \`bot_moci_sentinel_07\` | **MoCI** | 持续集成与测试哨兵 | 负责自动化测试套件编写、脱机工作进程验证及构建回归质量把关。 |
| \`bot_mogit_scm_05\` | **MoGit** | 版本控制与代码审计 | 负责 Git 工作区纯净度检查、分支合并把控及代码审查。 |
| \`bot_modeep_scout_04\` | **MoDeep** | 深度调研与技术情报 | 负责对标业界前沿（Cindy / Paseo）架构细节调研与技术选型论证。 |
| \`bot_mo_meta_06\` | **Mo** | 元工具与伙伴锻造师 | 负责新工具研发、技能（Skills）扩展及新领域伙伴脚手架生产。 |

---

## 2. 团队协作原则与工作模式

1. **单发言人模式 (Single-Speaker Orchestration)**:
   - 每次交互仅有 1 位伙伴持有发言权；
   - 讨论模式（\`talk\`）：前 5 步由相关伙伴自动接续推进，第 6 步强制暂停等待人类用户确认；
   - 执行模式（\`work\`）：由 \`moAdmin\` 统筹拆解任务卡后，按需派发给 \`moCode\`, \`moDoc\`, \`MoCI\` 等专业伙伴独立执行。
2. **共享黑板驱动 (Blackboard-Driven Consensus)**:
   - 所有中间共识、工程进展、状态机变更统一沉淀在 \`GROUP_MEMORY.md\` 中；
   - 伙伴每次发言前通过增量切片（Delta Slicing）仅获取新消息，杜绝上下文雪崩与重复问候。
3. **安全隔离铁律 (Host Zero-Pollution)**:
   - 严禁读取、修改或污染宿主用户的 \`~/.claude\`；
   - 敏感系统环境变量在工具执行前强制剥离；
   - 工具文件操作必须在工作区与授权目录内，严禁路径逃逸。
4. **防死循环熔断 (Anti-Loop Circuit Breaker)**:
   - 单轮任务连续交互达到 10 次强制熔断，必须等待人类用户接入确认；
   - 伙伴若无实质新进展，必须返回 \`NO_REPLY\` 静默退出当前轮次。
`;

const initialMemoryContent = `# Multi-Agent Orchestration 共享黑板 (GROUP_MEMORY.md)

## 1. 系统基线与当前状态 (Current Status)
- **初始化时间**: ${new Date().toISOString()}
- **系统架构**: 已完成基于 Cindy 风格的单一 WebSocket 设备网关 (\`GatewayServer\` @ 38080)。
- **存储引擎**: SQLite WAL 模式，已实现 sessions, rooms, messages (sequence >= 1), member_cursors 生产级存储。
- **自动化测试**: 存储与运行时测试 (9/9)、网关集成测试 (10/10) 全部 100% 绿灯通过。

---

## 2. 核心开发里程碑与分工计划 (Roadmap & Workstream)
- [x] **M1: 存储与运行时隔离搭建**（已完成：SQLite WAL + 20 环境变量剥离 + 7 Mo-Bots 资产落盘）
- [x] **M2: 设备网关单一通道收敛**（已完成：Cindy 风格 GatewayServer / GatewayClient + 64 MiB 背压 + 粘包流式解码）
- [ ] **M3: 多智能体协同开发实战**（待推进：通过 moAdmin 驱动 moCode 与 moDoc 在当前群展开系统特性的协同迭代）
- [ ] **M4: Web UI / 控制台跨端呈现**（待推进：基于 GatewayClient 挂接轻量前端界面）

---

## 3. 共识记录与待办事实 (Consensus Facts)
- [${new Date().toISOString()}] **moAdmin**: \`multiagent-orchestration\` 群组正式创建就绪，7 位 Mo-Bots 成员已全部完成游标初始化，随时待命响应人类开发指令。
`;

async function main() {
  console.log('========================================================================');
  console.log('   Creating "multiagent-orchestration" Development Group Room          ');
  console.log('========================================================================\n');

  for (const dataDir of dataDirs) {
    console.log(`[Directory: ${dataDir}] Initializing storage & registering bots...`);
    fs.mkdirSync(dataDir, { recursive: true });
    const storage = new StorageManager(dataDir);

    // 1. Register 7 Core Mo-Bots
    for (const name of BOT_NAMES) {
      const botDir = resolveBotDir(name, projectRoot);
      const profilePath = path.join(botDir, 'profile.json');
      if (fs.existsSync(profilePath)) {
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
        storage.registerBot({
          id: profile.id,
          name,
          display_name: profile.display_name,
          description: profile.description,
          avatar: profile.avatar,
          avatar_color: profile.avatar_color,
          status: profile.status,
          canonical_session_id: profile.canonical_session_id,
          bot_dir: botDir,
          claude_config_dir: path.join(botDir, 'claude_config'),
          created_at: profile.created_at,
          updated_at: profile.updated_at,
        });
      }
    }

    // 2. Create the Room
    const room = storage.createRoom({
      id: 'room_multiagent_orchestration',
      slug: 'multiagent-orchestration',
      name: 'Multi-Agent Orchestration 开发核心组',
      members: CORE_BOT_IDS,
      charterText: charterContent,
      initialMemoryText: initialMemoryContent,
    });

    console.log(`  ✓ Room created with ID: ${room.id} (slug: ${room.slug})`);

    // 3. Record baseline kick-off messages
    const kickoffMsg = storage.addMessage({
      room_id: room.id,
      sender_id: 'bot_moadmin_director_03',
      sender_type: 'bot',
      content: 'Multi-Agent Orchestration 开发核心组已就绪。moAdmin、moCode、moDoc、MoCI、MoGit、MoDeep、Mo 全体成员到位，负责本系统的全部架构演进与开发任务。',
      role: 'assistant',
    });

    // 4. Initialize member cursors to the kickoff sequence
    for (const botId of CORE_BOT_IDS) {
      storage.updateMemberCursor(room.id, botId, kickoffMsg.sequence);
    }

    console.log(`  ✓ Kickoff message recorded with sequence ${kickoffMsg.sequence}`);
    console.log(`  ✓ Member cursors initialized for all 7 Mo-Bots.\n`);

    storage.close();
  }

  console.log('========================================================================');
  console.log('  ✓ SUCCESS: "multiagent-orchestration" room is ready for development!  ');
  console.log('========================================================================');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

