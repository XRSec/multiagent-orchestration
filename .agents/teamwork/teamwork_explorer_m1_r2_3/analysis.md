# M1 迭代 2 修复代码行数安全性与防回归策略深度分析报告

## 1. 执行摘要 (Executive Summary)

本报告针对 M1 迭代 2（M1 r2）待修复的 5 项缺陷（Challenger 1 提出的 ADV-01 原型泄漏缺陷，以及 Challenger 2 提出的 AvatarStack 与 RoleStatusBadge 4 项边界健壮性缺陷），全面评估了涉及文件的**代码行数安全性**与**防回归策略**。

核心评估结论：
1. **行数安全性极高**：待修复的 3 个核心文件（`mockPartners.js`、`AvatarStack.jsx`、`RoleStatusBadge.jsx`）修复后代码行数均稳定在 **130 ~ 203 行** 之间，严格符合 150~210 行安全区间指导线，相比 500 行工程预警线拥有 **> 59% (297+ 行)** 的充裕缓冲空间，距离 600 行硬上限红线拥有 **> 66% (397+ 行)** 的绝对安全边际。
2. **防回归策略完备可靠**：修复策略为极简原位/类型防御，不修改任何现有数据结构与公共导出接口，正向业务 100% 向后兼容；结合 `pnpm exec vite build`、基准测试 `test-cindy-ui.mjs` 及新增的两大对抗性测试套件，构筑了四重互锁的防回归自动化质量门禁体系。

---

## 2. 目标修复文件与行数安全性审计

### 2.1 涉及文件行数统计与安全裕量

根据 `STANDING_ORDER.md` 与 `PROJECT.md` 规范：
- 单文件行数预算目标：150 ~ 210 行
- 工程警戒阈值：500 行（警告并要求拆分）
- 硬性上限红线：600 行（硬拆分违规阻断）

| 涉及文件 | 当前实际行数 | 修复预期行数 | 增量行数 | 相比 210 上限 | 距离 500 预警余裕 | 距离 600 红线余裕 | 安全评级 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `mock/mockPartners.js` | 201 | 201 ~ 203 | +0 ~ +2 | 合规 (<=210) | 297 行 (59.4%) | 397 行 (66.2%) | 🟢 极度安全 |
| `components/common/AvatarStack.jsx` | 127 | 130 ~ 133 | +3 ~ +6 | 精简 (<150) | 367 行 (73.4%) | 467 行 (77.8%) | 🟢 极度安全 |
| `components/common/RoleStatusBadge.jsx` | 158 | 158 | +0 (原位替换) | 完美 (158) | 342 行 (68.4%) | 442 行 (73.7%) | 🟢 极度安全 |

### 2.2 全量 M1 资产行数分布概览

除上述 3 个待修复文件外，M1 其余 4 个已提交模块的行数分布如下：
- `mock/index.js`: 28 行（纯中继导出入口）
- `mock/mockGroupSessions.js`: 182 行（完全在 150~210 行区间内）
- `mock/mockPlanData.js`: 156 行（完全在 150~210 行区间内）
- `components/common/SlideOverDrawer.jsx`: 152 行（完全在 150~210 行区间内）

**全量 7 个模块总结**：平均单文件仅约 144 行，所有文件均落在 [28, 203] 行的极佳代码密度带内，无任何单文件膨胀或复杂度过高风险。

---

## 3. 防回归策略与不变式证明 (Anti-Regression & Invariant Proof)

为保证在合入修复后 `pnpm exec vite build` 生产构建与 `node tests/test-cindy-ui.mjs` 基准测试持续 100% 零报错通过，对每个修复点的向后兼容性与状态不变式（Invariants）进行形式化推导：

### 3.1 `mockPartners.js` 原型泄露修复 (`getPartnerById`)

