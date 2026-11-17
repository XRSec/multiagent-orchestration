---
doc_id: SPEC-PROMPT-TOPOLOGY-AND-ISOLATION
status: CURRENT
version: 1.1.0
last_verified: 2026-11-12
language: en-US
---

# Prompt Topology and Isolation Specification

## 1. Prime Isolation Principle
The multiagent orchestration system operates on two strictly decoupled prompt planes:

| Plane | File SSOT | Target Audience | Purpose & Scope |
|---|---|---|---|
| **Host / Project Dev Plane** | `AGENTS.md`, `CLAUDE.md` (Project Root) | Human Developers & Host Coding Assistants (Claude Code, IDEs) | Project-level coding standards, directory conventions, repo skills, Git squash rules, test gates. **NEVER injected into multiagent runtime sessions!** |
| **App Runtime Plane** | `Customizations/prompts/` | The 7 Mo-Bots executing inside the running daemon/web app | Multi-agent collaboration protocols (`<group-Action>`, `NO_REPLY`), single-speaker discipline, process-first output, safe operations. |

## 2. Two-Tier Runtime System Prompt Assembly Pipeline
Both tiers are strictly part of the **System Prompt** (NEVER pushed into User Messages):

```
[System Prompt Final Envelope]
├── 1. Tier 1: Runtime System Baseline (default-system-prompt.md or custom-system-prompt.md)
├── 2. Tier 2: App Global Directives (default-global-prompt.md or custom-global-prompt.md)
└── 3. Tier 3: Partner Micro-Kernel Body (<BotName>.md, <= 80 lines + links to shards/)
```

### Tier 1: System Baseline Contract (`default-system-prompt.md`)
- **Nature**: Underlying engine and runtime baseline.
- **Scope**: Headless execution, `<group-Action>` action envelope syntax, terminal process safety.
- **Override**: If the partner directory provides `custom-system-prompt.md`, it replaces `default-system-prompt.md`.
- **Opt-Out**: Setting `x-mo.inheritDefaultSystemPrompt: false` excludes Tier 1 entirely.

### Tier 2: App Global Directives (`default-global-prompt.md`)
- **Nature**: Team collaboration and business operating guidelines.
- **Scope**: Single-Speaker protocol, `NO_REPLY` silent skips, director vs specialist boundaries, process-first formatting. Spliced immediately after Tier 1.
- **Override**: If the partner directory provides `custom-global-prompt.md`, it replaces `default-global-prompt.md`.
- **Opt-Out**: Setting `x-mo.inheritDefaultGlobalPrompt: false` excludes Tier 2 entirely.

### Tier 3: Partner Micro-Kernel & On-Demand Shards
- `<BotName>.md`: The partner's distinct micro-kernel persona (<= 80 lines).
- `shards/*.md`: Heavy operational rubrics, templates, and specifications. Not injected into the system prompt; read on-demand via tools.

## 3. Tri-Tier Skills Governance & Runtime Mounting Architecture
To reconcile prompt cache economy with extensive tooling capabilities, skills attached to a companion are governed across three distinct operational tiers:

```
[Agent Skill Registry]
├── 1. Active Preloaded Skills (Pre-mounted plugins; zero-latency invocation)
├── 2. On-Demand Skills Library (Metadata-only prompt index; dynamic runtime retrieval)
└── 3. Prohibited Skills (Explicit execution blocklist)
```

### 3.1 Preloaded vs On-Demand Taxonomy
1. **Tier 1: Active Preloaded Skills (`skills`)**:
   - **Runtime Action**: Physically loaded as native plugins into Claude Code via `ClaudeSdkRunner.ts` (`collectAllowedSkillPlugins`).
   - **System Prompt Footprint**: Injected under `### Active Preloaded Skills (核心常驻工作法)` with `(ACTIVE PLUGIN)` designation.
   - **Execution Invariant**: Agents are commanded to adhere to these workflows and commands by default.
2. **Tier 2: On-Demand Skills Library (`onDemandSkills`)**:
   - **Runtime Action**: Excluded from initial plugin mounting to preserve token budget, TTFT speed, and prompt cache hit rate.
   - **System Prompt Footprint**: Exposed under `### On-Demand Skills Library (按需查阅库)` as lightweight name/description indexes.
   - **Execution Invariant**: Agents only retrieve and execute these dynamically when a task explicitly demands them via `Skill(skill="name")`.
