# Cindy Web (App UI 页面壳子与 Mock 运行库)

本项目是将 **Cindy Desktop App** 中的全部原生 UI 页面与交互框架完整提取、解耦并移植为纯 Web 架构的独立项目。所有后端数据与复杂系统服务均已通过结构化 Mock 数据代替，开箱即用，可在任意现代浏览器中独立启动与全功能交互。

---

## 🌟 核心提取页面清单 (All App UI Pages)

| 页面名称 | 对应 Cindy 路由 | 核心功能与交互 |
| :--- | :--- | :--- |
| **新建任务草稿页** | `/` 或 `/cc-agent/new` | 品牌标志、工作区目录选择、模型切换、推理强度 (Thinking)、指令预设胶囊、附件与语音输入 |
| **会话与执行流详情** | `/cc-agent/:sessionId` | 会话状态栏、用户提问、深度思考卡片 (Thinking)、任务推进清单 (Todo List)、ToolCall 工具卡片 (Bash / Write)、Diff 代码变动卡片、底栏输入器 |
| **工作区文件浏览器** | `/cc-agent/files/:id` | VSCode 风格文件树、Git 修改状态标记 (M / ?)、代码语法浏览、文件快速复制 |
| **Orca 多 Agent 协同流** | `/cc-agent/orca/:id` | 可视化 Multi-Agent 拓扑网络、Lead 与 Worker 节点状态图、动态任务队列、协同插话 (Steer) 注入 |
| **自动化调度任务** | `/cc-agent/scheduled` | Cron 定时调度卡片、调度状态启停、下次触发时间推演、历史执行回执表 |
| **AI 伙伴总览看板** | `/bots` 或 `/bots/list` | 专属伙伴团队 (Teammates) 角色卡片、专长标签、评分与协作统计、深入系统提示词查看 |
| **阵容管理与权限配置** | `/bots/roster` | 阵容编队表格、自主度级别、模型映射、执行模式审批 |
| **AI 伙伴应用市场** | `/bots/market` | 分类浏览 (研发、架构、设计、运营、安全)、一键安装至团队阵容 |
| **伙伴 1 对 1 专属对话** | `/bots/:botId` | 伙伴身份 Banner、专属模型配置、上下文独立会话流 |
| **伙伴多角色协作群组** | `/bots/groups/:groupId` | 多 AI 伙伴同群协同、`@伙伴` 提及触发、群聊时间线 |
| **SkillHub 本地技能库** | `/skillhub` 或 `/skillhub/local` | 本地技能定义、Schema 参数约束、核心 Prompt 模板与文档 |
| **SkillHub 公共技能市场** | `/skillhub/market` | 社区技能检索、版本信息、安装与更新管理 |
| **Ghost 插件管理中心** | `/plugins` | .cindy 能力包列表、启用/停用开关、权限明细、工具暴露清单 |
| **Ghost 插件独立嵌入页** | `/apps/:ghostId` | 插件自声明 MCP Apps / Webview 独立交互页面框架 |
| **全局系统设置面板** | `/settings` | 通用偏好、外观主题 (Dark / Light 双主题即时切换)、模型供应商 API Key、快捷键表、额度与配额 |
| **登录与账号认证** | `/login` | 邮箱验证码、手机号短信登录、第三方 OAuth 登录 (Apple / Google) 与访客模式 |
| **多账号添加与切换** | `/add-account` | 个人账号登录、企业与团队组织接入入口 |
| **诊断与实验基准测试** | `/maker-experimental` | 宿主 IPC 延迟、本地 SQLite 读写耗时、网关连通性基准测试 |
| **问题跟踪器引导页** | `/issues` | GitHub Issues 官方仓库同步引导 |

---

## 🎨 视觉系统与主题支持

- **双主题支持**: 完美移植 Cindy 的 `Cindy Dark` (中性近黑底 `#181818`) 与 `Cindy Light` (暖象牙底 `#F2F2ED`) 设计规范。
- **右侧多功能抽屉 (RightSidebar)**:
  - 🖥️ **集成终端 (Terminal)**: 模拟真实 zsh 命令行交互与进程退出码
  - 📂 **快速文件浏览 (Files)**: 项目文件树快速展开与查阅
  - 🐙 **协同 Worker 监控 (Orca)**: 查看当前活跃的工作节点与排队中任务
  - 📊 **系统资源看板 (Resources)**: 实时监控 Token 消耗速率、TTFT 延迟与 Prompt 缓存命中率
- **页面快速跳转器**: 顶部标题栏内置 `页面快捷切换` 下拉菜单，可直接一键直达所有 16+ 个子页面。

---

## 🚀 启动与构建

在 `apps/web` 目录下执行（或在项目根目录下通过 `pnpm web:dev` / `pnpm web:build`）：

```bash
# 安装依赖
pnpm install

# 启动本地开发服务 (带热更新)
pnpm dev

# 编译生产打包验证
pnpm build

# 预览生产产物
pnpm preview
```

本地服务默认运行在 `http://localhost:5173/`。

---

## 📁 目录结构

```
apps/web/
├── public/assets/          # Cindy 官方 Logo、头像与品牌素材
├── src/
│   ├── assets/             # 界面组件静态资源
│   ├── contexts/           # 主题上下文与全局状态
│   ├── layouts/            # 页面外壳布局 (Sidebar, ContentHeader, RightSidebar, MainLayout)
│   ├── mock/               # 结构化 Mock 数据集 (会话、消息、机器人、技能、插件、设置)
│   ├── pages/              # 各功能页面壳子
│   │   ├── cc-agent/       # 对话任务、新建、文件浏览、Orca 协同、调度
│   │   ├── bots/           # 伙伴总览、阵容、市场、1v1 聊天、群聊
│   │   ├── skillhub/       # 技能库与技能市场
│   │   ├── plugins/        # 插件管理与嵌入页
│   │   ├── settings/       # 系统设置全量 Tab
│   │   ├── auth/           # 登录与账号切换
│   │   ├── experimental/   # 实验基准诊断
│   │   └── issues/         # 问题跟踪器
│   ├── styles/             # Tailwind 全局样式与 Token 变量
│   ├── router.tsx          # 统一路由树
│   └── main.tsx            # 应用挂载入口
├── index.html              # HTML 模板
├── tailwind.config.js      # 设计系统 Tailwind 配置
├── vite.config.ts          # Vite 打包配置
└── package.json            # 依赖管理
```
