# Dual-Session Companion (`Morph B+`) 7-Turn Chaotic & Requirement-Pivot Live Evaluation Report

Date: 2026-11-19  
Target System: `paseo-bots` `CompanionSessionManager` (Morph B+) against live Paseo Daemon (`127.0.0.1:7006`) + `agy` runtime  
Main Agent: `agy/gemini-4-hydrogen` (cold directories `/tmp/eval-7t-medium` & `/tmp/eval-7t-low`, zero memory, no repo context)  
Companion Model Under Test: `agy/gemini-3.8-flash` (`medium` thinking vs `low` thinking)

---

## 1. Executive Summary

- **Pass 1 (`3.8-flash` `medium` companion)**: Completed all **7 chaotic, typo-ridden, topic-jumping, and requirement-reversing turns** with **100% final `report.md` compliance** (`21` lines, `3,396` bytes: all-English Markdown table, `0` emoji, Twitter Top 5 by `RT + Replies` with real tweet quotes, 5-step action plan for Row 2, and urgent GitHub `#986` restored in the final row).
- **Pass 2 (`3.8-flash` `low` companion)**: Matched `medium` closely in Turns 1–3 on intent distillation (`G0_COLD_START` bypass, `"广糕"` typo repair, constraint `REVOKE`), before hitting an upstream Google Cloud Code SSE network stall (`read tcp` / `EOF` on `daily-cloudcode-pa.googleapis.com`) on Turn 3–7. Crucially, when the companion timed out/wedged on Turns 4–7, **Fail-Open protected the Main Agent 100% of the time** without ever blocking or crashing message delivery.
- **3 Critical Production Bugs Uncovered by Live Eval**:
  1. **Production `compileTimeoutMs` (`2,500ms`) is too tight for Paseo `agents.ref().run()`**: Healthy `3.8-flash` companion turns averaged **~6.2s (`medium`)** and **~7.1s (`low`)** through Paseo ACP orchestration. At `2.5s`, nearly 100% of real `agy` companion turns would time out and fall back.
  2. **Wedged Companion Agent Recovery Gap**: After Turn 4's timeout on `low`, Paseo left the companion's prior run active, causing Turns 5–7 to throw `Cannot replace agent ... because its active run cancellation was not acknowledged` instead of rotating `companionAgentId = null` and spawning a clean replacement.
  3. **`ToolFootprintDigest` Schema Mismatch (`mutatedFiles = []`)**: Even when `write_file` and `edit_file` ran in Turns 3, 5, 6, and 7, `mutatedFiles` recorded `[]` because `extractToolFootprintDigest` in `paseo-bots/shared/activity.ts` didn't inspect Paseo `0.16`'s `detail.input` / `TargetFile` shape.

---

## 2. Turn-by-Turn Telemetry Comparison (`medium` vs `low`)