3. **Tier 3: Prohibited Skills (`disallowedSkills`)**:
   - **Runtime Action**: Blacklisted from invocation.
   - **System Prompt Footprint**: Injected under `### Prohibited Skills (Explicitly Disabled)` as a hard boundary restriction.

### 3.2 Dynamic Search Hierarchy & Discovery
Skill discovery traverses three filesystem tiers in order of precedence:
1. `Customizations/skills/`: Workspace-specific project skills.
2. `~/.multiagent-orchestration/skills/`: Global user skills managed by multiagent orchestration.
3. `~/.agents/skills/`: Shared user agent skills directory.

Both the MCP resolution layer (`agentProfileMcp.ts`) and HTTP catalog controller (`skills-controller.ts`) scan across this unified hierarchy. The web interface (`BotCapabilityMatrix.tsx`) asynchronously fetches this catalog on mount (`/api/skills?scope=all&target=bot:${botId}`), allowing developers to configure per-bot skill tiers dynamically.

## 4. Full-Fidelity System Prompt Binding (`soul_md` SSOT)
The companion persona editor in `src/web` enforces single-source-of-truth data binding to eliminate information loss:
- **SSOT Integrity**: Roster, session, and home views bind `systemPrompt: b.soul_md || b.soulSummary || ''`.
- **Clamp Elimination**: Replaces the legacy 300-character `soulSummary` truncation clamp, allowing full operational directives (often 2,000+ characters) to be inspected and edited without truncation.
- **Dynamic Metric Feedback**: Both `BotSettingsDrawer.tsx` and `BotSettingsSubpages.tsx` compute `{length} 字符 · {lines} 行` reactively on input changes, providing immediate visual feedback of prompt footprint.

## 5. Benefits of Decoupling
1. **Zero Context Leakage**: Host development directives do not pollute the operational context of the 7 Mo-Bots.
2. **Polymorphic Autonomy**: Partners can opt out of global rules or provide specialized system prompts with zero boilerplate.
3. **Extreme Attention Focus & Cache Economy**: System Prompts stay ultra-lean (< 500 tokens for baseline), reserving high-density tokens for active task specifications and keeping on-demand skills out of the hot cache until required.

## 6. Structured User Prompt Envelopes (`RuntimeEnvironment.ts`)
To prevent prompt injection, ambiguous context blending, and conversational drift across multi-bot rounds, user and peer inputs are encapsulated inside rigid, standardized XML envelopes:

```xml
<turn_context>
  <room_id>room_multiagent_orchestration</room_id>
  <current_speaker>bot_mocode_engine_01</current_speaker>
  <turn_index>3</turn_index>
</turn_context>

<peer_messages_delta>
  <!-- Incremental, de-duplicated messages from peer bots since last turn only -->
  [bot_moadmin_director_03]: Please inspect the router lazy loading regression.
</peer_messages_delta>

<user_request>
  <!-- Verbatim user request with zero synthetic alteration -->
  优化移动端首屏加载速度并排查滚动问题
</user_request>
```

- **Invariant**: The runtime parser extracts `<user_request>` verbatim while preserving exact user keywords, code snippets, and identifiers.
- **Delta Feeding**: Peer messages are strictly differential (`peer_messages_delta`), containing only net-new entries since the bot's prior activation to avoid quadratic token explosion in long group conversations.

## 7. In-Situ Prompt Diet & Context Compaction Engine (`PromptDietService.ts`)
To sustain high concurrency and long multi-turn sessions without context overflow:

### 7.1 Fast-Path Heuristic Trimming
- **Bureaucratic Noise Elimination**: Strips conversational preambles ("好的，我明白了", "根据您的要求，我现在开始执行以下步骤", "请稍候...") and repetitive pleasantries.
- **Intermediary Tool Result Compaction**: Collapses large, verbose `<invoke>` raw payloads into compact signatures with line/byte metrics once their downstream artifacts are confirmed.

### 7.2 Deep Context Compaction
- Automatically assesses cumulative session token expenditure.
- In-situ rewrites older historical turns into condensed semantic summaries without truncating the critical recent turn context or breaking transcript JSONL physical invariants.
- **Verification**: Verified via `test/prompt-diet-chain.test.ts`.
