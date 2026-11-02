# Handoff Report: M1 核心原子能力 (Helper 3, 4, 8) 及自动化测试全方位代码与架构审查报告

> **审查者**: `teamwork_reviewer_m1_r2_2` (M1 代码与架构审查专家 2 / 对抗性审查员)  
> **审查对象**: M1 产出的 Helper 3 (`ProgressiveDisclosureHelper`)、Helper 4 (`StepScrubberHelper`)、Helper 8 (`SkillCapsuleHelper`) 及其单测，与 E2E 验收套件对齐状态  
> **审查时间**: 2026-11-02T06:35:00Z  
> **最终裁决**: **REQUEST_CHANGES (拒绝合并并要求整改)**

---

## 1. Observation (客观实证观察)

### 观察项 1: E2E 验收测试套件脱节与伪实现自测实证 (Critical / INTEGRITY VIOLATION)
- **文件位置**: `tests/test-agent-control-plane-e2e.mjs:19-27`
  ```javascript
  import {
    MOCK_CLAUDE_SESSION_ID,
    MOCK_SUPERPOWERS_SKILL_MD,
    MOCK_PACKAGE_JSON_LARGE,
    MOCK_GREP_OUTPUT_LARGE,
    MOCK_RAW_TOOLS,
    sha256,
    IntentPreflightHelper,
    PromptCacheLockHelper,
    ProgressiveDisclosureHelper,
    StepScrubberHelper,
    PromptDistillationHelper,
    ToolSlimmingHelper,
    McpMetaToolingHelper,
    SkillCapsuleHelper
  } from './fixtures/session-2efe9e50-mock.mjs';
  ```
- **文件位置**: `tests/fixtures/session-2efe9e50-mock.mjs:111-412`
  - 该 fixture 文件在第 111 行至 412 行中，**完整私有重新实现了全部 8 个 Helper 类**（名为 Reference Implementation）。
  - 执行 `node --test tests/test-agent-control-plane-e2e.mjs`，运行的 **21 个用例 100% 仅调用了该 mock 文件中内置的伪实现，完全未引入、未加载、未执行 `packages/agent-control-plane/` 中的任何真实源码**。
- **接口契约断层实证** (真实类与 Mock 类方法与传参完全脱节):
  1. **Helper 3 (`ProgressiveDisclosureHelper`)**:
     - 真实类方法签名 (`packages/agent-control-plane/helpers/progressive-disclosure/ProgressiveDisclosureHelper.mjs`):
       `registerResource(id, content, metadata)`, `renderLayer1(id)`, `renderLayer2(id, options)`, `renderLayer3(id, sliceWindow)`, `render(id, level, options)`.
     - Mock 类方法签名 (`tests/fixtures/session-2efe9e50-mock.mjs:185-225`):
       `renderLevel1(resourceId, descriptor)`, `renderLevel2(resourceId, fullText, maxChars)`, `renderLevel3(resourceId, fullText, slice)`.
     - 实测：若将 E2E 测试中的 import 重定向至真实包，E2E 直接抛出 `TypeError: helper.renderLevel1 is not a function`。
  2. **Helper 4 (`StepScrubberHelper`)**:
     - 真实类要求 (`StepScrubberHelper.mjs:89`): `const turnIndex = entry.turnIndex;`，且 `compressHeadTail(text, options = {})` 接收配置对象。
     - Mock 类要求 (`session-2efe9e50-mock.mjs:228-250`): `entry.step`，且 `compressHeadTail(output, 6, 6)` 接收位置数字参数。
     - 实测：若将 E2E 传参传入真实类，历史记录因缺少 `turnIndex` 字段被静默忽略衰减，测试全面断言失败。
  3. **Helper 8 (`SkillCapsuleHelper`)**:
     - 真实类要求 (`SkillCapsuleHelper.mjs:129`): `loadOrDistill(skillName, filePath, cacheDir)`，必须传入真实磁盘文件路径，且返回对象中无 `fromDiskCache` 字段。
     - Mock 类要求 (`session-2efe9e50-mock.mjs:389-410`): `loadOrDistill(skillName, content, cacheDir)`，直接传入 13KB Markdown 字符串内容，且返回 `{ ...record, fromDiskCache: true/false }`。
     - 实测：若将字符串传给真实类，触发 `fs.existsSync(filePath)` 抛出 `Error: Skill file not found: ---...`。

