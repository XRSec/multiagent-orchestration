# Claude Code 升级与差异追踪指引 (Upgrade & Diff Tracking Guide)

> **基线版本**：Claude Code `2.1.325`  
> **基线提交**：`9c7dfd6c75`  
> **追踪范围**：644 个核心提示词分片（`piebald-claude-code-system-prompts/system-prompts/`）+ 2 个 `tweakcc` 引擎底层补丁（`tweakcc/src/`）

---

## 1. 架构拓扑与注入机制

Claude Code 的本地魔改注入体系由两个核心层构成：

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Claude Code 原生二进制                          │
│     (Bun 单文件可执行文件 / Mach-O / ELF，内嵌 BunFS 虚拟文件系统)      │
│                                                                        │
│   /$bunfs/root/cli.js (入口文件)                                       │
│   /$bunfs/root/chunk-*.js (3,000+ 代码分割 JS 模块)                    │
│   /$bunfs/root/*.md (文本加载器资产，如 preamble 模板)                 │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │
                         tweakcc --apply -y
                                    │
┌───────────────────────────────────┴────────────────────────────────────┐
│                        tweakcc v4.4.0 引擎补丁                         │
│                                                                        │
│  • installationDetection.ts: 支持 pnpm/npm shell shim 解析与二进制直寻 │
│  • patches/systemPrompts.ts: 支持多行反引号开界符回溯与零深度转义保护  │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ 读取
┌───────────────────────────────────┴────────────────────────────────────┐
│                    定制提示词分片资产库 (644 个核心分片)               │
│      claude-code-mod/piebald-claude-code-system-prompts/system-prompts/│
│                                                                        │
│  • agent-prompt-*.md      (98 个：Subagent 派生、评审、Hook 协议)      │
│  • system-prompt-*.md     (202 个：安全红线、格式、工作流准则)         │
│  • skill-*.md             (82 个：斜杠指令、领域技能定义)              │
│  • tool-description-*.md  (262 个：工具执行策略、参数约束)             │
│  • data-*.md              (292 个：模板列表纯数据分片，保持待处理)     │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ 追踪
┌───────────────────────────────────┴────────────────────────────────────┐
│                    升级追踪档案库 (upgrade-tracking/)                  │
│                                                                        │
│  • MANIFEST.json: 机器可读的映射清单（哈希、字节差、Bun chunk 映射）  │
│  • UPGRADE_GUIDE.md / UPGRADE_GUIDE_CN.md: 升级实操规范手册            │
│  • diffs/: 按分类汇总的 Unified diff 补丁文件                          │
│  • generate_archive.mjs: 全自动化差异生成与归档脚本                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 目录文件清单

| 文件 / 目录 | 规范作用 |
|---|---|
| `upgrade-tracking/MANIFEST.json` | 机器可读索引：包含修改分片的哈希、字节变更、Bun Chunk 映射、变量定义 |
| `upgrade-tracking/UPGRADE_GUIDE.md` | 英文版全量升级规范手册 |
| `upgrade-tracking/UPGRADE_GUIDE_CN.md` | 本文档（中文精简实操规范） |
| `upgrade-tracking/generate_archive.mjs` | 自动化归档生成器：从原生二进制与缓存提取基准并计算全量 diff |
| `upgrade-tracking/diffs/agent-prompt.diff` | `agent-prompt-*` 分类 98 个分片的统一 diff |
| `upgrade-tracking/diffs/system-prompt.diff` | `system-prompt-*` 分类 178 个分片的统一 diff |
| `upgrade-tracking/diffs/skill.diff` | `skill-*` 分类 82 个分片的统一 diff |
| `upgrade-tracking/diffs/tool-description.diff` | `tool-description-*` 分类 237 个分片的统一 diff |
| `upgrade-tracking/diffs/tweakcc-src.diff` | `tweakcc` 引擎 2 个关键补丁源文件的统一 diff |

---

## 3. 上游更新检测流程

Anthropic 发布 Claude Code 新版本（如 `2.1.326` 或 `2.2.0`）时，执行以下检测步骤：

### 3.1 检查安装版本与提示词缓存
```bash
claude --version
# 输出当前版本号
```

`tweakcc` 会将对应版本的提示词元数据定义下载至：
`~/.tweakcc/prompt-data-cache/prompts-<NEW_VERSION>.json`

若缓存未就绪，使用 `tweakcc` 预拉取：
```bash
cd /Users/xr/IDEA.localized/multiagent-orchestration/claude-code-mod/tweakcc
node dist/index.mjs --list-system-prompts <NEW_VERSION>
```

### 3.2 自动化上游差异审计
对比 `MANIFEST.json` 与新版缓存，检测以下变更：
1. **版本提升（Version bumps）**：提示词的 upstream `version` 发生变化。
2. **变量增删（Variable changes）**：上游 `${...}` 插值变量新增、移除或重命名。
3. **文本变更（Body changes）**：`pieces` 数组与原版相比发生实质改变。
4. **移除或重命名（Deleted/Renamed）**：新版中已不再存在的废弃提示词。

```bash
node -e "
import fs from 'fs';
const manifest = JSON.parse(fs.readFileSync('claude-code-mod/upgrade-tracking/MANIFEST.json', 'utf8'));
const newCachePath = '/Users/xr/.tweakcc/prompt-data-cache/prompts-2.1.326.json';

if (!fs.existsSync(newCachePath)) {
  console.error('Target cache does not exist:', newCachePath);
  process.exit(1);
}

const newCache = JSON.parse(fs.readFileSync(newCachePath, 'utf8'));
const newPromptMap = new Map(newCache.prompts.map(p => [p.id, p]));

console.log('=== UPSTREAM CLAUDE CODE UPDATE AUDIT ===');
let versionBumps = 0;
let varChanges = 0;
let deletedPrompts = 0;

for (const [id, item] of Object.entries(manifest.prompts)) {
  const newP = newPromptMap.get(id);
  if (!newP) {
    console.log('[REMOVED/RENAMED]', id);
    deletedPrompts++;
    continue;
  }
  if (newP.version !== item.ccVersion) {
    versionBumps++;
  }
  const newVars = Object.keys(newP.identifierMap).length > 0 ? [...new Set(Object.values(newP.identifierMap))].sort() : [];
  const oldVars = (item.variables || []).slice().sort();
  if (JSON.stringify(newVars) !== JSON.stringify(oldVars)) {
    console.log('[VARS CHANGED]', id, 'Old:', oldVars, 'New:', newVars);
    varChanges++;
  }
}
console.log('Version bumps:', versionBumps);
console.log('Variable changes:', varChanges);
console.log('Removed/renamed:', deletedPrompts);
"
```

---

## 4. 原生二进制与 Bun Chunk 检索

Claude Code 采用 Bun 打包为单文件二进制。原生模块与资产位于 Mach-O / ELF 二进制内。

### 4.1 导出入口文件
```bash
cd /Users/xr/IDEA.localized/multiagent-orchestration/claude-code-mod/tweakcc
node dist/index.mjs unpack /tmp/cli.extracted.js /Users/xr/.tweakcc/native-binary.backup
```

### 4.2 检索指定代码分割模块 (Code-Split Chunk)
```bash
node -e "
import { extractClaudeJsModulesFromNativeInstallation } from './dist/nativeInstallation-pdDE7BbH.mjs';
const corpus = extractClaudeJsModulesFromNativeInstallation('/Users/xr/.tweakcc/native-binary.backup');
console.log('Total modules:', corpus.modules.length);

const targetModule = corpus.modules.find(m => m.name === '/$bunfs/root/chunk-6fgj334j.js');
if (targetModule) {
  console.log('Target module size:', targetModule.contents.length);
}
"
```

---

## 5. Tweakcc 引擎底层补丁维护规范

`claude-code-mod/tweakcc` 包含两个关键底层修复，在升级 `tweakcc` 时必须完整保留：

### 5.1 `src/installationDetection.ts`
- **问题**：`pnpm` 或 `npm` 安装 Claude Code 时，`which claude` 指向 shell 脚本包装器（如包含 `#!/bin/sh` 与 `# cmd-shim-target=...`）。原生 `tweakcc` 会误判为 JavaScript 文件或无法解析真实二进制路径。
- **修复**：增加 `maybeResolveShimWrapper` 解析 shell wrapper 与 Windows `.cmd` shim，直接定位底层原生可执行文件；优化 `detectFileTypeHeuristic` 忽略非 node/bun 的 shebang 脚本。
- **校验命令**：
  ```bash
  cd /Users/xr/IDEA.localized/multiagent-orchestration/claude-code-mod/tweakcc
  npx vitest run src/installationDetection.test.ts
  ```

### 5.2 `src/patches/systemPrompts.ts`
- **问题**：多行模板字符串中，若提示词前存在缩进空格或换行，原生界定符检测仅检查 `content[mIndex - 1]`，导致误判为双引号包裹，使深度为 0 的反引号未经转义注入，引发 `SyntaxError: Unexpected identifier 'git'` 等语法错误。
- **修复**：增加 `findEnclosingDelimiter` 回溯跳过前导空白，精确锁定真正的开界符（``` ` ```, `"`, `'`）。
- **校验命令**：
  ```bash
  cd /Users/xr/IDEA.localized/multiagent-orchestration/claude-code-mod/tweakcc
  npx vitest run src/patches/systemPrompts.test.ts
  ```

---

## 6. 标准升级实操 SOP（7 步闭环）

| 步骤 | 操作 | 命令 / 产物 | 验收标准 |
|---|---|---|---|
| **Step 1: 更新与备份** | 更新官方包并还原备份 | `pnpm update -g @anthropic-ai/claude-code`<br>`node dist/index.mjs --restore` | `~/.tweakcc/native-binary.backup` 存在且为新版原版 |
| **Step 2: 审计冲突** | 检查提示词变动 | `node dist/index.mjs --list-system-prompts`<br>运行 3.2 审计脚本 | 明确版本号变更、变量增删及废弃列表 |
| **Step 3: 解决分片冲突** | 针对变动分片三方合并 | 针对变更分片更新 `ccVersion` 与 `variables` | 必须保留所有 `${VARIABLE}` 插值，严禁丢失变量 |
| **Step 4: 编译与注入** | 构建 tweakcc 并全局应用 | `pnpm run build`<br>`node dist/index.mjs --apply -y` | 540+ 分片注入成功，0 语法错误，0 致命异常 |
| **Step 5: 验证测试** | CLI 冒烟验证 | `claude --version`<br>`claude --help`<br>`claude -p "smoke check"` | 正常输出双版本号，CLI 无崩溃 |
| **Step 6: 刷新档案** | 重新生成差异与清单 | `node claude-code-mod/upgrade-tracking/generate_archive.mjs` | `MANIFEST.json` 与 `diffs/` 全量更新 |
| **Step 7: 提交归档** | Git 提交记录 | `git add claude-code-mod/upgrade-tracking/`<br>`git commit -m "chore: upgrade tracking ..."` | 工作区干净 |