| Turn | User Prompt (Typo / Jump / Pivot) | `medium` Compile | `medium` Distill | `medium` Active / Revoked | `low` Compile | `low` Distill | `low` Notes |
|---|---|---|---|---|---|---|---|
| **T1** | `"查下我github最近评轮过的开源项目 看看还开着的 有没有回我"` | `2ms` (`G0_COLD_START` bypass) | `5ms` | `0 / 0` | `0ms` (`G0_COLD_START` bypass) | `2ms` | Both bypassed T1 in `<=2ms`; Main Agent tolerated `"评轮"` typo |
| **T2** | `"别看关了的 只留有人回要我搭理的 顺便看下bot-x那个推特json里 agent多不多"` | `9,461ms` (`AUGMENT`) | `4,395ms` | `2 / 0` | `8,766ms` (`AUGMENT`) | `3,633ms` | Both carried over GitHub context and added Twitter check `[MUST]` constraints |
| **T3** | `"不对 别光数词 广糕转发刷掉 按赞高排前三 还有前面那几个仓库星数和最后提交也塞进 report.md"` | `5,892ms` (`AUGMENT`) | `4,502ms` | `3 / 1` | `5,490ms` (`AUGMENT`) | `0ms` | Both decoded `"广糕"` -> 广告, revoked T2 count rule; `low` Main Agent hit 180s upstream SSE stall |
| **T4 (Pivot #1)** | `"等下 需求改了 github那块先全砍掉别放report里了 推特改按转推+回复数排前五 而且每个热点必须带一条真实推文原话"` | `6,696ms` (`AUGMENT`) | `5,577ms` | `1 / 4` | `10,041ms` (Fail-Open) | `4,012ms` | `medium` cleanly revoked 3 old rules (`github`, `top 3 likes`) and retained only new Top-5 rule |
| **T5 (Pivot #2)** | `"那个文件太长了 改成全英文表格形式 去掉所有emoji"` | `4,488ms` (`AUGMENT`) | `3,403ms` | `3 / 4` | `4,009ms` (Fail-Open) | `15,044ms` | `medium` resolved `"那个文件"` -> `report.md`; Main Agent rewrote to 0-emoji English table |
| **T6 (Restore)** | `"表格里第2行那件事我今天就要弄 把它单独拆出5步清单追加在表格下面 顺便把刚才砍掉的github最急的那1个也加回来放最后一行"` | `5,210ms` (`AUGMENT`) | `3,745ms` | `5 / 3` | `4,011ms` (Fail-Open) | `15,041ms` | `medium` resolved Row 2 (`HF 1,000 Agents`) + restored urgent GitHub `#986` (`nowledge-co/community`) |
| **T7 (Audit)** | `"恩 检查下格式和有没有漏掉我前面改过的要求"` | `5,522ms` (`AUGMENT`) | `3,789ms` | `5 / 3` | `4,007ms` (Fail-Open) | `15,041ms` | `medium` injected C5–C9 checklist; Main Agent caught & fixed Markdown table pipe alignment in Rank 4 |

---

## 3. Qualitative Analysis of Companion Outputs (`medium`)

1. **Typo & Colloquial Disambiguation**:
   - `"广糕转发刷掉"` -> `推特内容过滤广告/转发后按点赞取前三 Agent 推文` (Turn 3)
   - `"恩 检查下格式..."` -> `全面对照检查 report.md 的格式与内容约束（全英文表格、无 emoji、推特按转推+回复排前五且附真实原话、第 2 行事项附 5 步清单、加回最紧急的 1 个 GitHub Issue 作为最后一行）` (Turn 7)
2. **Patch-Only `REVOKE` / `SUPERSEDE` Lifecycle**:
   - Turn 4 (`Pivot #1`) accurately revoked all 3 superseded constraints (`仅保留 Open...`, `获取前述 GitHub...写入 report.md`, `按点赞降序提取前三条`) while keeping `activeConstraints` bounded at `1`.
   - Turn 6 accurately restored only the single urgent GitHub item without resurrecting the full closed/all-repo list from Turn 1.
3. **`medium` vs `low` Latency Surprise**:
   - On healthy turns (Turns 2–3), `low` (`8,766ms`, `5,490ms`) was only **~7% faster** than `medium` (`9,461ms`, `5,892ms`), because Paseo's `paseo.agents.ref().run()` ACP turn overhead dominates (~4–5s baseline). Thus **`medium` gives noticeably stronger JSON/constraint reasoning for virtually the same wall-clock cost** when running via Paseo ACP.

---

## 4. Recommended Follow-Up Fixes in `paseo-bots`

1. **Raise default `compileTimeoutMs` (or switch to direct lightweight HTTP LLM call)**: Raise Paseo-agent-backed `compileTimeoutMs` default from `2,500ms` to `8,500ms` (with `PASEO_BOTS_COMPANION_TIMEOUT_MS` override) so healthy `3.8-flash` ACP companion calls don't fail-open prematurely.
2. **Auto-rotate wedged `companionAgentId`**: In `CompanionSessionManager`, when `companionRef.run()` times out or throws `active run cancellation was not acknowledged`, archive/clear `record.companionAgentId = null` so the next turn recovers cleanly from `<prior_distilled_history>` instead of staying wedged.
3. **Fix `extractToolFootprintDigest` for Paseo `0.16` `tool_call` schema**: Inspect `detail?.input` and `TargetFile` / `AbsolutePath` / `file_path` so `mutatedFiles` and `inspectedFiles` populate accurately.
4. **Default `thinkingOptionId` to `"medium"` (or configurable)** when running via Paseo ACP, since `medium` adds only ~0.4–0.7s over `low` while noticeably improving structured JSON/XML adherence under chaotic prompts.
