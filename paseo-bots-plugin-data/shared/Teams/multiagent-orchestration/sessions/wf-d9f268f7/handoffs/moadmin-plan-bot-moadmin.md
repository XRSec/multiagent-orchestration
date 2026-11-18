已完成阶段 1（`moadmin-plan`：意图解析与任务拆解），并将本次 `/open-claude-ui`（CDS）全量可见 UI 优化任务的验收门禁（DoD）、宿主架构约束与 7 阶段 DAG 边界写入会话黑板 [TASK_MANIFEST.md](file:///Users/xr/.paseo/plugin-data/paseo-bots/shared/Teams/multiagent-orchestration/sessions/wf-d9f268f7/TASK_MANIFEST.md) 及仓库 [TASK_MANIFEST.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/.t3/TASK_MANIFEST.md)。

<worker_handoff>
STATUS: PASS
SUMMARY:
Parsed objective and architectural constraints for applying Claude Design System (CDS, `/open-claude-ui`) optimizations across `paseo-bots/client/**` and any additional visible UI surfaces discovered during recon, respecting React Native (`react-native` / `react-native-web`) + `@getpaseo/plugin` `PluginTheme`. Initialized both the session blackboard `TASK_MANIFEST.md` and repo `.t3/TASK_MANIFEST.md` with 5 binary DoD criteria, risk watchpoints, and strict specialist write-scope boundaries (`bot-modeep` read-only recon -> `bot-mocode` implementation & tests -> `bot-moci` QA verification -> `bot-moadmin` review -> `bot-modoc` docs write-back -> `bot-moadmin` finalize).

TOUCHED_FILES:
- /Users/xr/.paseo/plugin-data/paseo-bots/shared/Teams/multiagent-orchestration/sessions/wf-d9f268f7/TASK_MANIFEST.md
- /Users/xr/IDEA.localized/multiagent-orchestration/.t3/TASK_MANIFEST.md

VERIFICATION_PROOF:
- Command: `ls -la .t3/ && find paseo-bots/client -maxdepth 3 -type f | sort` + `cat paseo-bots/package.json`
- Exit_Code: 0
- Key_Output:
  - Inventoried `paseo-bots/client/**` surfaces (`ChatPane`, `chat/stream/*`, `Composer`, `launcher/*`, `BotSidebar*`, `analytics/*`, `teams/*`, `WorkflowsScreen`, `RoutinesScreen`, `settings/*`, `library/*`, `panel/*`, `ui/*`, `theme.ts`, `motion.ts`, `typography.ts`).
  - Confirmed `paseo-bots/package.json` scripts: `"typecheck": "tsc --noEmit"` and `"test": "vitest run"`.
  - Both session and repo `TASK_MANIFEST.md` files written and verified.

DOD_CHECKLIST:
- [x] Parsed user intent, host React Native + `PluginTheme` constraints, and 5 DoD criteria.
- [x] Initialized session blackboard `TASK_MANIFEST.md` and repo `.t3/TASK_MANIFEST.md`.
- [x] Defined unambiguous DAG stages and specialist boundaries for `bot-modeep`, `bot-mocode`, `bot-moci`, and `bot-modoc`.

OPEN_ISSUES:
- Downstream `bot-modeep` must check `paseo-sidecar/`, `extensions/`, and `tools/` for any additional visible UI surfaces outside `paseo-bots/client/**` and verify whether `vitest run` and/or `bun test` are both supported.
</worker_handoff>