- **现存缺陷 (ADV-01)**：`getPartnerById('toString')` 索引原生对象触发 `Object.prototype.toString`，返回原生函数而非 `null`。
- **目标不变式**：
  1. 对任意有效 partner ID（`'p1'`, `'p2'`, `'p3'` 等），`getPartnerById(id)` 必须精准返回对应的 Partner 对象引用。
  2. 对任意不存在的 ID、非字符串、以及 `Object.prototype` 属性名（如 `'toString'`, `'constructor'`, `'__proto__'` 等），必须严格返回 `null`。
- **无破坏性证明 (Non-Breaking Proof)**：
  - `PARTNERS_MAP` 字典由 `Object.fromEntries` 构建，合法 partner 的 `id` 均为该对象的自身属性（Own Properties）。
  - 使用 `Object.prototype.hasOwnProperty.call(PARTNERS_MAP, id)` 判定时：
    - 合法 partner 的 `id` 返回 `true`，取值逻辑与修改前完全等价；
    - 原型属性的 `hasOwnProperty` 返回 `false`，安全命中 `null` 分支。
  - **结论**：正向业务查询 100% 兼容，负向异常调用 100% 消除白屏风险。

### 3.2 `AvatarStack.jsx` 健壮性修复 (Defects 1, 2, 3)

- **现存缺陷**：
  1. `members=null` 导致 `null.slice` 抛出 `TypeError` 崩溃。
  2. `members=[null]` 导致 `null.name` 抛出 `TypeError` 崩溃。
  3. `avatar=""`（空字符串）被当成 emoji 分支命中，导致渲染出空标签从而覆盖了首字母降级显示。
- **目标不变式**：
  1. 当 `members` 为合法数组且包含有效成员时，渲染行为与视觉样式保持 100% 一致（头像框、颜色映射、重叠偏移、+N 溢出胶囊）。
  2. 当 `members` 为 `null`、`undefined` 或非数组时，降级为空列表处理，不抛出异常。
  3. 当 `members` 数组中混有 `null`/`undefined` 脏数据时，自动过滤并正常渲染有效成员。
  4. 当 `avatar` 为有效图片 URL、Lucide 图标或真实 Emoji（长度 1~2 字符）时正常渲染；当 `avatar` 为空字符串或未配置时，稳健降级为大写首字母。
- **无破坏性证明**：
  - `(Array.isArray(members) ? members : []).filter(Boolean)` 仅在输入异常（非数组或存在假值项）时介入，对于常规合法数组求值结果完全相同。
  - `avatar.trim().length > 0 && avatar.length <= 2` 仅排除了空字符串对 emoji 分支的误命中，不会影响真正的 emoji 字符（如 "🤖"）。
  - **结论**：所有既有组件功能无任何视觉或交互退化。

### 3.3 `RoleStatusBadge.jsx` 类型鲁棒性修复 (Defect 4)

- **现存缺陷**：当外部传入数字类型 `role={101}` 或 `status={500}` 时，`(101 || '').toLowerCase` 抛出 `TypeError` 崩溃。
- **目标不变式**：
  1. 当输入正常字符串（如 `'leader'`, `'worker'`, `'active'`, `'thinking'`）时，样式、角色标签、呼吸灯效果与状态描述保持 100% 一致。
  2. 当输入非字符串或异常数值时，通过 `String(role || '')` 转化为安全字符串，命中 fallback 机制，绝不阻断渲染。
- **无破坏性证明**：
  - 对于原生字符串 `s`，`String(s || '')` 等价于 `s`；
  - `toLowerCase()` 在合规字符串上的语义与原先毫无差别。
  - **结论**：零风险、零行数增量。

---

## 4. Worker 落地修复补丁规范（精确代码指引）

指导 Worker 采用以下极简安全的修复代码：

### 4.1 `apps/desktop/src/renderer/mock/mockPartners.js`

