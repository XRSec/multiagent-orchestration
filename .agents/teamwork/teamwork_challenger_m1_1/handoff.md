# Empirical Challenge Handoff Report — M1 Mock Data & Atoms

## 1. Observation (客观观察)

1. **基准测试执行 (`node tests/test-cindy-ui.mjs`)**：
   - 执行结果：100% 通过（22/22 断言通过，退出码 0，耗时 0.70s）。
   - M1 覆盖的 6 个组件及 Mock 数据导出均被验证，单文件行数扫描（17 个渲染端文件全部 `<= 600 行`，最大为 `App.jsx` 374 行），Vite 生产构建打包成功。

2. **自建对抗性压力测试 (`node tests/test-m1-adversarial.mjs`)**：
   - 编写并执行了 13 项包含原型链污染、负向边界输入、跨实体引用一致性、状态机流转与高吞吐压测（100,000 次查询）的严格实证测试。
   - 测试产物路径：`tests/test-m1-adversarial.mjs` (392 行，符合 `<= 600` 行规范)。
   - 执行输出（退出码 1）：
     ```text
     ▶ Starting M1 Empirical Adversarial Challenge Suite...

     ================================================================
     1. Prototype Pollution & Reserved Object Identifier Attacks
     ================================================================
       ✗ [CHALLENGE-FAILED] ADV-01: getPartnerById must safely reject Object.prototype properties ("toString", "constructor", "__proto__")
         Defect Detail: Vulnerability: getPartnerById('toString') resolved to prototype property [function: function toString() { [native code] }] instead of null
     + actual - expected

     + [Function: toString]
     - null

       ✓ [CHALLENGE-PASSED] ADV-02: getPartnerById handles abnormal inputs (null, undefined, non-strings, symbols)
       ✓ [CHALLENGE-PASSED] ADV-03: getGroupSessionById handles prototype keys and abnormal inputs safely
       ✓ [CHALLENGE-PASSED] ADV-04: getPlanById handles prototype keys and abnormal inputs safely

     ================================================================
     2. Relational Integrity & Dangling Reference Audit
     ================================================================
       ✓ [CHALLENGE-PASSED] ADV-05: All group session members and lead partner exist in mockPartners
       ✓ [CHALLENGE-PASSED] ADV-06: All activePlanId and embedded plan messages reference existing plans in mockPlanList
       ✓ [CHALLENGE-PASSED] ADV-07: All plan organizers and step assignees map to valid partners in mockPartners
       ✓ [CHALLENGE-PASSED] ADV-08: Message quotes must reference valid existing message IDs within the same session

     ================================================================
     3. Boundary Data & State Invariant Stress Testing
     ================================================================
       ✓ [CHALLENGE-PASSED] ADV-09: Sandboxing policies enforce strict separation between allowedTools and disallowedTools
       ✓ [CHALLENGE-PASSED] ADV-10: SOUL.md & MEMORY.md adhere to frontmatter structure and non-trivial content length
       ✓ [CHALLENGE-PASSED] ADV-11: Message sequences are strictly 1-indexed and timestamps are strictly non-decreasing
       ✓ [CHALLENGE-PASSED] ADV-12: Plan step indices are strictly continuous and status transitions match plan lifecycle

     ================================================================
     4. High-Throughput & Fuzzing Stress Harness (100,000 Iterations)
     ================================================================
         Performance benchmark: 100,000 lookup operations completed in 10ms
       ✓ [CHALLENGE-PASSED] ADV-13: Execute 100,000 random/fuzzed queries across all lookup helpers within 500ms
     ```

3. **代码源码缺陷定位**：
   - 目标文件：`apps/desktop/src/renderer/mock/mockPartners.js`
   - 代码行号：第 194-198 行：
     ```javascript
     194: export const PARTNERS_MAP = Object.fromEntries(mockPartners.map((p) => [p.id, p]));
     195: 
     196: export function getPartnerById(id) {
     197:   return PARTNERS_MAP[id] || null;
     198: }
     ```
   - 相比之下，`mockGroupSessions.js`（第 177-179 行）与 `mockPlanData.js`（第 151-153 行）均使用 `.find((item) => item.id === id) || null`，不存在该原型泄露缺陷。

