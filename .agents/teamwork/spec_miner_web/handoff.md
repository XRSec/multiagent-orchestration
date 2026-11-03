# Handoff Report — apps/web/ 规格与架构挖掘深度调研报告

**Subagent**: `spec_miner_web`  
**Date**: 2026-11-02T16:48:00Z  
**Target Milestone**: M1 - Discovery & Specification Mining  
**Integrity Mode**: development  

---

## 1. Observation (客观事实与证据链)

### 1.1 框架与运行环境 (Framework & Environment)
- **前端框架**: React 19 (`react: ^19.0.0`, `react-dom: ^19.0.0`) + Vite 6 (`vite: ^6.0.7`, `@vitejs/plugin-react: ^4.3.4`)。
  - 证据: `apps/web/package.json` 第 12-29 行：
    ```json
    "dependencies": {
      "clsx": "^2.1.1",
      "lucide-react": "^0.468.0",
      "react": "^19.0.0",
      "react-dom": "^19.0.0",
      "react-router-dom": "^7.1.5",
      "tailwind-merge": "^2.5.4"
    },
    "devDependencies": {
      "@types/react": "^19.0.2",
      "@types/react-dom": "^19.0.2",
      "@vitejs/plugin-react": "^4.3.4",
      "autoprefixer": "^10.4.20",
      "postcss": "^8.4.49",
      "tailwindcss": "^3.4.17",
      "typescript": "^5.7.2",
      "vite": "^6.0.7"
    }
    ```
- **纯客户端 SPA 架构**: 页面入口为 `apps/web/index.html`，挂载点为 `<div id="root"></div>`，入口脚本为 `/src/main.tsx`。非 Next.js / Remix 等服务端渲染框架。
- **Node.js 运行时与包管理器**:
  - 当前宿主 Node.js 版本: `v26.10.0`，pnpm 版本: `12.11.2`（验证命令: `node -v && pnpm -v`）。
  - 根目录 `package.json` 第 20-22 行限制 `"engines": { "node": ">=18.0.0" }`。
- **TypeScript 配置**:
  - `apps/web/tsconfig.json`: `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "bundler"`, `strict: true`, `baseUrl: "."`, `paths: { "@/*": ["src/*"] }`。
- **Package.json 脚本分布**:
  - `apps/web/package.json`:
    - `"dev": "vite"`
    - `"build": "tsc -b && vite build"`
    - `"preview": "vite preview"`
  - 根目录 `package.json`:
    - `"web:dev": "pnpm --filter @cindy/web dev"`
    - `"web:build": "pnpm --filter @cindy/web build"`
    - `"ui": "vite"` (运行 apps/desktop 并在 3000 端口启动 vite-api-plugin)
    - `"test": "node tests/test-sdk-orchestrator.mjs"`
    - `"room": "node scripts/cli-room.ts"`
    - `"room:test": "node tests/test-cli-room.mjs"`
    - **关键缺失**: 根目录 `package.json` 当前**未定义 `"typecheck"` 脚本**。执行 `pnpm typecheck` 时报错: `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: Command "typecheck" not found`。但在 `apps/web` 下执行 `pnpm --filter @cindy/web build` 会执行 `tsc -b`，验证通过（0 错误，耗时 2.26s）。

### 1.2 路由与页面架构 (Routing & Architecture)
- **路由库**: React Router v7 (`react-router-dom: ^7.1.5`)，通过 `createBrowserRouter` 配置（见 `apps/web/src/router.tsx`）。
- **核心群聊路由**:
  - 路由声明: `apps/web/src/router.tsx` 第 54 行:
    ```tsx
    { path: 'bots/groups/:groupId', element: <BotGroupChatPage /> }
    ```
  - 伙伴 1:1 私聊路由: 第 55 行:
    ```tsx
    { path: 'bots/:botId', element: <BotSessionPage /> }
    ```
- **布局体系**:
  - `apps/web/src/layouts/MainLayout.tsx`: 包含 `Sidebar` (左侧栏), `ContentHeader` (顶部), `RightSidebar` (右侧折叠抽屉).
  - `apps/web/src/layouts/Sidebar.tsx` 第 392-446 行: 渲染伙伴与群组列表，当前从 `@/mock/bots` 读取 `MOCK_BOT_GROUPS`（仅有 `group-m1` 与 `group-arch`）。