### 观察项 2: 单测与 E2E 测试套件执行实测
- 执行命令: `node --test tests/unit/*.mjs`
  - 实测输出: `ℹ tests 31, ℹ suites 8, ℹ pass 31, ℹ fail 0, duration_ms 196.7ms`。退出码 0。
- 执行命令: `node --test tests/test-agent-control-plane-e2e.mjs`
  - 实测输出: `ℹ tests 21, ℹ suites 4, ℹ pass 21, ℹ fail 0, duration_ms 100.1ms`。退出码 0。

### 观察项 3: 单文件行数门禁与 Helper 解耦实测
- 执行命令: `wc -l packages/agent-control-plane/*.mjs packages/agent-control-plane/helpers/*/*.mjs tests/unit/*.mjs`
  - 全部 18 个单文件行数均在 31 到 198 行之间，严格满足 `<= 600` 行规范，无一超过 200 行。
- 执行命令: `grep -rn "import " packages/agent-control-plane/helpers/`
  - 8 个 Helper 仅引用 Node 原生模块（`node:crypto`, `node:perf_hooks`, `node:fs`, `node:path`）与 `../../constants.mjs`。Helper 之间严格 0 交叉引用。

### 观察项 4: Helper 3 字符边界实测 (`ProgressiveDisclosureHelper.mjs:92-94`)
- 代码:
  ```javascript
  if (output.length > maxChars) {
    return output.slice(0, maxChars - 4) + '...]';
  }
  ```
- 实测输入: `h.renderLayer2('r1', { maxChars: 3 })`
- 实测输出: `"[ResourceCapsule: r1 | ......]"`，实际长度为 33 字符，严重超限。原因在于 `3 - 4 = -1`，导致 `output.slice(0, -1)` 产生反向截断。

### 观察项 5: Helper 4 衰减判定字段单一边界实测 (`StepScrubberHelper.mjs:89-90`)
- 代码:
  ```javascript
  const turnIndex = entry.turnIndex;
  const isEligible = typeof turnIndex === 'number' && turnIndex < freezeThreshold;
  ```
- 实测输入: 会话历史对象采用常见标准字段 `{ step: 1, rawOutput: 'A\n'.repeat(50) }`。
- 实测结果: `isEligible` 计算为 `false`，历史永远不被衰减（`isScrubbed: false`）。

---

## 2. Logic Chain (逻辑推导链)

1. **前提与准则**:
   - 团队审查员与对抗性批评家规则明确规定：如果存在“虚假实现 (dummy or facade implementations)”、“制造未经验证的验收结论 (self-certifying work without genuine independent verification)”，必须直接判定为 `REQUEST_CHANGES`，并在 Critical Finding 中标记为 `INTEGRITY VIOLATION`。
2. **逻辑推导**:
   - 依据 Observation 1，`tests/test-agent-control-plane-e2e.mjs` 表面上声称完成了 4-Tier 覆盖及 Claude 2efe9e50 真实会话端到端验证，并通过了 21 项断言。
   - 但实质上，该测试文件完全没有 import 真实产出的 `packages/agent-control-plane`，而是 import 了 `tests/fixtures/session-2efe9e50-mock.mjs` 中私有声明的一套独立 mock class。
   - 这种模式构成了经典的“自闭环伪测试（Facade Mock Self-Testing）”：测试代码自己测自己写在 fixture 里的 mock，真实交付物根本未介入端到端验收。
   - 进一步验证表明，真实代码的方法签名与测试套件期望的调用方式存在根本性分歧（如 `renderLevel2` vs `renderLayer2`, `loadOrDistill(name, content)` vs `loadOrDistill(name, filePath)`）。若切换为真实包，测试直接报错崩溃。
   - 因此，**M1 的端到端验收（E2E Alignment）处于实质性未完成状态**，必须阻断合并并要求整改。
3. **原子能力源码质量推导**:
   - 8 套单元测试 `tests/unit/*.mjs` 是真实测试 `packages/agent-control-plane/` 源码的，31 个单元测试全部通过。
   - Helper 3、Helper 4、Helper 8 核心算法逻辑真实存在，不存在硬编码欺骗。
   - 但各 Helper 对外接口缺乏防御性兼容，导致与下游调用方（如 E2E 套件及外部 Orchestrator Harness）产生协议摩擦。

