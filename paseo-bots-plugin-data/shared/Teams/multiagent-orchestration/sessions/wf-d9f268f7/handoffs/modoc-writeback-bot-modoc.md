已完成阶段 6（`modoc-writeback`：架构文档与标准沉淀），将 `mocode-impl` 实现并经 `moadmin-review` 审批通过的 `paseo-bots/client/**` CDS 设计令牌、动效物理预设与交互边界保护契约写回 `docs/paseo/` 文档树并完成目录路由登记：

- 新增 [paseo-bots-client-ui-and-cds.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/paseo/paseo-bots-client-ui-and-cds.md)（`en-US`，83 行）：规范化记录 `nativeTokens`（`brandClay`/`brandClayPressed`/`brandClaySoft`/`warmPaper` 及禁用 `#000000`/`#ffffff`/`#fff`）、`Button` 单线边框与 `tabular-nums` 规则、`motion.ts` 弹簧预设与 `(0.16, 1, 0.3, 1)` 曲线及 `useReduceMotion()` 门控，以及 `isImeComposing` 与 `150ms` `canPinScrollToEnd` 冷却保护。
- 更新 [INDEX.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/paseo/INDEX.md) 与 [README.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/README.md)：注册 `client-ui-and-cds` 路由条目与目录行数索引。

<worker_handoff>
STATUS: PASS
SUMMARY:
- Created [paseo-bots-client-ui-and-cds.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/paseo/paseo-bots-client-ui-and-cds.md) in dense rule-first `en-US` documenting CDS color tokens (`brandClay`, `warmPaper`, zero `#000000`/`#ffffff`/`#fff`), single-stroke `Button` borders, `tabular-nums`, `motion.ts` spring/bezier presets + `useReduceMotion()`, `isImeComposing`, and `150ms` `canPinScrollToEnd` cooldown.
- Registered `[1.6] [client-ui-and-cds]` route in [INDEX.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/paseo/INDEX.md) and updated catalogue entries in [README.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/README.md).
TOUCHED_FILES:
- docs/paseo/paseo-bots-client-ui-and-cds.md (created, 83 lines)
- docs/paseo/INDEX.md (+1/-0 lines)
- docs/README.md (+2/-1 lines)
VERIFICATION_PROOF:
  - Command: `cd /Users/xr/IDEA.localized/multiagent-orchestration && git status --short -- docs/ && (rg -n "/Users/|/home/" docs/paseo/paseo-bots-client-ui-and-cds.md docs/paseo/INDEX.md docs/README.md && echo "D7_VIOLATION" || echo "D7_OK")`
  - Exit_Code: `0`
  - Key_Output: |
    M docs/README.md
    M docs/paseo/INDEX.md
    ?? docs/paseo/paseo-bots-client-ui-and-cds.md
    D7_OK
DOD_CHECKLIST:
  - [x] Write-back of verified CDS tokens, motion physics, and edge guards -> Recorded in `docs/paseo/paseo-bots-client-ui-and-cds.md` and linked from `docs/paseo/INDEX.md` & `docs/README.md`.
  - [x] Documentation standards (dense en-US, zero demo code, D7 path hygiene) -> Verified `D7_OK` with zero machine-specific absolute paths.
OPEN_ISSUES: None
</worker_handoff>