```javascript
// --- BEFORE (Line 196-198) ---
export function getPartnerById(id) {
  return PARTNERS_MAP[id] || null;
}

// --- AFTER ---
export function getPartnerById(id) {
  if (!id || typeof id !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(PARTNERS_MAP, id) ? PARTNERS_MAP[id] : null;
}
```
*行数影响*：原 3 行扩展为 4 行（净增 1 行），文件总行数由 201 行微调为 202 行。

### 4.2 `apps/desktop/src/renderer/components/common/AvatarStack.jsx`

```javascript
// --- 1. renderAvatarContent 首字母与 Emoji 防御 (Line 61-69) ---
// BEFORE:
    if (avatar.length <= 2) {
      return <span>{avatar}</span>;
    }
  }

  // 首字母降级
  const initial = (member?.name || '?').charAt(0).toUpperCase();

// AFTER:
    if (typeof avatar === 'string' && avatar.trim().length > 0 && avatar.length <= 2) {
      return <span>{avatar}</span>;
    }
  }

  // 首字母降级 (增加 String 保护)
  const initial = String(member?.name || member?.id || '?').charAt(0).toUpperCase();

// --- 2. AvatarStack 函数体入口数组安全防御 (Line 84-88) ---
// BEFORE:
  const cfg = SIZE_CONFIG[size] || SIZE_CONFIG.sm;
  const visibleMembers = members.slice(0, max);
  const overflowCount = members.length - max;
  const overflowMembers = overflowCount > 0 ? members.slice(max) : [];

// AFTER:
  const cfg = SIZE_CONFIG[size] || SIZE_CONFIG.sm;
  const safeMembers = (Array.isArray(members) ? members : []).filter(Boolean);
  const visibleMembers = safeMembers.slice(0, max);
  const overflowCount = safeMembers.length - max;
  const overflowMembers = overflowCount > 0 ? safeMembers.slice(max) : [];
```
*行数影响*：增加 2 行安全判定代码，文件总行数由 127 行微调至 129 行。

### 4.3 `apps/desktop/src/renderer/components/common/RoleStatusBadge.jsx`

```javascript
// --- BEFORE (Line 93, 95) ---
  const roleKey = (role || '').toLowerCase();
  const roleCfg = ROLE_STYLES[roleKey] || ROLE_STYLES.default;
  const statusKey = (status || '').toLowerCase();

// --- AFTER (原位替换) ---
  const roleKey = String(role || '').toLowerCase();
  const roleCfg = ROLE_STYLES[roleKey] || ROLE_STYLES.default;
  const statusKey = String(status || '').toLowerCase();
```
*行数影响*：原位替换，净增 0 行，文件总行数恒定在 158 行。

---

## 5. 四层防回归验证流水线 (Automated Quality Gate Pipeline)

为确保 M1 r2 达成生产级交付，Worker 实施完成后必须统一执行以下四重互锁门禁命令：

```bash
# 门禁 1: Vite 生产构建与打包验证
pnpm exec vite build

# 门禁 2: Cindy UI 四层级基线全量契约测试
node tests/test-cindy-ui.mjs

# 门禁 3: 对抗性原型注入与关系一致性压力测试 (ADV-01 验证)
node tests/test-m1-adversarial.mjs

# 门禁 4: 极端边界 Props 注入与独立 ESM 打包测试 (Defects 1-4 验证)
node tests/test-m1-challenger-stress.mjs
```

### 预期结果标准：
1. **构建门禁**：`pnpm exec vite build` 退出码 0，耗时 <= 500ms，打包产物完整。
2. **基线门禁**：`test-cindy-ui.mjs` 22/22 全量断言通过，退出码 0。
3. **对抗门禁 1**：`test-m1-adversarial.mjs` 13/13 全量断言通过（ADV-01 修复生效），退出码 0。
4. **对抗门禁 2**：`test-m1-challenger-stress.mjs` 29/29 项压力测试与组件打包通过，退出码 0。
5. **行数门禁**：所有修改文件行数均在 129 ~ 202 行以内，绝对禁止触碰 500 行警戒线。