- **当前 `BotGroupChatPage.tsx` 实现现状**:
  - 位于 `apps/web/src/pages/bots/BotGroupChatPage.tsx`。
  - **现状为静态 Mock 壳子**:
    - 第 32 行 `export function BotGroupChatPage() { ... }` 尚未调用 `useParams<{ groupId: string }>()` 动态读取路由参数。
    - 第 34-59 行写死了 3 条 Mock 消息（`g-1`, `g-2`, `g-3`），发送者为 Sophia、Devon、Ada。
    - 第 62-146 行 `handleSend` 为纯本地状态拼接，在用户发送后自动模拟一段 Sophia 的固定回复，并挂载静态分析卡片。
    - 消息接口 `GroupMessage` (第 19-30 行) 字段为 `{ id, sender, avatar, content, timestamp, badge }`，缺少底层存储的严格自增字段 `sequence`、`groupId`、`authorKind`、`authorBotId` 等。

### 1.3 后端集成与 API 能力 (API & Backend Capabilities)
- **浏览器与 Node.js 边界隔离**:
  - `scripts/lib/room-storage.ts` 依赖 `node:fs`, `node:path`, `node:os`, `node:async_hooks`。
  - `scripts/lib/agent-driver.ts` 依赖 `node:crypto`, `child_process.spawn` (通过 `claude-subprocess.mjs`)。
  - `apps/web/` 为纯浏览器客户端，**严禁且无法在前端组件中直接 `import` Node.js 后端模块**。
- **现有 Vite 开发代理配置**:
  - `apps/web/vite.config.ts` 第 20-50 行配置了 `/api` 代理:
    ```ts
    const apiTarget = env.VITE_API_TARGET || env.DESKTOP_API_URL || 'http://localhost:3000';
    // ...
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
        timeout: 120000,
      }
    }
    ```
  - **关键依赖风险**: 如果开发者仅执行 `pnpm web:dev`，而没有先在端口 3000 启动后端或 Desktop 进程，所有发往 `/api/...` 的网络请求均会命中 Vite Proxy 的 502 网关错误 (`Proxy Gateway Error: connect ECONNREFUSED 127.0.0.1:3000`)。
- **现有参考实现 (Vite Dev Server 中间件插件模式)**:
  - 在 `apps/desktop/src/main/vite-api-plugin.js` 中，项目已经成功实现了一个 Vite 原生插件 `viteMultiagentApiPlugin`，利用 Vite 开发服务器提供的 `configureServer(server) { server.middlewares.use(...) }` 挂载 Node.js 原生 API 中间件。
  - 该插件已支持:
    - `/api/partners` (GET, POST, PUT, DELETE)
    - `/api/groups` (GET, POST, PUT, DELETE)
    - `/api/extensions`
    - `/api/configs`
    - `/api/distill/diff` (支持 SSE 流式事件推送)
- **真实数据持久化现状**:
  - `~/.multiagent-orchestration/groups/multiagent-orchestration/` 真实存在，包含:
    - `group.json` (7 位核心伙伴成员，当前序列号 `currentSequence: 106`)
    - `messages.json` (共 1308 行，38KB，106 条结构化单调消息)
    - `GROUP_CHARTER.md` 与 `GROUP_MEMORY.md`

### 1.4 UI 与设计规范栈 (UI & Styling Stack)
- **样式技术栈**: Tailwind CSS 3.4.17 + PostCSS。
- **设计系统变量 Token**: `apps/web/src/styles/globals.css` 定义了完整的语义化 Token:
  - 浅色主题 (Cindy Light): `--surface: #F2F2ED`, `--surface-elevated: #FDFDF8`, `--sidebar-bg: #EAEAE4`。
  - 深色主题 (Cindy Dark): `--surface: #181818`, `--surface-elevated: #1F1F1F`, `--sidebar-bg: #141414`。
  - 强调色: `--accent-blue: #3B82F6`, `--accent-green: #10B981`, `--accent-purple: #8B5CF6`, `--accent-amber: #F59E0B`。
