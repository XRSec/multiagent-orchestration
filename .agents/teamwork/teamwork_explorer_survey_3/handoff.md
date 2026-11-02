# Handoff Report: Frontend Architecture Survey for 4 Core Interfaces

## 1. Observation
1. **Repository Layout and Root Manifest (`package.json`)**:
   - `package.json` contains: `"dependencies": { "@anthropic-ai/claude-agent-sdk": "^0.3.316", "claude-code-parser": "^0.1.1", "lucide-react": "^1.66.0", "react": "^19.3.1", "react-dom": "^19.3.1" }` and `"devDependencies": { "@vitejs/plugin-react": "^6.1.2", "vite": "^8.3.5" }`.
   - Scripts: `"start": "node src/index.mjs chat"`, `"ui": "vite"`, `"test": "node tests/test-sdk-orchestrator.mjs"`, `"agents:link": "node scripts/link-agents.mjs"`. Currently no explicit `"typecheck"` script.
2. **Vite Configuration and Root (`vite.config.js`)**:
   - Lines 5-18: `root: path.resolve(__dirname, 'apps/desktop')`, `server: { port: 3000, host: '127.0.0.1' }`, `resolve: { alias: { '@': path.resolve(__dirname, 'apps/desktop/src') } }`.
   - `apps/desktop/index.html` loads Tailwind CSS from CDN (`https://cdn.tailwindcss.com`) with dark mode class and custom palette: `background: #090d16`, `surface: #0f172a`, `card: #1e293b`, `border: #334155`, `accent: #38bdf8`.
3. **Current Frontend Codebase (`apps/desktop/src/renderer/`)**:
   - `wc -l` results:
     - `App.jsx`: 373 lines
     - `main.jsx`: 9 lines
     - `components/ChatTimeline.jsx`: 237 lines
     - `components/MessageInput.jsx`: 198 lines
     - `components/NewChatEmptyState.jsx`: 99 lines
     - `components/PartnerStudio.jsx`: 109 lines
     - `components/RuntimeMonitor.jsx`: 97 lines
     - `components/SessionHeader.jsx`: 82 lines
     - `components/Sidebar.jsx`: 141 lines
     - `runtime/useClaudePartnerRuntime.ts`: 146 lines
   - All files are currently strictly below the 500-line warning threshold.
4. **Cindy Reference Material (`extensions/cindy/apps/desktop/src/renderer/features/bots/`)**:
   - `BotGroupChatView.tsx` is 1548 lines (monolithic).
   - `BotGroupPlan.tsx` is 573 lines, containing status keys (`proposed`, `running`, `done`, `failed`), step indicators, and follow-up actions.
   - `BotGroupLiveStatus.tsx` is 293 lines, containing live speaker banners, breathing pulse, elapsed timer, and interaction prompts.
   - `BotGroupSettingsDrawer.tsx` is 607 lines, containing group name, workdir, member management, speaking mode, and delete group actions.
   - `BotSettingsDrawer.tsx` is 199 lines with sub-settings (`BotMemorySettings.tsx`, etc.).
5. **Build and Verification Command Observation**:
   - Executing `pnpm exec vite build` succeeded in 344ms:
     `apps/desktop/dist/index.html 1.30 kB`
     `apps/desktop/dist/assets/index-C0LKPcPv.js 258.91 kB`
     Exit code: 0.

---

## 2. Logic Chain
1. *From Observation 1 & 2*: The frontend uses React 19 + Vite 8 + CDN Tailwind. Because Tailwind is loaded via CDN with runtime config injection, new Tailwind classes do not require PostCSS rebuilding.
2. *From Observation 3 & 4*: Cindy's implementation has several monolithic files (e.g. `BotGroupChatView.tsx` at 1548 lines) which violate this repository's `AGENTS.md` mandate (single file <= 600 lines, 500 lines warning). Directly copying Cindy files would fail repository quality gates.
3. *From Logic Chain 2*: To deliver the four core interfaces (Partner Direct Chat, Partner Group Chat, Partner Config Drawer, Group Settings Drawer) cleanly and safely, the frontend components must be decoupled into modular sub-components under `apps/desktop/src/renderer/views/` (direct-chat, group-chat, partner-drawer, group-drawer) and `apps/desktop/src/renderer/mock/`.
4. *From Observation 5*: `vite build` executes cleanly. Placing all new code within 15 decoupled modules ensures every single file stays between 90 and 280 lines (well under the 500-line warning ceiling and 600-line limit), passing both build and line count checks.

---

## 3. Caveats
1. **TypeScript Compiler Dependency**: The repository root currently does not include `typescript` in `devDependencies`, and no `tsconfig.json` exists at the root. Although Vite natively transpiles JSX and TSX, running a standalone `tsc --noEmit` command requires either adding `typescript` to `devDependencies` or using Vite build / lint as the compilation verification gate.
2. **Mock vs Production Backend**: The scope specifies a production-grade UI driven by Mock data. While the UI and state machines for all 4 interfaces will be complete, real-time backend IPC execution for multi-turn subagents remains mocked until Electron main process bridges are wired.

---

## 4. Conclusion
1. **Feasibility**: High. The existing React 19 + Vite 8 + Tailwind CDN architecture is fast, lightweight, and fully capable of supporting the four core interfaces with zero additional third-party dependencies required.
2. **Decomposition Blueprint**: The 4 interfaces are partitioned into 15 focused modules in `apps/desktop/src/renderer/views/` and `apps/desktop/src/renderer/mock/`, guaranteeing that no file exceeds 300 lines (comfortably below the 600-line hard ceiling).
3. **Delivery Artifacts**: Comprehensive architectural analysis is documented in `analysis.md`, covering technology stack, navigation, data models, verification methods, and precise layout planning.

---

## 5. Verification Method
1. **Compilation & Packaging Test**:
   ```bash
   pnpm exec vite build
   ```
   *Expected outcome*: Exit code 0, bundling completed without syntax errors.
2. **Local Preview Test**:
   ```bash
   pnpm run ui
   ```
   *Expected outcome*: Server starts on `http://127.0.0.1:3000`, browser loads the 3-column desktop shell.
3. **Line Count Audit**:
   ```bash
   wc -l apps/desktop/src/renderer/*.jsx apps/desktop/src/renderer/components/*.jsx apps/desktop/src/renderer/views/**/*.jsx apps/desktop/src/renderer/mock/*.js
   ```
   *Expected outcome*: All individual files <= 600 lines (with no file approaching 500 lines).