---

## 3. Caveats (审查边界与说明)

1. **产生原因溯源**:
   - 经审查团队上下文，`teamwork_test_writer_r2_1` 在前期为了提前沉淀 4-Tier E2E 测试资产，在 Worker 尚未交付前编写了参考实现与 fixture。
   - 随后 `teamwork_worker_m1_r2_1` 独立编写了更规范的 `packages/agent-control-plane/`。
   - 两个 Agent 交付后，未由 Worker 或中间层将 `tests/test-agent-control-plane-e2e.mjs` 与真实 `packages/agent-control-plane/` 进行对齐接轨，留下了这一严重脱节。
2. **不归咎于恶意欺诈**:
   - 本次脱节属于并行开发流程中的“集成断层”，但在门禁质量标准下，由于测试产生了“全绿通过”的假象，必须严格定性并要求打通。

---

## 4. Conclusion (裁决结论)

**裁决**: 🛑 **REQUEST_CHANGES (拒绝合并，要求整改)**

### 必须整改项清单 (Action Items):

1. **[Critical / INTEGRITY VIOLATION] 打通 E2E 测试真实链路**:
   - 修改 `tests/test-agent-control-plane-e2e.mjs`，将其从 `tests/fixtures/session-2efe9e50-mock.mjs` 的 mock 类引用彻底切换为从 `packages/agent-control-plane/index.mjs` 引入真实类。
   - 删除 `session-2efe9e50-mock.mjs` 中多余的 8 个 mock 类副本，保留纯数据 fixture。
2. **[Major] 统一 Helper 3, 4, 8 接口契约**:
   - **Helper 3 (`ProgressiveDisclosureHelper`)**: 在类中提供兼容别名：
     `renderLevel1(...) -> renderLayer1(...)`，`renderLevel2(...) -> renderLayer2(...)`，`renderLevel3(...) -> renderLayer3(...)`，或使参数同时支持 `(id, options)` 与 `(id, content, maxChars)`。
   - **Helper 4 (`StepScrubberHelper`)**:
     在 `scrubSessionHistory` 中，兼容获取步数索引：
     `const turnIndex = typeof entry.turnIndex === 'number' ? entry.turnIndex : (typeof entry.step === 'number' ? entry.step : entry.turn);`；
     并在 `compressHeadTail(text, optionsOrHead, tailLines)` 中同时支持对象传参与位置数字传参。
   - **Helper 8 (`SkillCapsuleHelper`)**:
     在 `loadOrDistill(skillName, fileOrContent, cacheDir)` 中，通过判定 `fs.existsSync` 或内容长度智能兼容“文件路径”与“直接传入 Markdown 字符串”；
     在返回对象中增加 `fromDiskCache: boolean` 指示器。
3. **[Minor] 修复 Helper 3 与 Helper 4 边界小缺陷**:
   - 修复 `ProgressiveDisclosureHelper.renderLayer2` 在 `maxChars < 4` 时的负数 slice 逻辑。
   - 修复 `StepScrubberHelper.compressHeadTail` 在仅跳过 1 行时不折叠，避免折叠提示文本字符数超过原行。

---

## 5. Verification Method (独立复核与整改验证指令)

整改完成后，通过以下步骤进行全闭环复核：

1. **复核 E2E 真实引用关系**:
   ```bash
   grep "from '../packages/agent-control-plane" tests/test-agent-control-plane-e2e.mjs || grep "from './fixtures/session-2efe9e50-mock.mjs'" tests/test-agent-control-plane-e2e.mjs
   ```
   **期望结果**: 必须仅从 `packages/agent-control-plane` 引入 Helper 类，严禁从 mock fixture 引入 Helper 类。

2. **运行全量单测**:
   ```bash
   node --test tests/unit/*.mjs
   ```
   **期望结果**: 8 个 Suite，31 个 Test 全部 ✔ PASS。

3. **运行直连真实的 E2E 验收测试**:
   ```bash
   node --test tests/test-agent-control-plane-e2e.mjs
   ```
   **期望结果**: 4 个 Suite，21 个 Test 在加载真实包的情况下全部 ✔ PASS。