- **图标库**: `lucide-react` (`^0.468.0`)，涵盖 `Users`, `Bot`, `Send`, `AtSign`, `Sparkles`, `Clock`, `ArrowUp` 等。
- **组件库**: 纯自研 Tailwind 语义组件 + `clsx` / `tailwind-merge`，未引入 `@radix-ui/*` 或 `@assistant-ui/react`。
- **静态头像资产**: `apps/web/public/assets/` 下具备 10 款 `agent-island-*.png` 及 `cindy-avatar-account.png`（用户头像），可 1:1 映射至 7 位核心伙伴。
- **@伙伴 提及交互模式**:
  - 在 `apps/web/src/pages/bots/BotSessionPage.tsx` (第 200-234 行) 已经存在输入 `@` 触发伙伴联想弹窗并在光标处插入 `@<伙伴名称> ` 的完整交互模式。

### 1.5 测试体系现状 (Testing Setup)
- **根目录测试**:
  - `pnpm test` 映射至 `node tests/test-sdk-orchestrator.mjs` (全部通过，3 个断言测试)。
  - `pnpm room:test` 映射至 `node tests/test-cli-room.mjs` (全部通过，21 个跨层级断言测试)。
  - 测试套件全部采用原生 Node.js `node:assert/strict` 编写，无第三方测试框架依赖。
- **`apps/web/` 测试**:
  - 当前 `apps/web/` 下**未配置任何测试运行器**（无 `vitest`、`jest`、`playwright`，0 个测试文件）。

---

## 2. Features Discovered (已探明特性清单)

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|---|---|---|---|---|---|---|
| F1 | Routing | 群聊房间页面路由 | `/bots/groups/:groupId` 映射至 `BotGroupChatPage` | URL 参数 `:groupId` | React 页面组件 | 404/Fallback 重定向至 `/` | `apps/web/src/router.tsx` |
| F2 | Navigation | 侧边栏群组导航 | 左侧栏伙伴/群聊列表中展示并切换群聊房间 | 房间列表数据 | 点击跳转至对应房间路由 | 列表为空时静默或显示折叠态 | `apps/web/src/layouts/Sidebar.tsx` |
| F3 | Storage | 底层房间与元数据存储 | 读写 `~/.multiagent-orchestration/groups/<slug>/` 下 `group.json` | `roomSlug: string` | `GroupRecord` (成员、序列号等) | 路径穿越抛出 `Path boundary violation` | `scripts/lib/room-storage.ts` |
| F4 | Storage | 单调消息流持久化 | `messages.json` 写入严格自增 sequence 消息，带 clientId 幂等 | `GroupMessage` payload | 已落盘的 `GroupMessage` | 空内容抛出 `cannot be empty`，重复 clientId 幂等返回 | `scripts/lib/room-storage.ts` |
| F5 | Storage | 水位线追踪与增量截断 | 按伙伴 `lastSeenSequence` 计算增量消息，超 30 条自动截断 | `groupId, botId` | `{ messages, omittedCount }` | 未知伙伴 lastSeenSequence 默认为 0 | `scripts/lib/room-storage.ts` |
| F6 | Agent | EBNF 提示词合成 | 按照 dev-rules/bot-group-orchestration.md 语法生成防注入提示词 | partner, group, deltas | 提示词文本 (带 `<untrusted-json-block>`) | 自动转义标签防逃逸 | `scripts/lib/agent-driver.ts` |
| F7 | Agent | 真实 Agent / Mock 驱动 | 执行 Claude CLI 子进程或确定性 Mock 回复 | partner, prompt, groupId, mock | `AgentTurnResult` (reply, silent, exitCode) | 进程失败回退或返回错误文本 | `scripts/lib/agent-driver.ts` |
| F8 | Partner | 7 位核心伙伴就绪与别名解析 | 确保 7 位核心伙伴沙箱存在，支持多别名模糊匹配 | 提及文本 (如 `@Nexus`, `@排错`) | `PartnerInfo` 实体 | 未解析别名返回 null | `scripts/lib/partner-scaffold.ts` |
| F9 | API/Middleware | Vite 中间件 API 插件 | 利用 Vite `configureServer` 挂载 Node.js API 路由 | HTTP Req/Res | JSON 响应或 SSE 事件流 | 统一包装 `{ ok: false, error: msg }` | `apps/desktop/src/main/vite-api-plugin.js` |
| F10 | UI/Theme | 双主题与语义 Token 响应 | 支持 Cindy Light (`#F2F2ED`) 与 Cindy Dark (`#181818`) 即时切换 | `ThemeContext.toggleTheme` | DOM 添加/移除 `.dark` 类 | 本地持久化降级至 dark | `apps/web/src/contexts/ThemeContext.tsx` |

