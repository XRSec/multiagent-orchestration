<!--
name: "Skill: Setup Cowork"
description: "Six-step Cowork onboarding flow: role, plugins, connectors, try a skill, writing voice, and wrap-up"
ccVersion: "2.1.280"
variables:
  - "COWORK_ROLE_SELECTION_STEP_BLOCK"
-->
# Guided setup

Walk the user through six steps: role, plugins, connectors, try a skill, writing voice, wrap.

## Step 0 — Checklist

Before your first user-facing message, create a TODO list with these exact six items (no sub-items) and mark each complete as you finish it:

1. Figure out role
2. Suggest plugins
3. Suggest connectors
4. Try a skill
5. Set up writing voice
6. Wrap up

${COWORK_ROLE_SELECTION_STEP_BLOCK}

## Step 2 — Suggest plugins

1. **Handle role result:** If the picker was dismissed/empty or the plain-text question was skipped, default to the productivity plugin (after `ListPlugins`, search `SearchPlugins` with `["productivity"]`; if empty, skip the recommendations widget).
2. **Check installed plugins first (mandatory):** Call `ListPlugins` with **no intro text** — never presume a non-empty result before the tool runs. Admin-provisioned plugins appear automatically; never skip this call. React below the rendered widget:
   - Installed plugins returned: `"Those are already on your account — here's what else fits your role."`
   - Empty: `"No plugins yet — let's fix that."`
3. **Search and rank:** Call `SearchPlugins` for their role.
   - Exclude already-installed plugins from recommendations (never show the same plugin in both widgets).
   - Rank organization-published plugins first; any loosely relevant org plugin outranks generic marketplace plugins. Use generic plugins only to fill empty slots.
4. **Recommend:** Pass the top 1–3 matches to `SuggestPluginInstall` with `trigger` unset.
   - If empty, search `["productivity"]` and suggest the returned plugin (never invent an ID). If still empty, skip the widget and move to connectors.
   - If every good match is already installed, skip the widget and say: `"You've already got the best plugin for [role] — let's move on to connectors."`
5. **Frame the widget (without describing Add/Manage buttons):**
   - Above: `"Here are plugins built for [role] work — each one adds a set of skills you can run with `/`."`
   - Below: `"Installing one drops its skills straight into your `/` menu so you can run them anytime. Once you've picked one, want me to pull up the connectors it uses so those skills have your real data behind them?"`
   - End your turn.

## Step 3 — Connectors

If they say yes:

1. Say: `"Let me check which connectors you've already got and what else your plugins could use."`
2. Cover **every plugin in play** (already installed + newly added). Call `SearchMcpRegistry` per plugin domain using the plugin name and user role as queries until each has results (results include `directoryUuid` and installation status). Do not drop relevant hits to prose.
3. Check connection status **before writing anything**:
   - If >=1 is connected, call `ListConnectors` with those names as keywords (no `"You're already connected to these:"` intro text). If none are connected, skip `ListConnectors`.
   - Call `SuggestConnectors` with **all** unconnected `directoryUuid`s surfaced by the searches. Place any prose **after** the widgets.
4. Below the widgets, say: `"Click any of these to connect it — once wired up, skills can pull your real data from it. Want me to list some skills you can try?"` End your turn.

## Step 4 — Try a skill

- If they say yes, call `ListSkills` with the plugin name and role as keywords (if empty, retry with no keywords). Introduce the card: `"Here's what [Plugin] adds — click any of these to run it now."` End your turn.
  - Note: this filtered card cannot answer account-wide skill checks in Step 5.
- When they click a skill (`/name`), help briefly within setup, then return: `"Nice — that's how skills work."`
- If they decline at either point, proceed to Step 5.

## Step 5 — Writing voice

Previous steps configured tools; this step configures the user's writing voice for prose sent under their name.

1. **Check account-wide skills first:** Inspect system context skills or call `ListSkills` with no keywords (never rely on Step 4's filtered card).
   - If `my-writing-style` is present (not `setup-writing-style`) or the user says they already have a profile, say only `"You've already got a voice profile, so anything I draft for you will use it"` and go to Step 6. Never tell a user they lack a profile based on a filtered widget.
   - If they explicitly want to update/redo it, treat as yes and invoke `setup-writing-style`.
   - If `setup-writing-style` is unavailable in this session, mark TODO done and go to Step 6.
2. **Offer setup (2–3 sentences of prose covering these beats, not a bulleted list):**
   - **What it does:** learns from writing they've already sent so drafts sound like them rather than generic AI prose.
   - **Cost:** ~2 minutes.
   - **Privacy:** uses only writing they authored; nothing saves without their review.
   - Ask without pressure: `"Want to do that now, or skip it?"`
3. **If yes:** Invoke `setup-writing-style` via the `Skill` tool (never improvise from memory) and let it run end to end without paraphrasing, re-explaining consent, or interleaving commentary. Setup is paused until one of three completion signals occurs:
   - Save tool reports success
   - User confirms the profile is saved (Save button clicks are invisible and won't update your skills list until next session; don't ask twice)
   - User asks to skip or move on
   Then mark TODO done and move to Step 6.
4. **If no or deferred:** Mark TODO done, say `"No problem. Whenever you want drafts to sound like you, just ask me to learn your writing voice."`, and move to Step 6 (don't sell it twice).

## Step 6 — Wrap

- Close concisely: `"You're set. Start a new task from the sidebar anytime, or type `/` to see your skills."`
- If they still have no voice profile, append one clause: `"…and whenever you want drafts to sound like you, just ask me to learn your writing voice."`

<ground_rules>
- Proceed one step at a time; keep each message to 2–3 sentences plus the widget.
- Skips are fine: mark the step's TODO done and advance.
- NEVER write text presuming a tool result before the tool runs; call the tool first and react below the widget.
- Handle mid-flow skill invocations (including `setup-writing-style`), then resume setup through Step 6.
- If a named tool is unavailable in this session, skip its card and continue in plain text.
</ground_rules>