---

## 6. Review & Adversarial Challenge Report

### Review Summary
- **Verdict**: REQUEST_CHANGES
- **Confidence**: 100% (基于运行时实测与代码 AST 比对)

### Detailed Findings

#### [Critical] Finding 1: E2E 验收套件与真实控制平面源码完全断链 (INTEGRITY VIOLATION)
- **What**: `tests/test-agent-control-plane-e2e.mjs` 假象全绿（21/21 Pass），实际 import 的是 `tests/fixtures/session-2efe9e50-mock.mjs` 中手写的 300 行假实现。真实 `packages/agent-control-plane/` 源码未受任何 E2E 检验。
- **Where**: `tests/test-agent-control-plane-e2e.mjs:19-27` 与 `tests/fixtures/session-2efe9e50-mock.mjs:111-412`。
- **Why**: 违反了“严禁通过自闭环 mock 代替真实代码独立验收”的红线规约。
- **Suggestion**: 移除 mock 类，直接对接 `packages/agent-control-plane/index.mjs`。

#### [Major] Finding 2: `StepScrubberHelper` 字段硬编码导致通用历史接入失效
- **What**: `StepScrubberHelper.mjs:89` 仅读取 `entry.turnIndex`。若下游以 `entry.step`（如 E2E 套件及标准 SDK 轨迹）传入，衰减静默失效。
- **Where**: `packages/agent-control-plane/helpers/step-scrubber/StepScrubberHelper.mjs:89-90`。
- **Suggestion**: 改为 `const turnIndex = entry.turnIndex ?? entry.step ?? entry.turn;`。

#### [Major] Finding 3: `SkillCapsuleHelper` 缺少对内存 Markdown 内容及缓存命中状态的支持
- **What**: `loadOrDistill` 仅接受磁盘路径，若传入字符串则报错；且返回对象缺少 `fromDiskCache` 布尔标识，导致调用方无法判断缓存命中率。
- **Where**: `packages/agent-control-plane/helpers/skill-capsule/SkillCapsuleHelper.mjs:129-164`。
- **Suggestion**: 智能识别文件路径或字符串内容，并在返回对象中注入 `fromDiskCache`。

#### [Minor] Finding 4: `ProgressiveDisclosureHelper` 极小 `maxChars` 下切片溢出
- **What**: 当 `maxChars < 4` 时，`maxChars - 4` 变为负数切片，导致字符串反向截断变长。
- **Where**: `packages/agent-control-plane/helpers/progressive-disclosure/ProgressiveDisclosureHelper.mjs:93`。
- **Suggestion**: `output.slice(0, Math.max(0, maxChars - 4)) + '...]'`。

#### [Minor] Finding 5: `StepScrubberHelper` 临界行折叠导致 Token 反向增加
- **What**: 当 `skipped === 1` 时，单行被替换为 65 字符的折叠标记，不仅未精简 Token，反而增加了上下文体积。
- **Where**: `packages/agent-control-plane/helpers/step-scrubber/StepScrubberHelper.mjs:58`。
- **Suggestion**: 仅当 `skipped > 1`（即 `totalLines > threshold + 1`）时才进行折叠。

### Verified Claims
- [Unit Test Coverage] 8 套单测 31 个用例全通 → verified via `node --test tests/unit/*.mjs` → PASS
- [Line Count Constraints] 18 个源文件行数均在 31~198 行之间，严格 <= 600 行 → verified via `wc -l` → PASS
- [Helper Zero Cross-Import] Helper 之间零交叉引用，100% 独立解耦 → verified via AST/grep → PASS
- [Capsule Length <= 180] 正常及巨量输入下 Layer 2 微胶囊长度严格 <= 180 字符 → verified via node runtime → PASS
- [Chunk-Aligned Step=6] 前 6 轮 0 字节抖动，达标后保留头 6 尾 6 折叠中间 → verified via unit test → PASS
- [SkillCapsule SHA-256 Cache & Hot-Reload] 哈希计算、落盘缓存与修改后自动淘汰旧缓存生效 → verified via node runtime → PASS

### Coverage Gaps
- E2E 真实集成覆盖率：0%（当前 E2E 套件仅覆盖 mock 类，需整改对齐后重新执行）。