---

## 3. Edge Cases (边界与异常情形)

| # | Feature | Input | Observed Behavior |
|---|---|---|---|
| E1 | CLI / API Room | 包含路径穿越字符的房间名 (如 `../../etc`) | `sanitizeGroupId` 抛出 `Path boundary violation`，阻断非法目录创建与遍历 |
| E2 | Message Storage | 消息内容为空字符串或全空格 `   ` | `appendRoomMessage` 抛出 `Message content cannot be empty or whitespace-only` |
| E3 | Message Storage | 包含 Emoji / Unicode 代理对的长消息截断 | `safeTruncateContent` 按字符数组切割，绝不劈开双字节或四字节 Surrogate-Pairs |
| E4 | Agent Driver | 伙伴回复 `NO_REPLY` 或空字符串 | `silent = true`，宿主不向消息流中追加任何消息，但推进该伙伴的水位线 |
| E5 | Mention Resolution | 提及未注册的伙伴 (如 `@UnknownBot`) | `resolvePartner` 返回 `null`，放入 `unresolvedMentions` 列表，消息正常落盘但不派发 Agent |
| E6 | Build / Typecheck | 根目录直接执行 `pnpm typecheck` | 报错退出码 1 (`Command "typecheck" not found`)，因为根 package.json 未定义该别名 |
| E7 | Web Dev Server | 开发者单独执行 `pnpm web:dev` 并请求 `/api` | 若无内嵌中间件或端口 3000 服务，代理层直接拦截并返回 502 Bad Gateway |

---

## 4. Logic Chain (推理与论证链)

1. **观察 1**: `ORIGINAL_REQUEST.md` 要求在 `apps/web/` 中实现房间管理、消息按 `sequence` 展示、`@伙伴` 触发真实 Agent 执行，且验收要求为 `pnpm web:dev 前端服务可正常启动并在浏览器中完成上述核心交互流程`。
2. **观察 2**: `apps/web/` 是 Vite 6 + React 19 的客户端 SPA，浏览器沙箱严禁直接使用 Node.js 原生 API (`fs`, `child_process`)，故 `room-storage.ts` 与 `agent-driver.ts` 无法打包到前端 bundle。
3. **观察 3**: `apps/web/vite.config.ts` 默认将 `/api` 请求代理到 `http://localhost:3000`。若只启动 `pnpm web:dev`，3000 端口不存在，前端与后端交互必然遭遇 502。
4. **观察 4**: `apps/desktop/src/main/vite-api-plugin.js` 提供了成熟的 Vite 插件中间件范式：在 `configureServer(server)` 钩子中拦截 HTTP 请求，直接在 Vite 开发服务器进程（运行于 Node.js 26）中导入并执行后端逻辑。
5. **推论 1 (前后端协同方案)**: 最佳且最符合 `pnpm web:dev` 独立启动验收标准的方案，是在 `apps/web/`（或共用插件模块）中实现一个轻量级的 Room API Vite 插件（如 `vite-room-api-plugin.ts`），直接挂载在 `apps/web/vite.config.ts` 中。开发模式下直接接管 `/api/rooms/**` 与 `/api/partners/**`，无需额外启动 3000 端口服务，开箱即用。
6. **推论 2 (前端组件改造方案)**:
   - `Sidebar.tsx`: 将 `filteredGroups` 的数据源从 `MOCK_BOT_GROUPS` 切换为调用 `/api/rooms`，并支持轮询或重新获取。
   - `BotGroupChatPage.tsx`:
     - 引入 `useParams<{ groupId: string }>()`，动态获取当前选中的群聊（默认进入 `multiagent-orchestration`）。
     - 加载 `/api/rooms/:groupId/messages`，按 `sequence` 升序渲染。
     - 每条消息展示序列号徽章（如 `#1`, `#2`），时间，发送者身份（User 或 Agent 标识）。
     - 输入框增加 `@` 联想（参考 `BotSessionPage.tsx` 中的实现），输入并发送消息时请求 `POST /api/rooms/:groupId/messages`。
     - 若消息中包含 `@伙伴`，后端调用 `executePartnerTurn` 执行伙伴回合（支持 mock 模式或真实 CLI），返回执行结果并追加至消息流。