---

## 2. Logic Chain (推理链条)

1. **由代码实现推导原型属性泄漏**：
   - `PARTNERS_MAP` 是通过 `Object.fromEntries` 创建的原生 JavaScript 对象，默认继承自 `Object.prototype`。
   - 当调用 `getPartnerById('toString')`、`getPartnerById('constructor')` 或 `getPartnerById('valueOf')` 时，由于这些键存在于 `Object.prototype` 上，`PARTNERS_MAP['toString']` 解析为原生函数（`function toString() { [native code] }`）。
   - 在布尔运算中，函数对象是 Truthy 值，因此 `PARTNERS_MAP[id] || null` 短路返回该函数，而不是预期的 `null`。

2. **由原型泄露推导前端崩溃风险（Blast Radius）**：
   - 在后续 M2（伙伴私聊路由）与 M3（伙伴配置抽屉）中，页面通常根据路由参数或搜索关键字动态查询伙伴，例如：
     ```javascript
     const partner = getPartnerById(partnerId);
     if (!partner) return <NotFound />;
     return <div>{partner.skills.map(...)}</div>;
     ```
   - 若 `partnerId` 为 `'toString'` 或来自未过滤输入，`partner` 将是一个函数对象。判断 `if (!partner)` 不会触发。
   - 随后访问 `partner.skills` 得到 `undefined`，紧接着调用 `.map()` 将直接触发不可捕获的 `TypeError: Cannot read properties of undefined (reading 'map')`，导致整个 React 组件树崩溃白屏。

3. **修复方案论证（轻量、确定、无副作用）**：
   - 方案 A（利用 `hasOwnProperty`）：
     ```javascript
     export function getPartnerById(id) {
       return Object.prototype.hasOwnProperty.call(PARTNERS_MAP, id) ? PARTNERS_MAP[id] : null;
     }
     ```
   - 方案 B（使用 Map 或纯数组 find）：
     ```javascript
     export function getPartnerById(id) {
       return mockPartners.find((p) => p.id === id) || null;
     }
     ```
   - 两种修复方式均只需 1~3 行代码，不影响任何合法业务逻辑，同时 100% 消除该漏洞。

---

## 3. Caveats (潜在考量与假设)

- **单向只读约束遵从**：作为 Challenger，遵循 `Review-only — do NOT modify implementation code` 禁令，未直接修改 `apps/desktop/src/renderer/mock/mockPartners.js`，交由 Worker 或后续修整处理。
- **其他维度表现优秀**：除 `ADV-01` 外，其余 12 项对抗性指标（包含数据闭环、沙箱黑白名单零冲突、时间序列单调性、计划状态机完整性及 10 万次压测）均表现稳健，整体 Mock 体系设计非常专业扎实。

---

## 4. Conclusion (结论与实证裁决)

- **综合风险评估**：**MEDIUM**
- **实证裁决**：**`REQUEST_CHANGES`**
- **原因总结**：`apps/desktop/src/renderer/mock/mockPartners.js` 的 `getPartnerById` 辅助函数存在原型链属性泄漏缺陷（调用 `getPartnerById('toString')` 等返回函数而非 `null`），未能满足边界健壮性契约。
- **改动诉求**：对 `getPartnerById` 增加 `hasOwnProperty` 过滤或改用 `mockPartners.find(...)`，使 `tests/test-m1-adversarial.mjs` 测试 100% 通过。

---

## 5. Verification Method (验证方法)

1. **执行基准测试套件**：
   ```bash
   node tests/test-cindy-ui.mjs
   ```
   *预期结果*：22 项断言全通过，退出码 0。

2. **执行实证对抗性测试套件**：
   ```bash
   node tests/test-m1-adversarial.mjs
   ```
   *当前结果*：退出码 1，ADV-01 失败：`getPartnerById('toString') must return null, but returned function: function toString() { [native code] }`。  
   *修复后预期*：退出码 0，输出 `✅ VERDICT: APPROVE (All empirical stress tests passed)`。