7. **推论 3 (工程与构建校验方案)**:
   - 根目录 `package.json` 需补充 `"typecheck": "tsc -b apps/web/tsconfig.json"`，确保 `pnpm typecheck` 能够以 0 退出码通过。
   - 保障 `pnpm test` 和 `pnpm room:test` 持续绿灯。

---

## 5. Caveats (局限与前提假设)

1. **生产构建与部署模式 (Production Build)**:
   - Vite 开发中间件仅在 `pnpm web:dev` 开发服务器模式下生效。若未来需要 `pnpm build && pnpm preview` 或作为独立生产 Web 服务部署，需将该 API 中间件抽取为统一的 Express/Fastify 或 Node.js HTTP 桥接脚本（如 `scripts/server.ts`）。在当前阶段，`ORIGINAL_REQUEST.md` 明确验收标准为 `pnpm web:dev`，因此 Vite 中间件完全满足当前要求。
2. **真实 Agent 执行耗时与并发**:
   - 若调用真实 Claude CLI (`executeClaudeSubprocess`)，单次回合执行可能持续 5-30 秒。前端在发送带 `@` 消息后，应展示类似 `Devon 正在思考…` 或加载骨架屏，并在响应返回或长轮询时更新消息列表。
3. **Mock 降级兜底**:
   - `scripts/lib/agent-driver.ts` 支持 `isMock = true`（或 `process.env.MOCK_AGENT = 'true'`）。在无 Claude 凭证或离线测试环境下，API 接口应支持自动回退至确定性 Mock 回复，以确保 UI 流程 100% 顺畅闭环。

---

## 6. Conclusion (结论与落地实施路径)

1. **架构选型已定**:
   - 前端: Vite 6 + React 19 + React Router v7 + Tailwind CSS。
   - 桥接层: 在 `apps/web/vite.config.ts` 中挂载 Room & Partner API 中间件，直接桥接 `scripts/lib/room-storage.ts`、`scripts/lib/partner-scaffold.ts` 和 `scripts/lib/agent-driver.ts`。
2. **需要新增/修改的文件清单**:
   - `package.json` (根目录): 补充 `"typecheck"` 脚本以满足验收要求。
   - `apps/web/vite.config.ts`: 挂载 Room API 中间件，拦截 `/api/rooms` 与 `/api/partners` 相关路由。
   - `apps/web/src/pages/bots/BotGroupChatPage.tsx`:
     - 接入路由参数 `useParams()`；
     - 接入真实房间历史消息流与自增 sequence 序列；
     - 接入发送消息与 `@伙伴` 触发 Agent 回复。
   - `apps/web/src/layouts/Sidebar.tsx`:
     - 动态从 `/api/rooms` 拉取房间列表（包括预设的 `multiagent-orchestration`）。
   - `tests/`: 增加前后端数据协同的集成校验用例。

---

## 7. Verification Method (独立复现与验证步骤)

执行以下命令链，可逐项独立复现并核验上述所有事实与结论：

1. **验证当前根目录构建与测试状态**:
   ```bash
   pnpm test
   # 预期: [TEST] All Orchestration & In-Memory Steering tests PASSED! 退出码 0

   pnpm room:test
   # 预期: 21/21 Passed (0 Failed) 退出码 0

   pnpm --filter @cindy/web build
   # 预期: tsc -b && vite build 成功完成，产物输出至 apps/web/dist，退出码 0
   ```

2. **验证根目录 typecheck 缺失事实**:
   ```bash
   pnpm typecheck
   # 预期: Command "typecheck" not found (退出码 1，确证需要修复 root package.json)
   ```

3. **验证真实房间数据存储结构**:
   ```bash
   ls -la ~/.multiagent-orchestration/groups/multiagent-orchestration
   # 预期: 包含 group.json (currentSequence: 106) 及 messages.json (106 条历史记录)
   ```

4. **验证核心 7 位伙伴脚手架就绪性**:
   ```bash
   node scripts/cli-room.ts --list-rooms
   # 预期: 列出 multiagent-orchestration 房间，退出码 0
   ```
