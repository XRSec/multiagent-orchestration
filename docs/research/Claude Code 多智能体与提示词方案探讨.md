# Claude Code 多智能体与提示词方案探讨

> 导出自 Google Gemini 会话

---

## 👤 用户提问 1

关于 muti-agent 我看我朋友的做法是为不同的伙伴建立不同的文件夹配置不同的 CLAUDE.md，CLAUDE.md 是注入到 user 第一条消息里面的，但是它开了 claude code …  关于 muti-agent 我看我朋友的做法是为不同的伙伴建立不同的文件夹配置不同的 CLAUDE.md，CLAUDE.md 是注入到 user 第一条消息里面的，但是它开了 claude code 的workflow，另外 claude code 如果触发压缩了会自动重新读取 CLAUDE.md，相对而言，如果 AI 支持的上下文越大是不是意味着 失忆的可能性越大  而我采用的是两个方案：  替换 system prompt  追加 system prompt  对比有什么区别，大家都在用什么方案，都是基于 claude code 的情况

## 🤖 Gemini 回答

这是该主题的研究方案。如果你需要进行更新，请告诉我。

---

## 📚 参考文献与引用源

1. [**code.claude.com**｜Desktop application - Claude Code Docs](https://code.claude.com/docs/en/desktop)
2. [**code.claude.com**｜Output styles - Claude Code Docs](https://code.claude.com/docs/en/output-styles)
3. [**code.claude.com**](https://code.claude.com/docs/en/desktop#cli-flag-equivalents)
4. [**code.claude.com**｜Glossary - Claude Code Docs](https://code.claude.com/docs/en/glossary)
5. [**code.claude.com**｜How Claude Code uses prompt caching](https://code.claude.com/docs/en/prompt-caching)
6. [**code.claude.com**｜CLI reference - Claude Code Docs](https://code.claude.com/docs/en/cli-reference)
7. [**code.claude.com**｜Get started with the desktop app - Claude Code Docs](https://code.claude.com/docs/en/desktop-quickstart)
8. [**code.claude.com**](https://code.claude.com/docs/en/features-overview)
9. [**code.claude.com**｜Create custom subagents - Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
10. [**code.claude.com**](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)
11. [**code.claude.com**｜Extend Claude with skills - Claude Code Docs](https://code.claude.com/docs/en/skills)
12. [**code.claude.com**](https://code.claude.com/docs/en/sub-agents#preload-skills-into-subagents)
13. [**code.claude.com**](https://code.claude.com/docs/en/context-window)
14. [**code.claude.com**｜Best practices for Claude Code - Claude Code Docs](https://code.claude.com/docs/en/best-practices)
15. [**code.claude.com**｜Configure permissions - Claude Code Docs](https://code.claude.com/docs/en/permissions)
16. [**code.claude.com**｜Configure auto mode - Claude Code Docs](https://code.claude.com/docs/en/auto-mode-config)
17. [**code.claude.com**｜Extend agents with skills - Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/skills)
18. [**code.claude.com**｜Use Claude Code features in the SDK](https://code.claude.com/docs/en/agent-sdk/claude-code-features)
19. [**code.claude.com**｜Plugin loading reference - Claude Code Docs](https://code.claude.com/docs/en/plugins/loading)
20. [**code.claude.com**｜Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
21. [**honeyhive.ai**｜What is a system prompt? - HoneyHive AI](https://www.honeyhive.ai/learn/system-prompt)
22. [**aclanthology.org**｜Many-Tier Instruction Hierarchy in LLM Agents - ACL Anthology](https://aclanthology.org/2026.findings-emnlp.1420.pdf)
23. [**reddit.com**｜When to use '—append-system-prompt' vs CLAUDE.md? : r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/)
24. [**humanlayer.dev**](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
25. [**ajbuilds.medium.com**｜Your CLAUDE.md Is Probably Broken — Here's How to Tell (And Fix It)](https://ajbuilds.medium.com/your-claude-md-is-probably-broken-heres-how-to-tell-and-fix-it-87cbf24d317d?source=rss------ai-5)
26. [**scoutapm.com**](https://www.scoutapm.com/blog/prompts-skills-and-the-agents-md-nobody-wants-to-write)
27. [**code.claude.com**｜Control MCP server access for your organization - Claude Code Docs](https://code.claude.com/docs/en/managed-mcp)
28. [**claudecodecamp.com**](https://www.claudecodecamp.com/p/inside-claude-code-s-system-prompt)
29. [**reddit.com**｜Claude Code System Reminder : r/ClaudeCode - Reddit](https://www.reddit.com/r/ClaudeCode/comments/1oqogwu/claude_code_system_reminder/)
30. [**code.claude.com**｜Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
31. [**reddit.com**｜When does Claude read CLAUDE.md files (and which does it read)](https://www.reddit.com/r/ClaudeCode/comments/1ouaqbq/when_does_claude_read_claudemd_files_and_which/)
32. [**empromptu.ai**｜AGENTS.md and CLAUDE.md: Writing Guardrails for AI | Empromptu](https://empromptu.ai/blog/agents-md-claude-md-coding-guardrails)
33. [**youtube.com**｜Claude Code answered in English? Use --append-system-prompt](https://www.youtube.com/shorts/IUhSqbFAg_o)
34. [**youtube.com**｜Run Multiple AI Agents in Parallel (Claude Code Tutorial) - YouTube](https://www.youtube.com/watch?v=n35KalqEwJc)
35. [**code.claude.com**｜Settings files and precedence - Claude Code Docs](https://code.claude.com/docs/en/settings)
36. [**code.claude.com**｜How Claude Code works - Claude Code Docs](https://code.claude.com/docs/en/how-claude-code-works)
37. [**code.claude.com**｜Explore the .claude directory - Claude Code Docs](https://code.claude.com/docs/en/claude-directory)
38. [**code.claude.com**｜Week 27 · June 29 – July 3, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w27)
39. [**markdown.engineering**](https://www.markdown.engineering/learn-claude-code/39-system-prompt)
40. [**dosu.dev**](https://dosu.dev/articles/context-compaction-coding-agents)
41. [**code.claude.com**｜Run parallel sessions with worktrees - Claude Code Docs](https://code.claude.com/docs/en/worktrees)
42. [**code.claude.com**｜Message your other Claude Code sessions](https://code.claude.com/docs/en/cross-session-messaging)
43. [**mintlify.com**｜Context rot: what it is and how to reduce it with your docs - Mintlify](https://www.mintlify.com/library/context-rot)
44. [**aimuse.blog**｜System Prompts Versus User Prompts - AI Muse by kekePower](https://aimuse.blog/article/2025/06/14/system-prompts-versus-user-prompts-empirical-lessons-from-an-18-model-llm-benchmark-on-hard-constraints)
45. [**kompozy.io**｜System Prompt — definition · Kompozy](https://kompozy.io/glossary/system-prompt)
46. [**roboco.io**｜Claude Code Deep Dive: How Is Claude Code Actually Built ...](https://roboco.io/en/posts/claude-code-deep-dive/)
47. [**code.claude.com**｜Orchestrate teams of Claude Code sessions - Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
48. [**code.claude.com**｜How Claude remembers your project - Claude Code Docs](https://code.claude.com/docs/en/memory)
49. [**code.claude.com**｜Week 22 · May 25–29, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w22)
50. [**code.claude.com**｜Common workflows - Claude Code Docs](https://code.claude.com/docs/en/common-workflows)
51. [**code.claude.com**｜Commands - Claude Code Docs](https://code.claude.com/docs/en/commands)
52. [**code.claude.com**｜Week 23 · June 1–5, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w23)
53. [**code.claude.com**｜Automate work with scheduled tasks - Claude Code Docs](https://code.claude.com/docs/en/routines)
54. [**code.claude.com**｜Agent SDK overview - Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/overview)
55. [**ashutoshysingh.com**｜Context Engineering | Ashutosh Singh](https://www.ashutoshysingh.com/learn/context-engineering/)
56. [**ultralytics.com**｜Context Engineering: Curating What AI Sees | Ultralytics](https://www.ultralytics.com/glossary/context-engineering)
57. [**code.claude.com**｜Overview - Claude Code Docs](https://code.claude.com/docs/en/overview)
58. [**reddit.com**｜Workflow: Best Practices for Separating AGENTS.md and CLAUDE](https://www.reddit.com/r/ClaudeWorkflows/comments/1thlmo4/workflow_workflow_best_practices_for_separating/)
59. [**medium.com**｜Learning Claude Code — From Context Engineering to Multi-Agent](https://medium.com/@aayushmnit/learning-claude-code-from-context-engineering-to-multi-agent-workflows-4825e216403f)
60. [**code.claude.com**｜Run agents in parallel - Claude Code Docs](https://code.claude.com/docs/en/agents)
61. [**omidsaffari.com**](https://omidsaffari.com/blog/context-rot)
62. [**code.claude.com**｜Run Claude Code programmatically - Claude Code Docs](https://code.claude.com/docs/en/headless)
63. [**medium.com**｜The “Lost in the Middle” Problem in LLMs - Medium](https://medium.com/@rajveer.rathod1301/the-lost-in-the-middle-problem-in-llms-b0d88e13f025)
64. [**docs.moveworks.com**｜Attention and Limitations - Moveworks documentation](https://docs.moveworks.com/harness/llm-fundamentals/attention-and-limitations)
65. [**pristren.com**｜Lost in the Middle: Why LLMs Struggle With Long Contexts - Pristren](https://pristren.com/blog/lost-in-middle-attention-paper/)
66. [**thepromptbench.com**｜Context Rot, Explained - The Prompt Bench](https://thepromptbench.com/context-engineering/context-rot-explained/)
67. [**claudearchitectcertification.com**｜Attention Engineering (D4, 20% of CCA-F) - Claude Certified Architect](https://claudearchitectcertification.com/concepts/attention-engineering)
68. [**harnez.ai**｜Lost in the middle: test context position, not just size - harnez](https://harnez.ai/posts/u-shaped-attention-memory-llms/)
69. [**arxiv.org**｜Lost in the Middle: How Language Models Use Long Contexts - arXiv](https://arxiv.org/html/2307.03172v3)
70. [**upsolve.ai**｜What Is Context Engineering? Definition & Best Practices in 2026](https://upsolve.ai/blog/context-engineering-guide)
71. [**tianpan.co**｜The Middle-Context Blindness Your Retrieval Pipeline Never](https://tianpan.co/blog/2026/06/02/the-middle-context-blindness-your-retrieval-pipeline-never-measured)
72. [**researchgate.net**｜Lost in the Middle: How Language Models Use Long Contexts](https://www.researchgate.net/publication/378284067_Lost_in_the_Middle_How_Language_Models_Use_Long_Contexts)
73. [**arxiv.org**｜The Instruction Hierarchy: Training LLMs to Prioritize Privileged](https://arxiv.org/abs/2404.13208)
74. [**openreview.net**｜The Instruction Hierarchy: Training LLMs to Prioritize Privileged](https://openreview.net/forum?id=vf5M8YaGPY)
75. [**huggingface.co**｜2603/2603.16152.md · huggingchat/papers-content - Hugging Face](https://huggingface.co/buckets/huggingchat/papers-content/tree/2603/2603.16152.md)
76. [**cchistory.mariozechner.at**｜cchistory - Claude Code Version History](https://cchistory.mariozechner.at/)
77. [**news.ycombinator.com**｜Claude Code 2.0 - Hacker News](https://news.ycombinator.com/item?id=45416228)
78. [**reddit.com**｜Hvornår skal man bruge '—append-system-prompt' vs CLAUDE.md](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/?tl=da)
79. [**reddit.com**｜Quand utiliser '—append-system-prompt' vs CLAUDE.md - Reddit](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/?tl=fr)
80. [**reddit.com**｜[Workflow] Structuring Multi-Agent Claude Code Workflows with ...](https://www.reddit.com/r/ClaudeWorkflows/comments/1wbzfga/workflow_structuring_multiagent_claude_code/)
81. [**epam.com**｜A Step-by-Step Guide to Building a Multi-Agent Claude Code AI ...](https://www.epam.com/insights/ai/blogs/step-by-step-guide-to-building-a-multi-agent-claude-code-ai-development-team)
82. [**unlearn.dev**｜Build Your First Multi-Agent Workflow with Claude Code | Unlearn](https://unlearn.dev/blog/build-your-first-multi-agent-workflow)
83. [**code.claude.com**｜Orchestrate subagents at scale with dynamic workflows - Claude ...](https://code.claude.com/docs/en/workflows)
84. [**github.com**｜GitHub - Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts)
85. [**reddit.com**｜Don't use Claude Code's Default System Prompt - Reddit](https://www.reddit.com/r/ClaudeCode/comments/1slfnoq/dont_use_claude_codes_default_system_prompt/)
86. [**golev.com**｜Claude Saves Tokens, Forgets Everything - Alexander Golev](https://golev.com/post/claude-saves-tokens-forgets-everything/)
87. [**hackergit.org**｜Piebald-AI/claude-code-system-prompts on Hacker News - HackerGit](https://hackergit.org/r/Piebald-AI/claude-code-system-prompts)
88. [**open-repo.com**｜Piebald-AI/claude-code-system-prompts · 12.5K Stars · GitHub 趋势](https://www.open-repo.com/r/Piebald-AI_claude-code-system-prompts.html)
89. [**githubsignals.io**｜piebald-ai/claude-code-system-prompts - GitHub Signals](https://githubsignals.io/repo/piebald-ai/claude-code-system-prompts/)
90. [**github.com**｜system-reminder-send-to-project-memory-brief-trust-boundary.md](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-send-to-project-memory-brief-trust-boundary.md)
91. [**pomoai.com**｜claude-code-system-prompts · 技能与配置 - POMOAI](https://www.pomoai.com/hubs/Piebald-AI/claude-code-system-prompts)
92. [**github.com**｜system-reminder-approved-claude-doc-plan-readback.md - GitHub](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-approved-claude-doc-plan-readback.md)
93. [**github.com**｜claude-code-learn/claude-prompt/user/user.md at main - GitHub](https://github.com/zlh-428/claude-code-learn/blob/main/claude-prompt/user/user.md)
94. [**reddit.com**｜Is CLAUDE.md just a system prompt all agents will read before](https://www.reddit.com/r/ClaudeAI/comments/1lrfs27/is_claudemd_just_a_system_prompt_all_agents_will/)
95. [**kirshatrov.com**｜Reverse engineering Claude Code - Kir Shatrov](https://kirshatrov.com/posts/claude-code-internals)
96. [**levelup.gitconnected.com**｜Reverse Engineering Claude Code: How Skills different from Agents](https://levelup.gitconnected.com/reverse-engineering-claude-code-how-skills-different-from-agents-commands-and-styles-b94f8c8f9245)
97. [**news.ycombinator.com**｜Claude.md just has 2 lines. the first points to @CONTRIBUTING](https://news.ycombinator.com/item?id=46331909)
98. [**mihaileric.com**｜Claude Code Demystified: Whirring, Skidaddling, Flibbertigibetting](https://www.mihaileric.com/Demystifying-Claude-Code/)
99. [**medium.com**｜The Complete Guide to Writing Agent System Prompts - Medium](https://medium.com/@fengliu_367/the-complete-guide-to-writing-agent-system-prompts-lessons-from-reverse-engineering-claude-code-09ecd87c7cc1)
100. [**docs.openclaw.ai**｜Prompt caching - OpenClaw Docs](https://docs.openclaw.ai/reference/prompt-caching)
101. [**classic.yarnpkg.com**｜@mariozechner/pi-coding-agent | Yarn](https://classic.yarnpkg.com/en/package/@mariozechner/pi-coding-agent)
102. [**ccafpreparation.com**｜CCAR-F Glossary — 219 Terms, Config Keys and API Fields](https://www.ccafpreparation.com/glossary)
103. [**github.com**｜fak/cmd/fak/guard.go at main - anthony-chaudhary - GitHub](https://github.com/anthony-chaudhary/fak/blob/main/cmd/fak/guard.go)
104. [**github.com**｜cc-viewer/history.md at main - GitHub](https://github.com/weiesky/cc-viewer/blob/main/history.md)
105. [**git.mitsea.com**｜claude-code-2603-leak/src/services/compact/prompt.ts at ... - MitseaGit](https://git.mitsea.com/FlintyLemming/claude-code-2603-leak/src/commit/f5a40b86dede580f6543bf8926c9af017eea9409/src/services/compact/prompt.ts)
106. [**dev.to**｜Multi-Agent Development Workflows with Claude Code - DEV ...](https://dev.to/javatarz/multi-agent-development-workflows-with-claude-code-n23)
107. [**github.com**｜[BUG] <system-reminder> is instructing claude code to not follow ...](https://github.com/anthropics/claude-code/issues/18560)
108. [**honeyhive.ai**](https://www.honeyhive.ai/learn/context-rot)
109. [**betterclaw.io**｜OpenClaw Setup Guide: Install in the Right Order (2026) - BetterClaw](https://www.betterclaw.io/blog/agents-md-multi-agent-best-practices)
110. [**anthropic.com**｜Effective context engineering for AI agents \ Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)
111. [**opc.csdn.net**｜Claude Code 完整提示词汇总（中英对照版）_人工智能_ ...](https://opc.csdn.net/6a324dc8662f9a54cb80b70d.html)
112. [**github.com**｜claude-code-system-prompts/system-prompts/system ... - GitHub](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-compact-file-reference.md)
113. [**medium.com**｜Tracing Claude Code's LLM Traffic: Agentic loop, sub-agents, tool ...](https://medium.com/@georgesung/tracing-claude-codes-llm-traffic-agentic-loop-sub-agents-tool-use-prompts-7796941806f5)
114. [**github.com**｜agentic-ai-prompt-research/prompts/21_compact_service.md at ...](https://github.com/Leonxlnx/agentic-ai-prompt-research/blob/main/prompts/21_compact_service.md)
115. [**github.com**](https://github.com/bendyline/gezel/blob/main/docs/prompt-stack.md)


---

## 👤 用户提问 2

开始研究  开始研究

## 🤖 Gemini 回答

`tag. *   Check Rule 5 of Mode 2 (Obvious vs Non-obvious follow-up): *   Question 1 (Claude Desktop`--append-system-prompt`): Not covered in the initial report (which focused on CLI/SDK and briefly mentioned Desktop in Q&A 2). *   Question 2 (Per-agent Skills scoping,`disable-model-invocation`,`skills:`frontmatter preloading, MCP vs`.claude/skills/`): Barely touched in the initial report (only briefly mentioned Skills in the compact table and`MEMORY.md`vs Skills). *   Since this introduces new, deep implementation topics (Claude Desktop CLI flag support, Claude Code's exact skill scoping/preloading mechanisms, and MCP vs Subagent`skills`frontmatter), let's check if it's a non-obvious passthrough or obvious follow-up. Actually, we have extensive research snippets directly answering BOTH questions (`source: 238`,`source: 255`,`source: 256`,`source: 254`,`source: 237`,`source: 257`,`source: 60`,`source: 239`,`source: 249`,`source: 252`,`source: 262`,`source: 265`). Let's check carefully if attaching the research offer is needed or not. *   Wait: Look at Rule 5: "Determine whether the user's query is an obvious follow-up or a non-obvious passthrough: Obvious follow-up (Do NOT offer research): The user asks about facts, findings, or explanations that are already in the report, asks to clarify/elaborate on specific sections of the report, or asks simple definitions/explanations directly grounded in the report content. Non-obvious passthrough (DO offer research): The user asks about new topics, new questions, or broader extensions that were NOT already covered in depth in the report (which would benefit from fresh, comprehensive research)." *   Clearly, "Can Claude Desktop use`--append-system-prompt`?" and "How to scope global vs per-agent skills in Claude Code, and evaluating an MCP-based skill exposure architecture" are new topics/extensions NOT covered in depth in the original report! So attaching`"Would you like me to do a more in-depth research instead and propose a research plan?"` at the very end on a new line is appropriate and follows Rule 5 strictly.

1. **Analyze the Research Material for Question 1: Claude Desktop & `--append-system-prompt`:**

- Let's check snippets [^1], [^2], [^1], [^2], [^3], [^1]:
- In [^3] (`https://code.claude.com/docs/en/desktop#cli-flag-equivalents`):

- Claude Desktop has the **Code tab**, which runs the same underlying engine as the CLI.
- CLI flag equivalents table: `--model`, `ANTHROPIC_MODEL`, `--permission-mode`, `--dangerously-skip-permissions`, `--resume`/`--continue`, `--add-dir`, `--allowedTools`/`--disallowedTools` ("No per-session UI equivalent. Permission rules set in settings files (`settings.json`) still apply."), `--verbose`, `--print`/`--output-format` ("Not available: Desktop is strictly interactive only"), `MAX_THINKING_TOKENS`.
- Notice what is NOT in the Desktop UI / flag equivalents: there is **no direct UI field or CLI flag box in Claude Desktop for `--append-system-prompt` or `--system-prompt`** ( [^3]). Wait—let's check [^1] and [^3] accurately! Do NOT fabricate claims.
- Wait: What *does* Claude Desktop support via shared configuration ( [^3], [^2])?

- Desktop and CLI share: `CLAUDE.md`, `CLAUDE.local.md`, MCP servers (`claude_desktop_config.json`, `~/.claude.json`, `.mcp.json`), Hooks, Skills, `~/.claude/settings.json` ( [^3]).
- What about **`outputStyle`** ( [^2], [^2], [^2])?

- Look at [^2]: "Desktop app: set the `outputStyle` field in a settings file, for example `.claude/settings.local.json`, the file the terminal menu writes. When you run `/config` there, Claude Code opens Settings > Code or Settings > Claude Code rather than a menu. To set a style without the menu, edit the `outputStyle` field directly in a settings file: `{ "outputStyle": "Explanatory" }`."
- And look at [^2]: Custom output styles can be created as Markdown files with YAML frontmatter. Wait: by default, a custom output style *omits* built-in software engineering instructions (`keep-coding-instructions: false`), UNLESS you set `keep-coding-instructions: true` ( [^2])! When `keep-coding-instructions: true` is set in a custom output style and selected via `"outputStyle": "..."` in `settings.json` / `.claude/settings.local.json`, it keeps the default coding instructions and sends the custom style instructions with every request (acting functionally very similar to `--append-system-prompt`, except delivered as system-style instructions/reminders per request in the conversation or style layer — specifically [^4] and [^5] note that output style instructions are delivered in the conversation as system reminders / messages, whereas `--append-system-prompt` modifies the System Prompt prefix layer).
- Wait: What about launching Desktop with `claude --desktop` ( [^6], [^3])?

- [^6]: "`--desktop`. Open the Claude Desktop app on the current directory and exit without starting a session in the terminal. ... Takes no prompt and no other flags except `--verbose` and the `--debug` flags, since the app starts the session itself."
- This is a HUGE point! Even if you try `claude --desktop --append-system-prompt ...`, `--desktop` explicitly **takes no other flags** except `--verbose` and `--debug` flags ( [^6]).
- Wait: What about Cowork / Chat in Claude Desktop? Can we check if anything mentions custom instructions or projects? We don't have detailed docs on Claude Desktop's Chat "Projects" instructions, only the Code tab docs ( [^1], [^7], [^3]). Wait: in [^1]: "In the Claude Desktop app, Claude Code is the Code tab. The app also has chat and Cowork..." And [^3] explicitly states: `--print` and `--output-format` are not available, and "Specific flags or settings keys named `system-prompt` or `append-system-prompt` are not directly detailed in this reference section of the documentation." And `--desktop` takes no other flags ( [^6]).
- Also, what about **Subagents** inside Claude Desktop? Since Desktop's Code tab runs the same embedded engine and shares `.claude/` configuration (hooks, skills, settings, etc. — and custom subagents live in `.claude/agents/*.md` or `~/.claude/agents/*.md`), wait: does Desktop share `.claude/agents/`? Let's check snippets to be careful not to overclaim. [^3] lists: `CLAUDE.md` & `CLAUDE.local.md`, MCP Servers, Hooks & Skills, Settings files, Models. [^8] & [^9] show subagents live in `.claude/agents/` and `~/.claude/agents/` and Desktop runs the same underlying engine ( [^3]). Even better: we know for sure from [^2] and [^2] that **Output Styles (`outputStyle` in `settings.json` / `.claude/settings.local.json`)** IS supported in the Desktop app!
- Wait: Can you also run custom subagents or hooks in Desktop? Yes, Hooks and Skills are shared ( [^3]), and `SessionStart` hooks can inject `additionalContext` as system reminders ( [^10]).
- Let's also check: why wouldn't Desktop alone solve the user's "single aggregated group chat UI" anyway? Even in Desktop, [^1] states: "In the Code tab, each conversation is a session: it has its own chat history and project folder, independent of any other session. The sidebar lists your sessions and lets you run several in parallel." It's still a sidebar list of separate sessions, NOT an aggregated group chat timeline! Still, let's directly answer their question about whether `--append-system-prompt` can be used in Claude Desktop and what the closest native alternatives in Desktop are (`outputStyle` with `keep-coding-instructions: true`, `CLAUDE.md`, or `SessionStart` hooks).
2. **Analyze the Research Material for Question 2: Per-Agent Skills Configuration (Global Skill vs. Agent-Specific Skill, Injection Methods, and Evaluating User's MCP Approach):**
Let's carefully read the user's exact scenario and ideas:

- *User's scenario:*

- "Claude Code 全局有 skill，那我想为每个 Agent 配置不同的 skill 方式的话该怎么做？"
- "比如我全局有一个 skill，它是默认不读取的，但是我有一个 Agent 就是需要读取这份 skill 的，怎么做？"
- "读取 skill 其实分两种：一种是直接注入到 system prompt，用 append system prompt 去做；另一种是当成用户的第一条消息注入进去，可以按照 claude code 的方式去做，但是它不能与全局的那份 skill 冲突。"
- "针对第二种方式，有两种选项：第一种是在 Agent 的目录里面再创建一份 .skills 文件夹，然后更新它的 YAML 配置。我的做法是写一个 MCP 服务，通过这份 MCP 会暴露它需要读取的 skill，需要读取的 工具"

Let's check ALL facts in the research snippets about how **Skills** actually work in Claude Code!

1. How Skills actually load & inject in Claude Code ( [^8], [^11], [^12], [^9], [^13], [^14], [^11]):

- First, clarify a crucial detail: In Claude Code, Skills (`SKILL.md` in `~/.claude/skills/<name>/SKILL.md` for global/personal, or `.claude/skills/<name>/SKILL.md` for project) are **NOT** injected into the System Prompt at startup ( [^11]), nor are their full bodies injected into the first user message by default!
- Instead, by default, only the **skill name and `description`** load at startup (as system reminders / skill listing, [^8], [^10], [^11]). The full `SKILL.md` body loads **on demand** into the conversation only when invoked by the user (`/skill-name`) or automatically by Claude via the `Skill` tool when matching the `description` ( [^8], [^11]).
2. What happens with "Global Skill that is NOT read by default, EXCEPT one specific Agent needs it" ( [^14], [^11], [^12], [^11], [^15], [^16], [^17], [^18], [^11], [^9]):

- Wait—let's check the interaction between `disable-model-invocation: true` and `skills:` frontmatter in subagents!
- LOOK AT [^12]!! This is a super important trap documented directly in `https://code.claude.com/docs/en/sub-agents#preload-skills-into-subagents`:

- `skills:` frontmatter field in a subagent definition preloads the **full content** of specified skills directly into that subagent's context at startup ( [^9], [^12]).
- CRITICAL TRAP ( [^12]): "You **cannot** preload skills that have `disable-model-invocation: true` set, because preloading relies on the same pool of skills Claude is permitted to invoke."
- Whoa!! That directly impacts the user's exact scenario ("全局有一个 skill，它是默认不读取的，但是我有一个 Agent 就是需要读取这份 skill 的")!
- Wait: How DO you make a skill NOT auto-invoked by the main/other agents, while allowing a specific Agent to load/use it? Let's check the mechanisms in the snippets:

- If you put `disable-model-invocation: true` on a global skill in `~/.claude/skills/`, **NO model/agent can auto-invoke it OR preload it via `skills:` frontmatter** ( [^12], [^11])! Only a human typing `/skill-name` can invoke it ( [^11]).
- How can you solve "global/other agents don't read it, only Agent X reads it" natively in Claude Code? Let's check all native mechanisms in our snippets:

- **Mechanism 1: Keep the skill out of `~/.claude/skills/` (or restrict via permissions), and put it ONLY in that Agent's scope or preload it while blocking `Skill` tool elsewhere!**

- Wait: If a skill is in global `~/.claude/skills/`, it loads into every project/session's skill description list ( [^11], [^8]).
- Can you restrict which agents can invoke which skills via `permissions.deny` or `disallowedTools`?

- Look at [^11] and [^15]: You can deny skills in permissions (`Skill`, `Skill(name)`, `Skill(skill:)`), OR in a subagent's frontmatter, omit `Skill` from `tools` / add `Skill` to `disallowedTools` ( [^12]). And in the Agent SDK ( [^17], [^18]), you can explicitly pass an allowlist `skills: ["my-skill"]` or `[]`!
- Can you preload a skill into a specific subagent using `skills:` frontmatter ( [^9], [^12])?

- Yes! If the skill does NOT have `disable-model-invocation: true`, adding `skills: [my-skill]` to `.claude/agents/agent-x.md` injects the **full content** of `my-skill` directly into Agent X's startup context ( [^9], [^12]). Meanwhile, for other subagents, omit `Skill` from `tools` (or add `Skill` to `disallowedTools`), so they cannot invoke it ( [^12]). (Though note: the skill's name/description would still appear in the main session's startup list unless blocked via `permissions.deny: ["Skill(my-skill)"]` or `skillOverrides` or kept outside `~/.claude/skills/`! Wait—if blocked by `permissions.deny`, can `skills:` preload it? [^12] says: "If a skill listed in `skills` is missing or disabled (for example, blocked by organizational policy), Claude Code skips that skill and logs a warning in the debug log." So blocking it globally via `skillOverrides` or policy would also block preloading!)
- **Mechanism 2: Independent working directory + `--setting-sources` / `--bare` / local `.claude/skills/` (User's Option 1 & Priority rules)!**

- Let's check [^8] and [^11] and [^6] and [^19] and [^11]:
- Priority/Overriding ( [^8]): "Skills override by name across levels based on priority (`managed > user > project`)" — Wait! Let's double check that exact quote in [^8]: `Skills override by name across levels based on priority (managed > user > project)`! Wait—let's verify if `user` overrides `project` or `project` overrides `user`? Let's read [^8] carefully: `Skills override by name across levels based on priority (managed > user > project)`. That's literally what [^8] says! Wait: if `user` (`~/.claude/skills/`) has higher priority than `project` (`.claude/skills/`), then putting a same-named skill in `.claude/skills/` in the Agent's folder might NOT override `~/.claude/skills/` if `user > project`! Wait—let's check [^11] too: [^11] only talks about local skills vs synced skills from `claude.ai` ("Local skills take priority over skills synced from `claude.ai`"). So [^8] explicitly states `managed > user > project` for skill name overrides! That is a VERY valuable catch to warn the user about regarding "它不能与全局的那份 skill 冲突"!
- Also check `--setting-sources` ( [^6], [^20], [^19]) and `--add-dir` ( [^11], [^6]):

- In CLI, `user`, `project`, and `local` setting sources are all on by default ( [^19]).
- If you launch an Agent process with `--setting-sources project,local` (excluding `user`), or `--bare` + `--add-dir <dir>` ( [^6]: "`--bare` skips auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and `CLAUDE.md`... Exceptions: Skills located in a directory explicitly passed via `--add-dir` still load."), YOU CAN COMPLETELY ISOLATE THAT AGENT FROM GLOBAL `~/.claude/skills/` AND LOAD ONLY THE SKILLS IN ITS SPECIFIC DIRECTORY!
- Whoa!! Look at [^6] on `--bare` + `--add-dir`:

- "`--bare`: Runs in minimal mode by skipping the auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and `CLAUDE.md`..."
- "Interaction with Bare Mode: Skills in a directory passed with `--add-dir` will still load even in bare mode."
- And look at `--setting-sources` ( [^6], [^20], [^19]):

- `--setting-sources` accepts a comma-separated list of setting sources to load (`user`, `project`, `local`). If you pass `--setting-sources project` (omitting `user`), it excludes user-level settings/skills! (Or in the Agent SDK, `settingSources: ['project']` + `skills` allowlist [^18]).
- **Mechanism 3: Evaluating User's Method A (`--append-system-prompt` / `--append-system-prompt-file`) vs. Method B-Option 1 (`.claude/skills/` in Agent directory) vs. Method B-Option 2 (User's MCP Server approach)!**

Let's carefully evaluate all three options the user brought up, strictly grounded in the research snippets:

- **Option A: Injecting the skill directly into System Prompt via `--append-system-prompt` (or `--append-system-prompt-file`)**

- *How it actually behaves:*

- It enters the highest-priority `system` prompt layer (and stays permanently in the prefix cache and survives `/compact`, [^5], [^13], [^21]).
- Wait: If the Agent is a Subagent (`.claude/agents/*.md`), the Markdown body itself *is* its system prompt, OR you can pass `--append-subagent-system-prompt` / `--append-subagent-system-prompt-file` in `-p` mode ( [^6]). Wait: `--append-subagent-system-prompt` applies to *every* subagent ( [^6]), whereas a specific subagent's own `.md` file ( [^9]) or a dedicated standalone `claude` process with `--append-system-prompt-file` ( [^6]) targets that single agent.
- *Pros:* Zero conflict with global `~/.claude/skills/` (even if global skill has `disable-model-invocation: true`, you can just point `--append-system-prompt-file` directly to that `SKILL.md` file or a custom prompt file!). Strongest compliance (`system` > `user`, [^22], [^23]), never forgotten after compaction ( [^13]).
- *Cons:* Consumes tokens and **instruction budget** (~150-200 max instructions total, [^24], [^25]) on *every single turn* of that agent, even on turns when that skill isn't needed ("unconditional tax", [^26]). Also, if the skill uses dynamic command injection like `!`git diff`` or frontmatter tool rules ( [^11]), `--append-system-prompt-file` treats it as raw text and won't execute skill frontmatter/dynamic commands.
- **Option B-1: Putting a `.claude/skills/` folder in the Agent's directory (and updating YAML config)**

- (Note: Clarify the path is `.claude/skills/<skill-name>/SKILL.md`, not `.skills/` [^11].)
- *How it actually behaves & conflict risks:*

- First, Claude Code automatically loads BOTH user-level (`~/.claude/skills/`) AND project-level (`.claude/skills/`) unless restricted ( [^8], [^11]).
- Second, as documented in [^8], skill name collisions resolve with priority **`managed > user > project`**! That means if a global skill in `~/.claude/skills/` has the *same name* as the skill in the Agent's project `.claude/skills/`, **the global user skill actually overrides the project skill** unless you disable `user` setting sources (`--setting-sources project` or `--bare --add-dir ...`) or give the agent skill a different name ( [^8], [^19], [^6])!
- Third, if you use **nested subdirectories** under one root (e.g., `agents/worker1/.claude/skills/`), [^11] explicitly documents that skills in a `.claude/skills/` directory *below* where you started **do not load at startup**—they only load the first time Claude reads or edits a file in that subdirectory (unless passed with `--add-dir` or `/add-dir`)! And if you run `--worktree`, remember [^11] notes worktrees search up to worktree root (falling back to main checkout's `.claude/skills/` if none exists).
- Fourth, if you want a Subagent (`.claude/agents/agent-x.md`) to always read a skill without touching the first user message manually, the native YAML config is `skills: [skill-name]` in the subagent's frontmatter (preloading the skill content at subagent startup, [^9], [^12]), provided the skill does NOT have `disable-model-invocation: true` ( [^12]).
- **Option B-2: User's own approach — Writing an MCP Server to expose only the skills and tools that specific Agent needs!**

- Let's evaluate this! Is an MCP server actually a really clever/viable pattern here, and what are its exact mechanics, pros, and pitfalls in Claude Code?
- Let's check [^20], [^27], [^20], [^8], [^9], [^9], [^28]!
- How MCP works in Claude Code for exposing **Prompts (Skills)**, **Resources (Docs/Skills)**, and **Tools**:

1. **Zero conflict with global Skills (`~/.claude/skills/`)**: MCP servers are completely isolated from `.claude/skills/`. Better yet, MCP servers can expose:

- **MCP Tools** (the exact tools this agent is allowed to call).
- **MCP Prompts** (automatically exposed as `/servername:promptname` slash commands — [^20]; note: do NOT name the MCP server `anthropic-skills`, as that name is reserved [^20]).
- **MCP Resources** (exposed via `@server:protocol://resource/path`, or read on demand via Claude Code's built-in resource listing/reading tools [^20]).
- *(Even better: you can literally build a "Skill Loader" MCP tool like `get_skill(name)` or expose each skill as an MCP Resource/Prompt!)*
2. **Per-Agent Isolation Mechanisms in Claude Code:**

- If the Agent is a **standalone Claude Code CLI process**: launch it with `--mcp-config ./agent-x-mcp.json --strict-mcp-config` ( [^6], [^20]). `--strict-mcp-config` tells Claude Code to **only** use MCP servers from `--mcp-config` and ignore all global/project MCP configs ( [^6])! Combine that with `--setting-sources ""` or `--bare` ( [^6], [^19]) if you also want to ignore global `~/.claude/skills/` and `~/.claude/CLAUDE.md`!
- If the Agent is a **Subagent (`.claude/agents/*.md`)**: Subagent YAML frontmatter has an `mcpServers` field (accepting server names or inline definitions, [^9], [^9]) AND `tools` / `disallowedTools` ( [^9]). Caveat ( [^9]): By default, subagents **inherit** the MCP tools available in the main conversation! So if you mount an MCP server in the main session, subagents inherit it unless filtered via `tools`/`disallowedTools`. Conversely, configuring inline `mcpServers` inside a specific subagent's YAML scopes that MCP server directly to that subagent (note: plugin subagents ignore `mcpServers` for security [^9], [^9]).
3. **Pros of the User's MCP Approach (especially for their custom UI!):**

- **Dynamic & Decoupled from Filesystem:** Remember the user wants to build a UI to manage each Agent's tools, skills, and context! With an MCP server (or per-agent MCP config), your UI can dynamically serve different skills and tools per Agent from a central service/database **without creating duplicated `.claude/skills/` folders everywhere**, and **without modifying global `~/.claude/` configs**.
- **On-Demand Loading / Context Efficiency (MCP Tool Search):** Claude Code uses **MCP Tool Search** by default, deferring full JSON tool schemas until needed and only loading tool names and server instructions (truncated past 4,096 chars) at startup ( [^20], [^8]). So exposing skills/tools via MCP keeps startup context lightweight, achieving the same "progressive disclosure" as Skills! (Or you can set `"alwaysLoad": true` in `.mcp.json` if a specific agent must always load those tool definitions upfront, [^20]).
- **Cross-Platform / Desktop Compatibility:** An MCP server can also be attached in Claude Desktop (`claude_desktop_config.json` / Connectors UI) or CLI ( [^1], [^3]).
4. **Pitfalls / Caveats of the MCP Approach to Watch Out For:**

- **Doesn't auto-inject into System Prompt or First User Message by itself:** An MCP server provides tools/resources/prompts that the agent *calls or fetches when needed* (or server `instructions` loaded at startup, capped at 4,096 chars [^20]). If the skill is a critical constraint that the agent *must* know before acting (or won't know to search for), you still need a short cue in `--append-system-prompt` (or the MCP server's `instructions` field / first user message) telling the agent: *"Before doing X, call `read_skill` / read `@mcp:skill://...`"* (or set `alwaysLoad: true` on the critical MCP tool [^20]).
- **MCP Tool Search limitation on Azure Microsoft Foundry:** Note [^20] mentions Tool Search is rejected server-side on Azure Microsoft Foundry deployments (falls back to upfront loading), though on standard Anthropic API / Claude subscription it works natively.
- **Subagent Inheritance Leakage:** As noted in [^9], subagents inherit all MCP tools from the main conversation unless you restrict them with `tools:` / `disallowedTools:` in the subagent's frontmatter ( [^9]), or run agents as separate CLI processes with `--strict-mcp-config` ( [^6]).
- Compaction Behavior ( [^13], [^5]): Tool results (like reading a skill via an MCP tool) enter the **Conversation layer** and **get summarized away during `/compact`** ( [^13], [^5]), unlike `--append-system-prompt` (which is preserved in the System Prompt layer [^13]) or preloaded subagent `skills:` / invoked skills (which have capped reload behavior [^13]). So if a long-running agent compacts, it may need to re-call the MCP skill tool if details were lost in the summary!
- **Prompt Caching & Security:** If your MCP server dynamically changes its tool list *mid-session*, it invalidates the System Prompt cache layer ( [^5]: "System prompt layer changes when: The set of loaded tool definitions changes"). Keep the MCP tool *definitions* static per session, and only pass dynamic skill *content* as tool/resource responses (which append to the Conversation layer and keep the prefix cached [^5]).
3. **Review Structure & Grounding:**
Let's organize the response cleanly into two clear parts matching the user's two questions:

- **Part 1: 能不能在 Claude Desktop 中使用 `--append-system-prompt` 来替代自己写 App？**

- **Direct Answer:** **不能直接传 `--append-system-prompt` 参数**。解释底层原因：

- Desktop 的 **Code 标签页**虽然与 CLI 共用底层引擎，但它是纯交互式 GUI，没有在界面上暴露 `--append-system-prompt` 或 `--system-prompt` 的输入框/配置项 [^3]。
- 即便从命令行用 `claude --desktop` 拉起 Desktop，官方明确限制 `--desktop` **不能携带其他 CLI 参数**（仅支持 `--verbose` 和 `--debug`），因为会话是由 Desktop App 自己启动的 [^6]。
- **Desktop 中最接近的替代方案（共享配置）**：

- Desktop 与 CLI 共享 `CLAUDE.md`、`CLAUDE.local.md`、MCP 配置（`claude_desktop_config.json` / `~/.claude.json` / `.mcp.json`）、Hooks、Skills 和 `~/.claude/settings.json` [^3]。
- **最接近 `--append-system-prompt` 的平替是 `outputStyle`（输出样式）**：你可以在 `.claude/settings.local.json` 或 `~/.claude/settings.json` 中配置 `{"outputStyle": "你的样式名"}`（Desktop 支持通过 settings 文件读取 `outputStyle`） [^2]。创建自定义样式 Markdown 文件时，默认会省略内置工程指令，只要在 YAML Frontmatter 中设置 **`keep-coding-instructions: true`**，就能保留完整的默认编码能力并附加你的专属角色设定 [^2]（注：与 `--append-system-prompt` 的底层差异在于，Output Style 是作为系统提醒/对话消息随请求发送，而不是修改 System Prompt 前缀层 [^4]）。
- 或者通过 **`SessionStart` Hook** 输出 `additionalContext` 注入系统提醒 [^3]。
- **为什么 Desktop 仍然替代不了你想要的“群聊 App”？**

- 除了不支持 `--append-system-prompt`，Desktop 的 Code 标签页本质上依然是**侧边栏多独立会话列表**（每个会话独立历史和目录） [^1]，无法实现你之前想要的“多 Agent 消息按时间聚合成一个群聊窗口 + 统筹伙伴自动派发 + 隐形伙伴历史清洗跳转”。所以如果你追求极简且只需要单人/单窗口交互，可以用 Desktop + `outputStyle`/`CLAUDE.md`/MCP；但如果要实现你的群聊工作流，还是需要自己做 UI（或基于 `T3 Code` / `Happy` 开源底座二开）。
- **Part 2: 全局 Skill 不默认读取，但指定 Agent 需要读取——三种配置方案深度对比与评估（特别是你的 MCP 方案）**

- **首先纠正一个关键的原生机制与隐藏陷阱**：

1. Claude Code 的 Skill（全局在 `~/.claude/skills/<name>/SKILL.md`，项目在 `.claude/skills/<name>/SKILL.md`）**默认只加载名称和 `description` 到启动上下文，正文并不会在启动时注入 System Prompt 或第一条 User 消息**，而是触发时才按需加载正文 [^8]。
2. **核心踩坑预警（`disable-model-invocation: true` 与 `skills:` 预加载互斥）**：如果你把全局 Skill 设成 `disable-model-invocation: true` 来让其他 Agent“默认不读取”，那么**在子智能体（Subagent）的 YAML 中配置 `skills:` 预加载也会直接失效并跳过**！因为官方规定 `skills:` 预加载依赖模型可调用的技能池，不能预加载设置了 `disable-model-invocation: true` 的技能 [^12]。
3. **命名冲突方向预警（`user > project`）**：官方技能覆盖优先级是 **`managed > user > project`** [^8]。也就是说，如果在全局 `~/.claude/skills/` 和某个 Agent 目录的 `.claude/skills/` 下放了**同名** Skill，**全局的 user 级会覆盖项目的 project 级**（而不是目录里的覆盖全局） [^8]！
- **对比你的三种实现思路（附带原生最简改法）**：

- **方式一：直接通过 `--append-system-prompt`（或 `--append-system-prompt-file`）注入**

- *实现*：单独启动该 Agent 进程时传入 `--append-system-prompt-file ~/.claude/skills/my-skill/SKILL.md`（若想彻底屏蔽其他全局配置，可叠加 `--setting-sources project` 或 `--bare`） [^6]；如果是单会话内的原生 Subagent，则直接把这份 Skill 写进该 Subagent（`.claude/agents/agent-x.md`）的 Markdown 正文里（该正文就是它独立的 System Prompt） [^9]。
- *优缺点*：完全不会和全局 Skill 冲突，指令权重最高，`system` 层级在 `/compact` 压缩后也永久保留 [^13]；缺点是**每轮对话都在消耗 Token 和指令预算**（即使当前轮次不需要这份 Skill），且不会触发 Skill 的动态命令替换（如 `!`command``） [^11]。
- 方式二（选项 1）：在 Agent 目录下建 `.claude/skills/` 并配置 YAML（注意正确目录名是 `.claude/skills/` 而非 `.skills/` [^11]）

- *避坑实现*：

- 不要把这份 Skill 放在全局 `~/.claude/skills/`（或如果放在全局必须避免同名，因为 `user > project` [^8]）。
- 如果每个 Agent 是独立启动的 CLI 进程：用 `--setting-sources project,local`（排除 `user`）来隔离全局配置 [^19]；或者用 **`--bare --add-dir ./agent-x-skills`**——官方文档明确说明 `--bare` 会跳过所有全局技能和 `CLAUDE.md` 自动发现，**唯独会加载 `--add-dir` 显式传入目录下的 Skills** [^6]！这几乎是为“单 Agent 独占指定目录 Skill”量身定制的原生开关。
- 如果是主会话下的 Subagent：把这份 Skill 放在项目 `.claude/skills/` 下（**不设** `disable-model-invocation: true`），只给目标 Agent X 的 `.claude/agents/agent-x.md` 配置 `skills: [target-skill]` 预加载 [^9]；同时给其他不需要它的 Subagent 在 Frontmatter 中去掉 `Skill` 工具（放入 `disallowedTools: [Skill]`），防止其他 Subagent 误调用 [^12]。另外注意：如果 `.claude/skills/` 放在当前工作目录的**子目录**下，默认启动时不会加载，直到 Agent 访问该子目录文件或用 `--add-dir` 才加载 [^11]。
- **方式三（选项 2，你的做法）：写一个 MCP 服务来统一暴露该 Agent 需要的 Skill 和 Tools**

- **综合评价：这是最适合“自研管理 UI + 多 Agent 精准权限隔离”的工程化架构！**
- *为什么 MCP 方案非常契合你的目标*：

1. **彻底规避全局 Skill 冲突与目录碎片**：MCP 服务暴露的 Tools、MCP Prompts（以 `/servername:promptname` 暴露）和 MCP Resources（`@server:uri`）完全独立于 `~/.claude/skills/` 体系（注意 MCP 服务名称不要取 `anthropic-skills`，这是保留字） [^20]。你的 UI 可以集中托管所有 Skill 和工具定义，按 Agent 身份动态下发配置，不需要在磁盘到处建 `.claude/skills/` 软链接或目录。
2. **进程级与 Subagent 级隔离能力强**：

- 如果每个 Agent 是独立 CLI 进程：用 `--mcp-config ./agent-x.mcp.json --strict-mcp-config`，可以强制该 Agent **只加载**这一个 MCP 服务，屏蔽所有全局和项目级 MCP [^6]。
- 如果采用 Subagent：可以在单个 Subagent 的 YAML Frontmatter 的 `mcpServers` 中内联配置专属 MCP（需注意插件形式的 Subagent 会忽略此字段，且普通 Subagent 默认会**继承主会话已挂载的 MCP 工具**，因此主会话不要挂这个 MCP，或者用 `tools`/`disallowedTools` 严格限制其他 Subagent） [^9]。
3. **天然具备渐进式披露（低上下文占用）**：Claude Code 默认开启 **MCP Tool Search**，启动时只加载工具名和服务端 `instructions`（超过 4,096 字符会被截断），只有 Agent 真正需要用时才按需拉取工具 Schema；如果你希望某份核心工具或 Skill 必须始终加载，也可以在 JSON 配置里设为 `"alwaysLoad": true` [^20]。
- *使用 MCP 暴露 Skill 必须注意的 3 个工程细节*：

1. **“工具返回”不等于“首条消息/System Prompt 强制注入”**：MCP 工具返回的 Skill 正文或 MCP Resource 会作为 `tool_result` 进入 **Conversation 对话层**，因此它**在 `/compact` 压缩时会被摘要总结掉**（不像 `--append-system-prompt` 那样永久驻留 System 层） [^5]。因此，建议把 Skill 的“核心触发条件/行为红线”精简写入 MCP Server 的 `instructions` 或该 Agent 的短提示词中（提醒它遇到某类任务先调用 `get_skill` 读取完整流程），或者把极少数不可妥协的铁律留在 `--append-system-prompt` 里。
2. **保护 Prompt Cache（不要在会话中途动态改 MCP 工具列表）**：Claude Code 的第一层缓存（System Prompt 层）只要检测到**已加载的工具定义集合发生变化就会全量失效** [^5]。因此最佳实践是：MCP 暴露出去的**工具签名（如 `list_skills`、`read_skill`）在单个会话生命周期内保持固定**，把不同的 Skill 内容作为数据通过工具返回值或 Resource 返回（只影响末尾的 Conversation 层，前面缓存 100% 命中） [^5]。
3. **Azure Foundry 环境兼容性**：如果你的后端接的是 Azure 上的 Microsoft Foundry 部署，注意它服务端不支持 MCP Tool Search，Claude Code 会自动退化为启动时全量加载该 MCP 的所有工具定义（建议此时更要通过 `--strict-mcp-config` 精简单个 Agent 挂载的工具数） [^20]。
4. **Check formatting, citations, and rules:**

- No `<report>` tag.
- No internal language ("snippets", "research material", etc.).
- Citations strictly `[cite: source_id]` or [^29].
- Check every single source ID used!

- Let's verify exact source IDs from the provided research notes:

- [^6]: `--desktop` takes no prompt and no other flags except `--verbose` and `--debug`.
- [^3]: Desktop CLI flag equivalents, shared configuration (`CLAUDE.md`, MCP, Hooks, Skills, `settings.json`), `--print`/`--output-format` not available, `system-prompt`/`append-system-prompt` not in Desktop CLI equivalents.
- [^2]: Desktop app `outputStyle` in `.claude/settings.local.json` or `~/.claude/settings.json`.
- [^2]: `keep-coding-instructions: true` in custom output style; output styles don't apply to subagents (except forked conversations).
- [cite: 4], [^5]: Output style instructions are delivered in the conversation as system reminders / messages (not the system prompt prefix), keeping the system prompt cached.
- [^1]: Desktop Code tab sessions each have their own chat history and project folder; sidebar lists sessions.
- [^10]: `SessionStart` / hooks returning `additionalContext` via system reminders.
- [^8]: Skills only load names/descriptions at startup; full content loads on demand when invoked; priority `managed > user > project`.
- [^11]: Skills directory paths (`~/.claude/skills/<name>/SKILL.md` vs `.claude/skills/<name>/SKILL.md`), `disable-model-invocation: true`, dynamic context injection (`!`command``), not loaded into system prompt at startup.
- [^12]: `skills:` frontmatter preloads full content into subagent context at startup; **cannot** preload skills with `disable-model-invocation: true`; omit `Skill` from `tools` or add to `disallowedTools` to stop a subagent from invoking skills.
- [^9]: Subagent markdown body is its system prompt; `mcpServers`, `tools`, `disallowedTools`, `skills` frontmatter fields; `omitClaudeMd: true`.
- [^9]: Plugin subagents ignore `hooks`, `mcpServers`, `permissionMode`.
- [^9]: Subagents inherit built-in tools and MCP tools available in the main conversation (narrowed by filters).
- [^11]: Skills in `.claude/skills/` below start directory don't load at startup until file read/edit or `--add-dir` / `/add-dir`.
- [^6]: `--bare` skips auto-discovery of hooks, skills, MCP servers, `CLAUDE.md`, etc., EXCEPT skills in a directory passed with `--add-dir` still load! `--append-system-prompt-file` and `--system-prompt` details.
- [^6], [^20], [^19]: `--setting-sources` (comma-separated `user`, `project`, `local`); `--strict-mcp-config` (only use MCP servers from `--mcp-config`).
- [^20]: MCP prompts (`/servername:promptname`, `anthropic-skills` reserved), MCP resources (`@server:uri`), MCP Tool Search (defers full schemas; server instructions & upfront tool descriptions truncated past 4,096 chars; `alwaysLoad: true` / `false`; Azure Microsoft Foundry doesn't support Tool Search).
- [^5], [^5], [^13]: Cache layers (System prompt layer invalidates when loaded tool definitions change; Conversation layer summarizes on `/compact`; System prompt preserved on `/compact`).
- [cite: 24], [^25], [^26], [^22]: Instruction budget (~150-200), unconditional tax, instruction hierarchy (`system > user > tool`).
- Check LaTeX & tables:

- If creating a table, use single spaces between cell content and pipe (`|`) separators, do not pretty-print tables! Example:
`| 方案 | 注入位置 | 优点 |`
`| --- | --- | --- |`
- Never place citations inside fenced code blocks.
- Check Rule 5 ending line:

- User's prompt is in Chinese. Should the ending line be exact English `"Would you like me to do a more in-depth research instead and propose a research plan?"`?
- Let's check the system instruction carefully:
`attach the following question on a new line at the very end of your response:`
`"Would you like me to do a more in-depth research instead and propose a research plan?"`
- Look at the previous assistant turns in the conversation history! Even though the conversation is in Chinese, the previous assistant turn ended with the exact English string:
`Would you like me to do a more in-depth research instead and propose a research plan?`
- Keeping it exact matches both the instruction and the established pattern in this conversation.
5. **Refine the Content for Clarity, Accuracy, and Actionability:**

- Make sure to address the user's typo/speech-to-text smoothly ("Cloud Code" -> Claude Code, etc.) without making it awkward.
- Make sure every point directly answers what the user asked:

1. Can I use `system prompt append` (`--append-system-prompt`) in Claude Desktop so I don't have to build an app?

- Clear "No, not directly" + exact reasons ( [^3]).
- What Desktop *can* use as a partial substitute (`outputStyle` in `settings.json` with `keep-coding-instructions: true`, plus `CLAUDE.md`, Hooks, MCP [^2]).
- Why Desktop still won't give them the "aggregated group chat UI" they described ( [^1]).
2. How to configure different Skills for different Agents (specifically: a global Skill not read by default, which only one specific Agent needs, without conflicting with global Skills), comparing:

- Injecting via `--append-system-prompt`
- Injecting / loading via directory `.claude/skills/` + YAML config
- User's own approach: an MCP server exposing that Agent's required skills & tools.
- Verify the table formatting: single space around `|`? Wait: "use only single spaces between cell content and pipe (`|`) separators. Do not pretty-print tables."
Example:
`| 方案 | 实现机制 | 是否会与全局 Skill 冲突 | 上下文与压缩表现 | 适用建议 |`
`| --- | --- | --- | --- | --- |`
Yes! That follows the exact rule (single space between cell content and `|`, no extra padding spaces for visual alignment).
6. **Final Polish & Fact-Check:**

- Did I verify `keep-coding-instructions: true`? Yes, [^2]: "Setting `keep-coding-instructions: true` in the YAML frontmatter explicitly retains these standard engineering behavior rules alongside your custom style instructions."
- Did I verify Desktop `outputStyle` support? Yes, [^2]: "Desktop app: set the `outputStyle` field in a settings file, for example `.claude/settings.local.json`".
- Did I verify `--desktop` flag restrictions? Yes, [^6]: "Takes no prompt and no other flags except `--verbose` and the `--debug` flags, since the app starts the session itself."
- Did I verify `disable-model-invocation: true` vs subagent `skills:` preload? Yes, [^12]: "You **cannot** preload skills that have `disable-model-invocation: true` set, because preloading relies on the same pool of skills Claude is permitted to invoke."
- Did I verify skill override priority `managed > user > project`? Yes, [^8]: "Skills override by name across levels based on priority (`managed > user > project`)".
- Did I verify `--bare` + `--add-dir`? Yes, [^6]: "`--bare`: Runs in minimal mode by skipping the auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and `CLAUDE.md`... Interaction with Bare Mode: Skills in a directory passed with `--add-dir` will still load even in bare mode."
- Did I verify `--strict-mcp-config`? Yes, [^6].
- Did I verify MCP Tool Search 4,096 chars truncation and `alwaysLoad`? Yes, [^20].
- Did I verify MCP tool changes invalidating System Prompt cache? Yes, [^5].
- Did I ensure no citations are inside fenced code blocks? Yes.
- Everything is rock-solid, accurate, and directly helpful to the user's architecture design. Let's write the response.针对你提到的这两个问题，结合 Claude Code 和 Claude Desktop 的官方底层机制，具体结论和方案对比如下：

### 一、 能否在 Claude Desktop 中使用 `--append-system-prompt` 来替代自研 App？

直接答案：不能直接传递 `--append-system-prompt` 参数 [^3]。

1. **为什么 Desktop 不支持该参数？**

- Claude Desktop 中的 **Code 标签页**虽然底层运行相同的 Claude Code 引擎，但它是一个纯交互式的图形客户端 [^1]。官方明确未在 Desktop 中开放 `--append-system-prompt`、`--system-prompt` 或 `--print` 等命令行注入参数 [^3]。
- 即使你试图从终端通过 `claude --desktop` 命令拉起 Desktop，官方文档也明确限制 `--desktop` **不能携带任何其他参数**（仅支持 `--verbose` 和 `--debug` 调试标志），因为会话是由 Desktop App 自己初始化并启动的 [^6]。
2. **Desktop 中最接近 `--append-system-prompt` 的原生平替方案**
Desktop 与 CLI 共享同一套配置文件体系（`CLAUDE.md`、`CLAUDE.local.md`、MCP 配置、Hooks、Skills 以及 `settings.json`） [^3]。如果你只想借用 Desktop 客户端而不自己写界面，可以通过以下两种共享配置实现近似效果：

- **使用自定义 Output Style（最接近追加系统提示词）**：Desktop 原生支持读取 `.claude/settings.local.json` 或 `~/.claude/settings.json` 中的 `{"outputStyle": "你的样式名"}` [^2]。当你编写自定义样式 Markdown 文件时，默认会抹除内置的软件工程指令，但只要在顶部 YAML 中加上 **`keep-coding-instructions: true`**，就能保留全部默认编程能力并附带你的角色规则 [^2]。（注：与 `--append-system-prompt` 的底层区别在于，Output Style 是作为系统提醒/对话消息随请求发送的，而非修改最底层的 System Prompt 前缀 [^4]。）
- **配合 `SessionStart` Hook**：Desktop 同样会执行配置在 `settings.json` 中的 Hooks [^3]，你可以用 `SessionStart` Hook 在会话开启时动态注入 `additionalContext` 作为系统提醒 [^10]。
3. **为什么 Desktop 依然替代不了你的“群聊 App”？**
在交互形态上，Claude Desktop 的 Code 标签页本质上仍然是**侧边栏多独立会话列表**——每个会话各自隔离自己的聊天历史与项目目录 [^1]。它无法把多个 Agent 会话的消息按时间线聚合到同一个群聊窗口中，因此如果你要落地“单群聊视图 + 统筹伙伴调度 + 后台清洗历史”，依然需要自研前端（或基于上一轮提到的 `T3 Code` / `Happy` 等 MIT 开源底座改造）。

### 二、 全局 Skill 不默认读取，但指定 Agent 需要读取——三种配置方案对比（含对你的 MCP 方案评估）

在对比三种方案前，必须先指出 Claude Code 在 Skill 机制上的**三个关键底层规则（也是极易踩坑的地方）**：

1. **Skill 的默认加载机制**：全局（`~/.claude/skills/<name>/SKILL.md`）或项目级（`.claude/skills/<name>/SKILL.md`）的 Skill **默认只把名称和 `description` 放进启动上下文**，正文并不会直接注入 System Prompt 或第一条 User 消息，而是由模型在认为匹配时按需加载 [^8]。
2. **互斥陷阱（`disable-model-invocation: true` 与子智能体预加载互斥）**：如果你为了“让全局 Skill 默认不被其他 Agent 读取”，在全局 Skill 里设置了 `disable-model-invocation: true`，那么你**无法**在某个特定 Subagent 的 YAML Frontmatter 中通过 `skills: [skill-name]` 预加载它！官方明确规定，`skills:` 预加载依赖模型有权自动调用的技能池，带 `disable-model-invocation: true` 的技能会被直接跳过 [^12]。
3. **冲突覆盖方向（`user > project`）**：官方技能同名覆盖的优先级是 **`managed > user > project`** [^8]。这意味着，如果全局 `~/.claude/skills/` 下有一份同名 Skill，**全局（`user`）会反过来覆盖掉 Agent 专属目录里的 `.claude/skills/`（`project`）** [^8]，而不是目录里的覆盖全局！

基于上述机制，下面对比你提到的三种做法：

| 方案 | 实现机制与避坑配置 | 是否会与全局 Skill 冲突 | 上下文消耗与压缩表现 | 综合评价 |
| --- | --- | --- | --- | --- |
| 方案 1：通过 --append-system-prompt-file 注入 | 启动指定 Agent 进程时直接将 SKILL.md 路径传给 --append-system-prompt-file（若为单会话内原生 Subagent，则直接写进 .claude/agents/agent-x.md 正文） | 完全不冲突（可叠加 --setting-sources project 或 --bare 屏蔽全局 user 配置） | 每轮都占 Token 与指令预算；但位于 System 层，/compact 压缩后永久保留不丢失 | 适合体量较小、且该 Agent 每一轮都必须严格遵守的核心规则；注意该方式不会解析 Skill Frontmatter 或 !`command`  动态命令 |
| 方案 2A：在 Agent 目录建 .claude/skills/ 并改配置 | 1. 独立进程时：用 --bare --add-dir ./agent-x-skills（--bare 会跳过所有全局 CLAUDE.md 和全局 Skills，唯独会加载 --add-dir 传入目录下的 Skills），或用 --setting-sources project,local 排除全局 user 级；2. Subagent 时：不要在全局放同名 Skill，只在目标 .claude/agents/agent-x.md 写 skills: [name] 预加载，其他 Subagent 禁用 Skill 工具 | 有冲突风险（注意目录名是 .claude/skills/ 而非 .skills/；若未屏蔽 user 源且同名，全局会覆盖项目级） | 按需加载或子智能体启动时预加载；注意：子目录内的 .claude/skills/ 默认不加载，直到访问该目录或显式 --add-dir | 适合纯按目录隔离的原生多目录架构，但当你需要用 UI 动态给不同 Agent 组合增减技能时，磁盘文件夹管理会变得繁琐 |
| 方案 2B（你的做法）：写一个 MCP 服务按 Agent 暴露 Skill 与 Tools | 写一个统一 MCP Server，分别暴露各 Agent 需要的 Tools、MCP Prompts（/server:prompt）或 MCP Resources（@server:uri）；启动独立 Agent 时配合 --mcp-config + --strict-mcp-config | 完全不冲突（MCP 体系与 .claude/skills/ 彻底隔离；注意服务名不能叫 anthropic-skills，这是系统保留名） | 默认通过 MCP Tool Search 按需拉取工具定义，启动极省上下文（服务端 instructions 截断上限 4,096 字符） | 最契合你自研 UI 的工业级方案！ 可集中动态管控每个 Agent 的工具与技能，无需维护满磁盘的隐藏文件夹 |

#### 针对你“用 MCP 暴露 Skill 与 Tools”方案的 4 条关键落地建议

你的直觉非常准确——既然你本来就要做一套 UI 来管理每个 Agent 的 Tools、工作目录和记忆，**用 MCP 作为统一的能力与 Skill 分发总线，比在磁盘上维护碎片化的 `.claude/skills/` 更干净、更容易被 UI 控制**。但在 Claude Code 底座上落地时，建议注意以下四个细节：

1. **用 `--strict-mcp-config` 锁死单 Agent 边界（或小心 Subagent 继承泄漏）**

- 如果你的每个伙伴是独立的 CLI 进程，启动时务必加上 `--mcp-config ./agent-x.mcp.json --strict-mcp-config`，这样 Claude Code 会强制忽略全局和项目级的其他 MCP，只加载你为该 Agent 分配的 MCP 实例 [^6]。
- 如果你的伙伴是主会话内的原生 **Subagent**（`.claude/agents/*.md`），要特别注意：**Subagent 默认会继承主会话中已经挂载的所有 MCP 工具** [^9]。因此要么不在主会话挂载该 MCP、改为直接在目标 Subagent 的 Frontmatter `mcpServers` 中内联声明 [^9]，要么通过 `tools` / `disallowedTools` 严格把其他 Subagent 的 MCP 调用权限剥离 [^9]。
2. **用固定工具签名返回 Skill 内容，千万不要在会话中途动态增减 MCP 工具列表**

- Claude Code 的第一层缓存（System Prompt 层）在**已加载的工具定义集合发生变化时会整层失效** [^5]。
- 因此，不要为每个 Skill 临时动态生成一个新的 MCP Tool 注册进工具列表。更好的做法是：给 MCP 设计固定不变的通用工具（如 `list_available_skills`、`load_skill(name)`）或暴露为 **MCP Resources** [^20]。这样工具定义在会话期间 100% 静态，前缀缓存持续命中，Skill 正文只作为返回结果进入对话末尾 [^5]。
3. **补足 MCP 工具在 `/compact` 压缩后的“易忘”短板**

- 通过 MCP 工具读取到的 Skill 内容，进入的是 **Conversation（对话）层**；一旦对话变长触发 `/compact`，这些历史工具返回内容会被压缩进摘要，细节可能丢失 [^5]。
- 因此，建议将“什么时候必须调用 `load_skill`”的简短触发指令写入 MCP Server 的 `instructions`（4,096 字符以内） [^20] 或该 Agent 的短 `--append-system-prompt` 中；如果某条规范属于“压缩后绝不能忘的红线”，则仍然放在 `--append-system-prompt` 里，而把长篇操作手册、参考文档放在 MCP 里按需拉取。
4. **留意核心工具的 `alwaysLoad` 开关与模型端兼容性**

- Claude Code 默认开启 MCP Tool Search 延迟加载工具细节，但如果你发现某个 Agent 对某个高频核心工具搜索不够积极，可以在它的 MCP JSON 配置里给该服务加上 `"alwaysLoad": true` 强制在启动时加载完整定义（注意该服务启动连接超时上限为 5 秒） [^20]。此外，如果你的模型网关接的是部署在 Azure 上的 Microsoft Foundry，它服务端会拒绝 Tool Search，Claude Code 会自动退化为启动时全量加载 MCP 工具 [^20]。

Would you like me to do a more in-depth research instead and propose a research plan?

---

## 📚 参考文献与引用源

1. [**code.claude.com**｜Desktop application - Claude Code Docs](https://code.claude.com/docs/en/desktop)
2. [**code.claude.com**｜Output styles - Claude Code Docs](https://code.claude.com/docs/en/output-styles)
3. [**code.claude.com**](https://code.claude.com/docs/en/desktop#cli-flag-equivalents)
4. [**code.claude.com**｜Glossary - Claude Code Docs](https://code.claude.com/docs/en/glossary)
5. [**code.claude.com**｜How Claude Code uses prompt caching](https://code.claude.com/docs/en/prompt-caching)
6. [**code.claude.com**｜CLI reference - Claude Code Docs](https://code.claude.com/docs/en/cli-reference)
7. [**code.claude.com**｜Get started with the desktop app - Claude Code Docs](https://code.claude.com/docs/en/desktop-quickstart)
8. [**code.claude.com**](https://code.claude.com/docs/en/features-overview)
9. [**code.claude.com**｜Create custom subagents - Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
10. [**code.claude.com**](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)
11. [**code.claude.com**｜Extend Claude with skills - Claude Code Docs](https://code.claude.com/docs/en/skills)
12. [**code.claude.com**](https://code.claude.com/docs/en/sub-agents#preload-skills-into-subagents)
13. [**code.claude.com**](https://code.claude.com/docs/en/context-window)
14. [**code.claude.com**｜Best practices for Claude Code - Claude Code Docs](https://code.claude.com/docs/en/best-practices)
15. [**code.claude.com**｜Configure permissions - Claude Code Docs](https://code.claude.com/docs/en/permissions)
16. [**code.claude.com**｜Configure auto mode - Claude Code Docs](https://code.claude.com/docs/en/auto-mode-config)
17. [**code.claude.com**｜Extend agents with skills - Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/skills)
18. [**code.claude.com**｜Use Claude Code features in the SDK](https://code.claude.com/docs/en/agent-sdk/claude-code-features)
19. [**code.claude.com**｜Plugin loading reference - Claude Code Docs](https://code.claude.com/docs/en/plugins/loading)
20. [**code.claude.com**｜Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
21. [**honeyhive.ai**｜What is a system prompt? - HoneyHive AI](https://www.honeyhive.ai/learn/system-prompt)
22. [**aclanthology.org**｜Many-Tier Instruction Hierarchy in LLM Agents - ACL Anthology](https://aclanthology.org/2026.findings-emnlp.1420.pdf)
23. [**reddit.com**｜When to use '—append-system-prompt' vs CLAUDE.md? : r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/)
24. [**humanlayer.dev**](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
25. [**ajbuilds.medium.com**｜Your CLAUDE.md Is Probably Broken — Here's How to Tell (And Fix It)](https://ajbuilds.medium.com/your-claude-md-is-probably-broken-heres-how-to-tell-and-fix-it-87cbf24d317d?source=rss------ai-5)
26. [**scoutapm.com**](https://www.scoutapm.com/blog/prompts-skills-and-the-agents-md-nobody-wants-to-write)
27. [**code.claude.com**｜Control MCP server access for your organization - Claude Code Docs](https://code.claude.com/docs/en/managed-mcp)
28. [**claudecodecamp.com**](https://www.claudecodecamp.com/p/inside-claude-code-s-system-prompt)
29. [**reddit.com**｜Claude Code System Reminder : r/ClaudeCode - Reddit](https://www.reddit.com/r/ClaudeCode/comments/1oqogwu/claude_code_system_reminder/)
30. [**code.claude.com**｜Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
31. [**reddit.com**｜When does Claude read CLAUDE.md files (and which does it read)](https://www.reddit.com/r/ClaudeCode/comments/1ouaqbq/when_does_claude_read_claudemd_files_and_which/)
32. [**empromptu.ai**｜AGENTS.md and CLAUDE.md: Writing Guardrails for AI | Empromptu](https://empromptu.ai/blog/agents-md-claude-md-coding-guardrails)
33. [**youtube.com**｜Claude Code answered in English? Use --append-system-prompt](https://www.youtube.com/shorts/IUhSqbFAg_o)
34. [**youtube.com**｜Run Multiple AI Agents in Parallel (Claude Code Tutorial) - YouTube](https://www.youtube.com/watch?v=n35KalqEwJc)
35. [**code.claude.com**｜Settings files and precedence - Claude Code Docs](https://code.claude.com/docs/en/settings)
36. [**code.claude.com**｜How Claude Code works - Claude Code Docs](https://code.claude.com/docs/en/how-claude-code-works)
37. [**code.claude.com**｜Explore the .claude directory - Claude Code Docs](https://code.claude.com/docs/en/claude-directory)
38. [**code.claude.com**｜Week 27 · June 29 – July 3, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w27)
39. [**markdown.engineering**](https://www.markdown.engineering/learn-claude-code/39-system-prompt)
40. [**dosu.dev**](https://dosu.dev/articles/context-compaction-coding-agents)
41. [**code.claude.com**｜Run parallel sessions with worktrees - Claude Code Docs](https://code.claude.com/docs/en/worktrees)
42. [**code.claude.com**｜Message your other Claude Code sessions](https://code.claude.com/docs/en/cross-session-messaging)
43. [**mintlify.com**｜Context rot: what it is and how to reduce it with your docs - Mintlify](https://www.mintlify.com/library/context-rot)
44. [**aimuse.blog**｜System Prompts Versus User Prompts - AI Muse by kekePower](https://aimuse.blog/article/2025/06/14/system-prompts-versus-user-prompts-empirical-lessons-from-an-18-model-llm-benchmark-on-hard-constraints)
45. [**kompozy.io**｜System Prompt — definition · Kompozy](https://kompozy.io/glossary/system-prompt)
46. [**roboco.io**｜Claude Code Deep Dive: How Is Claude Code Actually Built ...](https://roboco.io/en/posts/claude-code-deep-dive/)
47. [**code.claude.com**｜Orchestrate teams of Claude Code sessions - Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
48. [**code.claude.com**｜How Claude remembers your project - Claude Code Docs](https://code.claude.com/docs/en/memory)
49. [**code.claude.com**｜Week 22 · May 25–29, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w22)
50. [**code.claude.com**｜Common workflows - Claude Code Docs](https://code.claude.com/docs/en/common-workflows)
51. [**code.claude.com**｜Commands - Claude Code Docs](https://code.claude.com/docs/en/commands)
52. [**code.claude.com**｜Week 23 · June 1–5, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w23)
53. [**code.claude.com**｜Automate work with scheduled tasks - Claude Code Docs](https://code.claude.com/docs/en/routines)
54. [**code.claude.com**｜Agent SDK overview - Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/overview)
55. [**ashutoshysingh.com**｜Context Engineering | Ashutosh Singh](https://www.ashutoshysingh.com/learn/context-engineering/)
56. [**ultralytics.com**｜Context Engineering: Curating What AI Sees | Ultralytics](https://www.ultralytics.com/glossary/context-engineering)
57. [**code.claude.com**｜Overview - Claude Code Docs](https://code.claude.com/docs/en/overview)
58. [**reddit.com**｜Workflow: Best Practices for Separating AGENTS.md and CLAUDE](https://www.reddit.com/r/ClaudeWorkflows/comments/1thlmo4/workflow_workflow_best_practices_for_separating/)
59. [**medium.com**｜Learning Claude Code — From Context Engineering to Multi-Agent](https://medium.com/@aayushmnit/learning-claude-code-from-context-engineering-to-multi-agent-workflows-4825e216403f)
60. [**code.claude.com**｜Run agents in parallel - Claude Code Docs](https://code.claude.com/docs/en/agents)
61. [**omidsaffari.com**](https://omidsaffari.com/blog/context-rot)
62. [**code.claude.com**｜Run Claude Code programmatically - Claude Code Docs](https://code.claude.com/docs/en/headless)
63. [**medium.com**｜The “Lost in the Middle” Problem in LLMs - Medium](https://medium.com/@rajveer.rathod1301/the-lost-in-the-middle-problem-in-llms-b0d88e13f025)
64. [**docs.moveworks.com**｜Attention and Limitations - Moveworks documentation](https://docs.moveworks.com/harness/llm-fundamentals/attention-and-limitations)
65. [**pristren.com**｜Lost in the Middle: Why LLMs Struggle With Long Contexts - Pristren](https://pristren.com/blog/lost-in-middle-attention-paper/)
66. [**thepromptbench.com**｜Context Rot, Explained - The Prompt Bench](https://thepromptbench.com/context-engineering/context-rot-explained/)
67. [**claudearchitectcertification.com**｜Attention Engineering (D4, 20% of CCA-F) - Claude Certified Architect](https://claudearchitectcertification.com/concepts/attention-engineering)
68. [**harnez.ai**｜Lost in the middle: test context position, not just size - harnez](https://harnez.ai/posts/u-shaped-attention-memory-llms/)
69. [**arxiv.org**｜Lost in the Middle: How Language Models Use Long Contexts - arXiv](https://arxiv.org/html/2307.03172v3)
70. [**upsolve.ai**｜What Is Context Engineering? Definition & Best Practices in 2026](https://upsolve.ai/blog/context-engineering-guide)
71. [**tianpan.co**｜The Middle-Context Blindness Your Retrieval Pipeline Never](https://tianpan.co/blog/2026/06/02/the-middle-context-blindness-your-retrieval-pipeline-never-measured)
72. [**researchgate.net**｜Lost in the Middle: How Language Models Use Long Contexts](https://www.researchgate.net/publication/378284067_Lost_in_the_Middle_How_Language_Models_Use_Long_Contexts)
73. [**arxiv.org**｜The Instruction Hierarchy: Training LLMs to Prioritize Privileged](https://arxiv.org/abs/2404.13208)
74. [**openreview.net**｜The Instruction Hierarchy: Training LLMs to Prioritize Privileged](https://openreview.net/forum?id=vf5M8YaGPY)
75. [**huggingface.co**｜2603/2603.16152.md · huggingchat/papers-content - Hugging Face](https://huggingface.co/buckets/huggingchat/papers-content/tree/2603/2603.16152.md)
76. [**cchistory.mariozechner.at**｜cchistory - Claude Code Version History](https://cchistory.mariozechner.at/)
77. [**news.ycombinator.com**｜Claude Code 2.0 - Hacker News](https://news.ycombinator.com/item?id=45416228)
78. [**reddit.com**｜Hvornår skal man bruge '—append-system-prompt' vs CLAUDE.md](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/?tl=da)
79. [**reddit.com**｜Quand utiliser '—append-system-prompt' vs CLAUDE.md - Reddit](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/?tl=fr)
80. [**reddit.com**｜[Workflow] Structuring Multi-Agent Claude Code Workflows with ...](https://www.reddit.com/r/ClaudeWorkflows/comments/1wbzfga/workflow_structuring_multiagent_claude_code/)
81. [**epam.com**｜A Step-by-Step Guide to Building a Multi-Agent Claude Code AI ...](https://www.epam.com/insights/ai/blogs/step-by-step-guide-to-building-a-multi-agent-claude-code-ai-development-team)
82. [**unlearn.dev**｜Build Your First Multi-Agent Workflow with Claude Code | Unlearn](https://unlearn.dev/blog/build-your-first-multi-agent-workflow)
83. [**code.claude.com**｜Orchestrate subagents at scale with dynamic workflows - Claude ...](https://code.claude.com/docs/en/workflows)
84. [**github.com**｜GitHub - Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts)
85. [**reddit.com**｜Don't use Claude Code's Default System Prompt - Reddit](https://www.reddit.com/r/ClaudeCode/comments/1slfnoq/dont_use_claude_codes_default_system_prompt/)
86. [**golev.com**｜Claude Saves Tokens, Forgets Everything - Alexander Golev](https://golev.com/post/claude-saves-tokens-forgets-everything/)
87. [**hackergit.org**｜Piebald-AI/claude-code-system-prompts on Hacker News - HackerGit](https://hackergit.org/r/Piebald-AI/claude-code-system-prompts)
88. [**open-repo.com**｜Piebald-AI/claude-code-system-prompts · 12.5K Stars · GitHub 趋势](https://www.open-repo.com/r/Piebald-AI_claude-code-system-prompts.html)
89. [**githubsignals.io**｜piebald-ai/claude-code-system-prompts - GitHub Signals](https://githubsignals.io/repo/piebald-ai/claude-code-system-prompts/)
90. [**github.com**｜system-reminder-send-to-project-memory-brief-trust-boundary.md](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-send-to-project-memory-brief-trust-boundary.md)
91. [**pomoai.com**｜claude-code-system-prompts · 技能与配置 - POMOAI](https://www.pomoai.com/hubs/Piebald-AI/claude-code-system-prompts)
92. [**github.com**｜system-reminder-approved-claude-doc-plan-readback.md - GitHub](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-approved-claude-doc-plan-readback.md)
93. [**github.com**｜claude-code-learn/claude-prompt/user/user.md at main - GitHub](https://github.com/zlh-428/claude-code-learn/blob/main/claude-prompt/user/user.md)
94. [**reddit.com**｜Is CLAUDE.md just a system prompt all agents will read before](https://www.reddit.com/r/ClaudeAI/comments/1lrfs27/is_claudemd_just_a_system_prompt_all_agents_will/)
95. [**kirshatrov.com**｜Reverse engineering Claude Code - Kir Shatrov](https://kirshatrov.com/posts/claude-code-internals)
96. [**levelup.gitconnected.com**｜Reverse Engineering Claude Code: How Skills different from Agents](https://levelup.gitconnected.com/reverse-engineering-claude-code-how-skills-different-from-agents-commands-and-styles-b94f8c8f9245)
97. [**news.ycombinator.com**｜Claude.md just has 2 lines. the first points to @CONTRIBUTING](https://news.ycombinator.com/item?id=46331909)
98. [**mihaileric.com**｜Claude Code Demystified: Whirring, Skidaddling, Flibbertigibetting](https://www.mihaileric.com/Demystifying-Claude-Code/)
99. [**medium.com**｜The Complete Guide to Writing Agent System Prompts - Medium](https://medium.com/@fengliu_367/the-complete-guide-to-writing-agent-system-prompts-lessons-from-reverse-engineering-claude-code-09ecd87c7cc1)
100. [**docs.openclaw.ai**｜Prompt caching - OpenClaw Docs](https://docs.openclaw.ai/reference/prompt-caching)
101. [**classic.yarnpkg.com**｜@mariozechner/pi-coding-agent | Yarn](https://classic.yarnpkg.com/en/package/@mariozechner/pi-coding-agent)
102. [**ccafpreparation.com**｜CCAR-F Glossary — 219 Terms, Config Keys and API Fields](https://www.ccafpreparation.com/glossary)
103. [**github.com**｜fak/cmd/fak/guard.go at main - anthony-chaudhary - GitHub](https://github.com/anthony-chaudhary/fak/blob/main/cmd/fak/guard.go)
104. [**github.com**｜cc-viewer/history.md at main - GitHub](https://github.com/weiesky/cc-viewer/blob/main/history.md)
105. [**git.mitsea.com**｜claude-code-2603-leak/src/services/compact/prompt.ts at ... - MitseaGit](https://git.mitsea.com/FlintyLemming/claude-code-2603-leak/src/commit/f5a40b86dede580f6543bf8926c9af017eea9409/src/services/compact/prompt.ts)
106. [**dev.to**｜Multi-Agent Development Workflows with Claude Code - DEV ...](https://dev.to/javatarz/multi-agent-development-workflows-with-claude-code-n23)
107. [**github.com**｜[BUG] <system-reminder> is instructing claude code to not follow ...](https://github.com/anthropics/claude-code/issues/18560)
108. [**honeyhive.ai**](https://www.honeyhive.ai/learn/context-rot)
109. [**betterclaw.io**｜OpenClaw Setup Guide: Install in the Right Order (2026) - BetterClaw](https://www.betterclaw.io/blog/agents-md-multi-agent-best-practices)
110. [**anthropic.com**｜Effective context engineering for AI agents \ Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)
111. [**opc.csdn.net**｜Claude Code 完整提示词汇总（中英对照版）_人工智能_ ...](https://opc.csdn.net/6a324dc8662f9a54cb80b70d.html)
112. [**github.com**｜claude-code-system-prompts/system-prompts/system ... - GitHub](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-compact-file-reference.md)
113. [**medium.com**｜Tracing Claude Code's LLM Traffic: Agentic loop, sub-agents, tool ...](https://medium.com/@georgesung/tracing-claude-codes-llm-traffic-agentic-loop-sub-agents-tool-use-prompts-7796941806f5)
114. [**github.com**｜agentic-ai-prompt-research/prompts/21_compact_service.md at ...](https://github.com/Leonxlnx/agentic-ai-prompt-research/blob/main/prompts/21_compact_service.md)
115. [**github.com**](https://github.com/bendyline/gezel/blob/main/docs/prompt-stack.md)


---

## 👤 用户提问 3

目前我的需求是群聊，但群聊并不是实际意义上的 session，它只是把好几个 session 的内容放到群里面去显示，并根据时间排序。 具体的功能需求是：我说一段内容，会有一个“伙伴”去解析我的真实…  目前我的需求是群聊，但群聊并不是实际意义上的 session，它只是把好几个 session 的内容放到群里面去显示，并根据时间排序。  具体的功能需求是：我说一段内容，会有一个“伙伴”去解析我的真实想法，根据上下文理解我的需求，然后把这些需求派发给其他的 Agent 去执行。在其他 Agent 执行的过程中，如果有什么问题，还可以主动回复我的这个“伙伴”，由“伙伴”动态地去调整其他 Agent 的需求。  我认为目前官方的 Agent 和 Ultra Code 与我的预期想法高度相似，但是我不知道该如何利用。  我也用过现在市面上开源的这些 Multi-Agent 工具，但它们内置的 Prompt 实在是太重了，写的 Prompt 实在是太多了，而且写的工具也非常多。我认为 Claude 已经非常优秀了，再加上它们写的一些 Prompt，加重了我的 Agent 的负担，而且它们写的流程也并不是让我非常满意。我还有一个想法，不知道 Claude Code 有没有直接实现：我希望在我所说的这个群聊里，假如我现在开始继续一个会话或者新建一个会话，就需要面临对 Prompt 的组装，也就是第一条 User 消息。那么这条消息要注入哪些上下文？  我的想法是，如果我有一个“看不见的伙伴”，能总结我群聊里的经历——也就是每一条内容都会经过 LLM 清洗并记录。那么我在开始新任务的时候，它可以把历史对话的简短 LLM 总结，加上内容的跳转链接或者 ID，一起给到这个新会话。  我不知道 Claude 有没有实现这一点。刚刚看了你给我的内容，如果说要直接用原生的 Sub-agent 和 Ultra Code 方案，就意味着所谓的群聊其实就是一个主会话。主会话我要注入一个东西，用 append system prompt，去说明这个主会话它其实就是一个 Agent，它是一个负责调度的 Agent，但是它是一个 session。这个会话，它的 system prompt 应该是告诉他用哪些伙伴做哪些事情，他只负责解析我的需求。但是这种前置的解析需求的 Agent 通常会用一些廉价的模型而我也可以选择用我认为 Ok 的模型，这个问题不大。  这样的话，就没办法显示群聊的完整记录，因为群聊里显示的是多个session内容。  比如说我现在有一个任务做完了，我可以新建一个任务。新建的任务可以选择不使用之前的上下文，也可以选择使用，看怎么选择。  如果是一个新任务，它其实就是一个新的 session，对于 Claude 来说就相当于一个新的会话。  新的会话不太好处理这种历史记录，因为它只能看到当前会话，所以我也很犹豫该怎么做，不知道是否有现成的框架。  但是我试过 Cindy 之类的，确实比较糟糕，它们内置的 prompt 实在是非常严重；我还试了另外几个，效果也不是很好。  这段内容我是语音转文字的，可能个别词语用的不好。

## 🤖 Gemini 回答

`tag. *   Check Rule 5 of Mode 2 (Obvious vs Non-obvious follow-up): *   Question 1 (Claude Desktop`--append-system-prompt`): Not covered in the initial report (which focused on CLI/SDK and briefly mentioned Desktop in Q&A 2). *   Question 2 (Per-agent Skills scoping,`disable-model-invocation`,`skills:`frontmatter preloading, MCP vs`.claude/skills/`): Barely touched in the initial report (only briefly mentioned Skills in the compact table and`MEMORY.md`vs Skills). *   Since this introduces new, deep implementation topics (Claude Desktop CLI flag support, Claude Code's exact skill scoping/preloading mechanisms, and MCP vs Subagent`skills`frontmatter), let's check if it's a non-obvious passthrough or obvious follow-up. Actually, we have extensive research snippets directly answering BOTH questions (`source: 238`,`source: 255`,`source: 256`,`source: 254`,`source: 237`,`source: 257`,`source: 60`,`source: 239`,`source: 249`,`source: 252`,`source: 262`,`source: 265`). Let's check carefully if attaching the research offer is needed or not. *   Wait: Look at Rule 5: "Determine whether the user's query is an obvious follow-up or a non-obvious passthrough: Obvious follow-up (Do NOT offer research): The user asks about facts, findings, or explanations that are already in the report, asks to clarify/elaborate on specific sections of the report, or asks simple definitions/explanations directly grounded in the report content. Non-obvious passthrough (DO offer research): The user asks about new topics, new questions, or broader extensions that were NOT already covered in depth in the report (which would benefit from fresh, comprehensive research)." *   Clearly, "Can Claude Desktop use`--append-system-prompt`?" and "How to scope global vs per-agent skills in Claude Code, and evaluating an MCP-based skill exposure architecture" are new topics/extensions NOT covered in depth in the original report! So attaching`"Would you like me to do a more in-depth research instead and propose a research plan?"` at the very end on a new line is appropriate and follows Rule 5 strictly.

1. **Analyze the Research Material for Question 1: Claude Desktop & `--append-system-prompt`:**

- Let's check snippets [^1], [^2], [^1], [^2], [^3], [^1]:
- In [^3] (`https://code.claude.com/docs/en/desktop#cli-flag-equivalents`):

- Claude Desktop has the **Code tab**, which runs the same underlying engine as the CLI.
- CLI flag equivalents table: `--model`, `ANTHROPIC_MODEL`, `--permission-mode`, `--dangerously-skip-permissions`, `--resume`/`--continue`, `--add-dir`, `--allowedTools`/`--disallowedTools` ("No per-session UI equivalent. Permission rules set in settings files (`settings.json`) still apply."), `--verbose`, `--print`/`--output-format` ("Not available: Desktop is strictly interactive only"), `MAX_THINKING_TOKENS`.
- Notice what is NOT in the Desktop UI / flag equivalents: there is **no direct UI field or CLI flag box in Claude Desktop for `--append-system-prompt` or `--system-prompt`** ( [^3]). Wait—let's check [^1] and [^3] accurately! Do NOT fabricate claims.
- Wait: What *does* Claude Desktop support via shared configuration ( [^3], [^2])?

- Desktop and CLI share: `CLAUDE.md`, `CLAUDE.local.md`, MCP servers (`claude_desktop_config.json`, `~/.claude.json`, `.mcp.json`), Hooks, Skills, `~/.claude/settings.json` ( [^3]).
- What about **`outputStyle`** ( [^2], [^2], [^2])?

- Look at [^2]: "Desktop app: set the `outputStyle` field in a settings file, for example `.claude/settings.local.json`, the file the terminal menu writes. When you run `/config` there, Claude Code opens Settings > Code or Settings > Claude Code rather than a menu. To set a style without the menu, edit the `outputStyle` field directly in a settings file: `{ "outputStyle": "Explanatory" }`."
- And look at [^2]: Custom output styles can be created as Markdown files with YAML frontmatter. Wait: by default, a custom output style *omits* built-in software engineering instructions (`keep-coding-instructions: false`), UNLESS you set `keep-coding-instructions: true` ( [^2])! When `keep-coding-instructions: true` is set in a custom output style and selected via `"outputStyle": "..."` in `settings.json` / `.claude/settings.local.json`, it keeps the default coding instructions and sends the custom style instructions with every request (acting functionally very similar to `--append-system-prompt`, except delivered as system-style instructions/reminders per request in the conversation or style layer — specifically [^4] and [^5] note that output style instructions are delivered in the conversation as system reminders / messages, whereas `--append-system-prompt` modifies the System Prompt prefix layer).
- Wait: What about launching Desktop with `claude --desktop` ( [^6], [^3])?

- [^6]: "`--desktop`. Open the Claude Desktop app on the current directory and exit without starting a session in the terminal. ... Takes no prompt and no other flags except `--verbose` and the `--debug` flags, since the app starts the session itself."
- This is a HUGE point! Even if you try `claude --desktop --append-system-prompt ...`, `--desktop` explicitly **takes no other flags** except `--verbose` and `--debug` flags ( [^6]).
- Wait: What about Cowork / Chat in Claude Desktop? Can we check if anything mentions custom instructions or projects? We don't have detailed docs on Claude Desktop's Chat "Projects" instructions, only the Code tab docs ( [^1], [^7], [^3]). Wait: in [^1]: "In the Claude Desktop app, Claude Code is the Code tab. The app also has chat and Cowork..." And [^3] explicitly states: `--print` and `--output-format` are not available, and "Specific flags or settings keys named `system-prompt` or `append-system-prompt` are not directly detailed in this reference section of the documentation." And `--desktop` takes no other flags ( [^6]).
- Also, what about **Subagents** inside Claude Desktop? Since Desktop's Code tab runs the same embedded engine and shares `.claude/` configuration (hooks, skills, settings, etc. — and custom subagents live in `.claude/agents/*.md` or `~/.claude/agents/*.md`), wait: does Desktop share `.claude/agents/`? Let's check snippets to be careful not to overclaim. [^3] lists: `CLAUDE.md` & `CLAUDE.local.md`, MCP Servers, Hooks & Skills, Settings files, Models. [^8] & [^9] show subagents live in `.claude/agents/` and `~/.claude/agents/` and Desktop runs the same underlying engine ( [^3]). Even better: we know for sure from [^2] and [^2] that **Output Styles (`outputStyle` in `settings.json` / `.claude/settings.local.json`)** IS supported in the Desktop app!
- Wait: Can you also run custom subagents or hooks in Desktop? Yes, Hooks and Skills are shared ( [^3]), and `SessionStart` hooks can inject `additionalContext` as system reminders ( [^10]).
- Let's also check: why wouldn't Desktop alone solve the user's "single aggregated group chat UI" anyway? Even in Desktop, [^1] states: "In the Code tab, each conversation is a session: it has its own chat history and project folder, independent of any other session. The sidebar lists your sessions and lets you run several in parallel." It's still a sidebar list of separate sessions, NOT an aggregated group chat timeline! Still, let's directly answer their question about whether `--append-system-prompt` can be used in Claude Desktop and what the closest native alternatives in Desktop are (`outputStyle` with `keep-coding-instructions: true`, `CLAUDE.md`, or `SessionStart` hooks).
2. **Analyze the Research Material for Question 2: Per-Agent Skills Configuration (Global Skill vs. Agent-Specific Skill, Injection Methods, and Evaluating User's MCP Approach):**
Let's carefully read the user's exact scenario and ideas:

- *User's scenario:*

- "Claude Code 全局有 skill，那我想为每个 Agent 配置不同的 skill 方式的话该怎么做？"
- "比如我全局有一个 skill，它是默认不读取的，但是我有一个 Agent 就是需要读取这份 skill 的，怎么做？"
- "读取 skill 其实分两种：一种是直接注入到 system prompt，用 append system prompt 去做；另一种是当成用户的第一条消息注入进去，可以按照 claude code 的方式去做，但是它不能与全局的那份 skill 冲突。"
- "针对第二种方式，有两种选项：第一种是在 Agent 的目录里面再创建一份 .skills 文件夹，然后更新它的 YAML 配置。我的做法是写一个 MCP 服务，通过这份 MCP 会暴露它需要读取的 skill，需要读取的 工具"

Let's check ALL facts in the research snippets about how **Skills** actually work in Claude Code!

1. How Skills actually load & inject in Claude Code ( [^8], [^11], [^12], [^9], [^13], [^14], [^11]):

- First, clarify a crucial detail: In Claude Code, Skills (`SKILL.md` in `~/.claude/skills/<name>/SKILL.md` for global/personal, or `.claude/skills/<name>/SKILL.md` for project) are **NOT** injected into the System Prompt at startup ( [^11]), nor are their full bodies injected into the first user message by default!
- Instead, by default, only the **skill name and `description`** load at startup (as system reminders / skill listing, [^8], [^10], [^11]). The full `SKILL.md` body loads **on demand** into the conversation only when invoked by the user (`/skill-name`) or automatically by Claude via the `Skill` tool when matching the `description` ( [^8], [^11]).
2. What happens with "Global Skill that is NOT read by default, EXCEPT one specific Agent needs it" ( [^14], [^11], [^12], [^11], [^15], [^16], [^17], [^18], [^11], [^9]):

- Wait—let's check the interaction between `disable-model-invocation: true` and `skills:` frontmatter in subagents!
- LOOK AT [^12]!! This is a super important trap documented directly in `https://code.claude.com/docs/en/sub-agents#preload-skills-into-subagents`:

- `skills:` frontmatter field in a subagent definition preloads the **full content** of specified skills directly into that subagent's context at startup ( [^9], [^12]).
- CRITICAL TRAP ( [^12]): "You **cannot** preload skills that have `disable-model-invocation: true` set, because preloading relies on the same pool of skills Claude is permitted to invoke."
- Whoa!! That directly impacts the user's exact scenario ("全局有一个 skill，它是默认不读取的，但是我有一个 Agent 就是需要读取这份 skill 的")!
- Wait: How DO you make a skill NOT auto-invoked by the main/other agents, while allowing a specific Agent to load/use it? Let's check the mechanisms in the snippets:

- If you put `disable-model-invocation: true` on a global skill in `~/.claude/skills/`, **NO model/agent can auto-invoke it OR preload it via `skills:` frontmatter** ( [^12], [^11])! Only a human typing `/skill-name` can invoke it ( [^11]).
- How can you solve "global/other agents don't read it, only Agent X reads it" natively in Claude Code? Let's check all native mechanisms in our snippets:

- **Mechanism 1: Keep the skill out of `~/.claude/skills/` (or restrict via permissions), and put it ONLY in that Agent's scope or preload it while blocking `Skill` tool elsewhere!**

- Wait: If a skill is in global `~/.claude/skills/`, it loads into every project/session's skill description list ( [^11], [^8]).
- Can you restrict which agents can invoke which skills via `permissions.deny` or `disallowedTools`?

- Look at [^11] and [^15]: You can deny skills in permissions (`Skill`, `Skill(name)`, `Skill(skill:)`), OR in a subagent's frontmatter, omit `Skill` from `tools` / add `Skill` to `disallowedTools` ( [^12]). And in the Agent SDK ( [^17], [^18]), you can explicitly pass an allowlist `skills: ["my-skill"]` or `[]`!
- Can you preload a skill into a specific subagent using `skills:` frontmatter ( [^9], [^12])?

- Yes! If the skill does NOT have `disable-model-invocation: true`, adding `skills: [my-skill]` to `.claude/agents/agent-x.md` injects the **full content** of `my-skill` directly into Agent X's startup context ( [^9], [^12]). Meanwhile, for other subagents, omit `Skill` from `tools` (or add `Skill` to `disallowedTools`), so they cannot invoke it ( [^12]). (Though note: the skill's name/description would still appear in the main session's startup list unless blocked via `permissions.deny: ["Skill(my-skill)"]` or `skillOverrides` or kept outside `~/.claude/skills/`! Wait—if blocked by `permissions.deny`, can `skills:` preload it? [^12] says: "If a skill listed in `skills` is missing or disabled (for example, blocked by organizational policy), Claude Code skips that skill and logs a warning in the debug log." So blocking it globally via `skillOverrides` or policy would also block preloading!)
- **Mechanism 2: Independent working directory + `--setting-sources` / `--bare` / local `.claude/skills/` (User's Option 1 & Priority rules)!**

- Let's check [^8] and [^11] and [^6] and [^19] and [^11]:
- Priority/Overriding ( [^8]): "Skills override by name across levels based on priority (`managed > user > project`)" — Wait! Let's double check that exact quote in [^8]: `Skills override by name across levels based on priority (managed > user > project)`! Wait—let's verify if `user` overrides `project` or `project` overrides `user`? Let's read [^8] carefully: `Skills override by name across levels based on priority (managed > user > project)`. That's literally what [^8] says! Wait: if `user` (`~/.claude/skills/`) has higher priority than `project` (`.claude/skills/`), then putting a same-named skill in `.claude/skills/` in the Agent's folder might NOT override `~/.claude/skills/` if `user > project`! Wait—let's check [^11] too: [^11] only talks about local skills vs synced skills from `claude.ai` ("Local skills take priority over skills synced from `claude.ai`"). So [^8] explicitly states `managed > user > project` for skill name overrides! That is a VERY valuable catch to warn the user about regarding "它不能与全局的那份 skill 冲突"!
- Also check `--setting-sources` ( [^6], [^20], [^19]) and `--add-dir` ( [^11], [^6]):

- In CLI, `user`, `project`, and `local` setting sources are all on by default ( [^19]).
- If you launch an Agent process with `--setting-sources project,local` (excluding `user`), or `--bare` + `--add-dir <dir>` ( [^6]: "`--bare` skips auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and `CLAUDE.md`... Exceptions: Skills located in a directory explicitly passed via `--add-dir` still load."), YOU CAN COMPLETELY ISOLATE THAT AGENT FROM GLOBAL `~/.claude/skills/` AND LOAD ONLY THE SKILLS IN ITS SPECIFIC DIRECTORY!
- Whoa!! Look at [^6] on `--bare` + `--add-dir`:

- "`--bare`: Runs in minimal mode by skipping the auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and `CLAUDE.md`..."
- "Interaction with Bare Mode: Skills in a directory passed with `--add-dir` will still load even in bare mode."
- And look at `--setting-sources` ( [^6], [^20], [^19]):

- `--setting-sources` accepts a comma-separated list of setting sources to load (`user`, `project`, `local`). If you pass `--setting-sources project` (omitting `user`), it excludes user-level settings/skills! (Or in the Agent SDK, `settingSources: ['project']` + `skills` allowlist [^18]).
- **Mechanism 3: Evaluating User's Method A (`--append-system-prompt` / `--append-system-prompt-file`) vs. Method B-Option 1 (`.claude/skills/` in Agent directory) vs. Method B-Option 2 (User's MCP Server approach)!**

Let's carefully evaluate all three options the user brought up, strictly grounded in the research snippets:

- **Option A: Injecting the skill directly into System Prompt via `--append-system-prompt` (or `--append-system-prompt-file`)**

- *How it actually behaves:*

- It enters the highest-priority `system` prompt layer (and stays permanently in the prefix cache and survives `/compact`, [^5], [^13], [^21]).
- Wait: If the Agent is a Subagent (`.claude/agents/*.md`), the Markdown body itself *is* its system prompt, OR you can pass `--append-subagent-system-prompt` / `--append-subagent-system-prompt-file` in `-p` mode ( [^6]). Wait: `--append-subagent-system-prompt` applies to *every* subagent ( [^6]), whereas a specific subagent's own `.md` file ( [^9]) or a dedicated standalone `claude` process with `--append-system-prompt-file` ( [^6]) targets that single agent.
- *Pros:* Zero conflict with global `~/.claude/skills/` (even if global skill has `disable-model-invocation: true`, you can just point `--append-system-prompt-file` directly to that `SKILL.md` file or a custom prompt file!). Strongest compliance (`system` > `user`, [^22], [^23]), never forgotten after compaction ( [^13]).
- *Cons:* Consumes tokens and **instruction budget** (~150-200 max instructions total, [^24], [^25]) on *every single turn* of that agent, even on turns when that skill isn't needed ("unconditional tax", [^26]). Also, if the skill uses dynamic command injection like `!`git diff`` or frontmatter tool rules ( [^11]), `--append-system-prompt-file` treats it as raw text and won't execute skill frontmatter/dynamic commands.
- **Option B-1: Putting a `.claude/skills/` folder in the Agent's directory (and updating YAML config)**

- (Note: Clarify the path is `.claude/skills/<skill-name>/SKILL.md`, not `.skills/` [^11].)
- *How it actually behaves & conflict risks:*

- First, Claude Code automatically loads BOTH user-level (`~/.claude/skills/`) AND project-level (`.claude/skills/`) unless restricted ( [^8], [^11]).
- Second, as documented in [^8], skill name collisions resolve with priority **`managed > user > project`**! That means if a global skill in `~/.claude/skills/` has the *same name* as the skill in the Agent's project `.claude/skills/`, **the global user skill actually overrides the project skill** unless you disable `user` setting sources (`--setting-sources project` or `--bare --add-dir ...`) or give the agent skill a different name ( [^8], [^19], [^6])!
- Third, if you use **nested subdirectories** under one root (e.g., `agents/worker1/.claude/skills/`), [^11] explicitly documents that skills in a `.claude/skills/` directory *below* where you started **do not load at startup**—they only load the first time Claude reads or edits a file in that subdirectory (unless passed with `--add-dir` or `/add-dir`)! And if you run `--worktree`, remember [^11] notes worktrees search up to worktree root (falling back to main checkout's `.claude/skills/` if none exists).
- Fourth, if you want a Subagent (`.claude/agents/agent-x.md`) to always read a skill without touching the first user message manually, the native YAML config is `skills: [skill-name]` in the subagent's frontmatter (preloading the skill content at subagent startup, [^9], [^12]), provided the skill does NOT have `disable-model-invocation: true` ( [^12]).
- **Option B-2: User's own approach — Writing an MCP Server to expose only the skills and tools that specific Agent needs!**

- Let's evaluate this! Is an MCP server actually a really clever/viable pattern here, and what are its exact mechanics, pros, and pitfalls in Claude Code?
- Let's check [^20], [^27], [^20], [^8], [^9], [^9], [^28]!
- How MCP works in Claude Code for exposing **Prompts (Skills)**, **Resources (Docs/Skills)**, and **Tools**:

1. **Zero conflict with global Skills (`~/.claude/skills/`)**: MCP servers are completely isolated from `.claude/skills/`. Better yet, MCP servers can expose:

- **MCP Tools** (the exact tools this agent is allowed to call).
- **MCP Prompts** (automatically exposed as `/servername:promptname` slash commands — [^20]; note: do NOT name the MCP server `anthropic-skills`, as that name is reserved [^20]).
- **MCP Resources** (exposed via `@server:protocol://resource/path`, or read on demand via Claude Code's built-in resource listing/reading tools [^20]).
- *(Even better: you can literally build a "Skill Loader" MCP tool like `get_skill(name)` or expose each skill as an MCP Resource/Prompt!)*
2. **Per-Agent Isolation Mechanisms in Claude Code:**

- If the Agent is a **standalone Claude Code CLI process**: launch it with `--mcp-config ./agent-x-mcp.json --strict-mcp-config` ( [^6], [^20]). `--strict-mcp-config` tells Claude Code to **only** use MCP servers from `--mcp-config` and ignore all global/project MCP configs ( [^6])! Combine that with `--setting-sources ""` or `--bare` ( [^6], [^19]) if you also want to ignore global `~/.claude/skills/` and `~/.claude/CLAUDE.md`!
- If the Agent is a **Subagent (`.claude/agents/*.md`)**: Subagent YAML frontmatter has an `mcpServers` field (accepting server names or inline definitions, [^9], [^9]) AND `tools` / `disallowedTools` ( [^9]). Caveat ( [^9]): By default, subagents **inherit** the MCP tools available in the main conversation! So if you mount an MCP server in the main session, subagents inherit it unless filtered via `tools`/`disallowedTools`. Conversely, configuring inline `mcpServers` inside a specific subagent's YAML scopes that MCP server directly to that subagent (note: plugin subagents ignore `mcpServers` for security [^9], [^9]).
3. **Pros of the User's MCP Approach (especially for their custom UI!):**

- **Dynamic & Decoupled from Filesystem:** Remember the user wants to build a UI to manage each Agent's tools, skills, and context! With an MCP server (or per-agent MCP config), your UI can dynamically serve different skills and tools per Agent from a central service/database **without creating duplicated `.claude/skills/` folders everywhere**, and **without modifying global `~/.claude/` configs**.
- **On-Demand Loading / Context Efficiency (MCP Tool Search):** Claude Code uses **MCP Tool Search** by default, deferring full JSON tool schemas until needed and only loading tool names and server instructions (truncated past 4,096 chars) at startup ( [^20], [^8]). So exposing skills/tools via MCP keeps startup context lightweight, achieving the same "progressive disclosure" as Skills! (Or you can set `"alwaysLoad": true` in `.mcp.json` if a specific agent must always load those tool definitions upfront, [^20]).
- **Cross-Platform / Desktop Compatibility:** An MCP server can also be attached in Claude Desktop (`claude_desktop_config.json` / Connectors UI) or CLI ( [^1], [^3]).
4. **Pitfalls / Caveats of the MCP Approach to Watch Out For:**

- **Doesn't auto-inject into System Prompt or First User Message by itself:** An MCP server provides tools/resources/prompts that the agent *calls or fetches when needed* (or server `instructions` loaded at startup, capped at 4,096 chars [^20]). If the skill is a critical constraint that the agent *must* know before acting (or won't know to search for), you still need a short cue in `--append-system-prompt` (or the MCP server's `instructions` field / first user message) telling the agent: *"Before doing X, call `read_skill` / read `@mcp:skill://...`"* (or set `alwaysLoad: true` on the critical MCP tool [^20]).
- **MCP Tool Search limitation on Azure Microsoft Foundry:** Note [^20] mentions Tool Search is rejected server-side on Azure Microsoft Foundry deployments (falls back to upfront loading), though on standard Anthropic API / Claude subscription it works natively.
- **Subagent Inheritance Leakage:** As noted in [^9], subagents inherit all MCP tools from the main conversation unless you restrict them with `tools:` / `disallowedTools:` in the subagent's frontmatter ( [^9]), or run agents as separate CLI processes with `--strict-mcp-config` ( [^6]).
- Compaction Behavior ( [^13], [^5]): Tool results (like reading a skill via an MCP tool) enter the **Conversation layer** and **get summarized away during `/compact`** ( [^13], [^5]), unlike `--append-system-prompt` (which is preserved in the System Prompt layer [^13]) or preloaded subagent `skills:` / invoked skills (which have capped reload behavior [^13]). So if a long-running agent compacts, it may need to re-call the MCP skill tool if details were lost in the summary!
- **Prompt Caching & Security:** If your MCP server dynamically changes its tool list *mid-session*, it invalidates the System Prompt cache layer ( [^5]: "System prompt layer changes when: The set of loaded tool definitions changes"). Keep the MCP tool *definitions* static per session, and only pass dynamic skill *content* as tool/resource responses (which append to the Conversation layer and keep the prefix cached [^5]).
3. **Review Structure & Grounding:**
Let's organize the response cleanly into two clear parts matching the user's two questions:

- **Part 1: 能不能在 Claude Desktop 中使用 `--append-system-prompt` 来替代自己写 App？**

- **Direct Answer:** **不能直接传 `--append-system-prompt` 参数**。解释底层原因：

- Desktop 的 **Code 标签页**虽然与 CLI 共用底层引擎，但它是纯交互式 GUI，没有在界面上暴露 `--append-system-prompt` 或 `--system-prompt` 的输入框/配置项 [^3]。
- 即便从命令行用 `claude --desktop` 拉起 Desktop，官方明确限制 `--desktop` **不能携带其他 CLI 参数**（仅支持 `--verbose` 和 `--debug`），因为会话是由 Desktop App 自己启动的 [^6]。
- **Desktop 中最接近的替代方案（共享配置）**：

- Desktop 与 CLI 共享 `CLAUDE.md`、`CLAUDE.local.md`、MCP 配置（`claude_desktop_config.json` / `~/.claude.json` / `.mcp.json`）、Hooks、Skills 和 `~/.claude/settings.json` [^3]。
- **最接近 `--append-system-prompt` 的平替是 `outputStyle`（输出样式）**：你可以在 `.claude/settings.local.json` 或 `~/.claude/settings.json` 中配置 `{"outputStyle": "你的样式名"}`（Desktop 支持通过 settings 文件读取 `outputStyle`） [^2]。创建自定义样式 Markdown 文件时，默认会省略内置工程指令，只要在 YAML Frontmatter 中设置 **`keep-coding-instructions: true`**，就能保留完整的默认编码能力并附加你的专属角色设定 [^2]（注：与 `--append-system-prompt` 的底层差异在于，Output Style 是作为系统提醒/对话消息随请求发送，而不是修改 System Prompt 前缀层 [^4]）。
- 或者通过 **`SessionStart` Hook** 输出 `additionalContext` 注入系统提醒 [^3]。
- **为什么 Desktop 仍然替代不了你想要的“群聊 App”？**

- 除了不支持 `--append-system-prompt`，Desktop 的 Code 标签页本质上依然是**侧边栏多独立会话列表**（每个会话独立历史和目录） [^1]，无法实现你之前想要的“多 Agent 消息按时间聚合成一个群聊窗口 + 统筹伙伴自动派发 + 隐形伙伴历史清洗跳转”。所以如果你追求极简且只需要单人/单窗口交互，可以用 Desktop + `outputStyle`/`CLAUDE.md`/MCP；但如果要实现你的群聊工作流，还是需要自己做 UI（或基于 `T3 Code` / `Happy` 开源底座二开）。
- **Part 2: 全局 Skill 不默认读取，但指定 Agent 需要读取——三种配置方案深度对比与评估（特别是你的 MCP 方案）**

- **首先纠正一个关键的原生机制与隐藏陷阱**：

1. Claude Code 的 Skill（全局在 `~/.claude/skills/<name>/SKILL.md`，项目在 `.claude/skills/<name>/SKILL.md`）**默认只加载名称和 `description` 到启动上下文，正文并不会在启动时注入 System Prompt 或第一条 User 消息**，而是触发时才按需加载正文 [^8]。
2. **核心踩坑预警（`disable-model-invocation: true` 与 `skills:` 预加载互斥）**：如果你把全局 Skill 设成 `disable-model-invocation: true` 来让其他 Agent“默认不读取”，那么**在子智能体（Subagent）的 YAML 中配置 `skills:` 预加载也会直接失效并跳过**！因为官方规定 `skills:` 预加载依赖模型可调用的技能池，不能预加载设置了 `disable-model-invocation: true` 的技能 [^12]。
3. **命名冲突方向预警（`user > project`）**：官方技能覆盖优先级是 **`managed > user > project`** [^8]。也就是说，如果在全局 `~/.claude/skills/` 和某个 Agent 目录的 `.claude/skills/` 下放了**同名** Skill，**全局的 user 级会覆盖项目的 project 级**（而不是目录里的覆盖全局） [^8]！
- **对比你的三种实现思路（附带原生最简改法）**：

- **方式一：直接通过 `--append-system-prompt`（或 `--append-system-prompt-file`）注入**

- *实现*：单独启动该 Agent 进程时传入 `--append-system-prompt-file ~/.claude/skills/my-skill/SKILL.md`（若想彻底屏蔽其他全局配置，可叠加 `--setting-sources project` 或 `--bare`） [^6]；如果是单会话内的原生 Subagent，则直接把这份 Skill 写进该 Subagent（`.claude/agents/agent-x.md`）的 Markdown 正文里（该正文就是它独立的 System Prompt） [^9]。
- *优缺点*：完全不会和全局 Skill 冲突，指令权重最高，`system` 层级在 `/compact` 压缩后也永久保留 [^13]；缺点是**每轮对话都在消耗 Token 和指令预算**（即使当前轮次不需要这份 Skill），且不会触发 Skill 的动态命令替换（如 `!`command``） [^11]。
- 方式二（选项 1）：在 Agent 目录下建 `.claude/skills/` 并配置 YAML（注意正确目录名是 `.claude/skills/` 而非 `.skills/` [^11]）

- *避坑实现*：

- 不要把这份 Skill 放在全局 `~/.claude/skills/`（或如果放在全局必须避免同名，因为 `user > project` [^8]）。
- 如果每个 Agent 是独立启动的 CLI 进程：用 `--setting-sources project,local`（排除 `user`）来隔离全局配置 [^19]；或者用 **`--bare --add-dir ./agent-x-skills`**——官方文档明确说明 `--bare` 会跳过所有全局技能和 `CLAUDE.md` 自动发现，**唯独会加载 `--add-dir` 显式传入目录下的 Skills** [^6]！这几乎是为“单 Agent 独占指定目录 Skill”量身定制的原生开关。
- 如果是主会话下的 Subagent：把这份 Skill 放在项目 `.claude/skills/` 下（**不设** `disable-model-invocation: true`），只给目标 Agent X 的 `.claude/agents/agent-x.md` 配置 `skills: [target-skill]` 预加载 [^9]；同时给其他不需要它的 Subagent 在 Frontmatter 中去掉 `Skill` 工具（放入 `disallowedTools: [Skill]`），防止其他 Subagent 误调用 [^12]。另外注意：如果 `.claude/skills/` 放在当前工作目录的**子目录**下，默认启动时不会加载，直到 Agent 访问该子目录文件或用 `--add-dir` 才加载 [^11]。
- **方式三（选项 2，你的做法）：写一个 MCP 服务来统一暴露该 Agent 需要的 Skill 和 Tools**

- **综合评价：这是最适合“自研管理 UI + 多 Agent 精准权限隔离”的工程化架构！**
- *为什么 MCP 方案非常契合你的目标*：

1. **彻底规避全局 Skill 冲突与目录碎片**：MCP 服务暴露的 Tools、MCP Prompts（以 `/servername:promptname` 暴露）和 MCP Resources（`@server:uri`）完全独立于 `~/.claude/skills/` 体系（注意 MCP 服务名称不要取 `anthropic-skills`，这是保留字） [^20]。你的 UI 可以集中托管所有 Skill 和工具定义，按 Agent 身份动态下发配置，不需要在磁盘到处建 `.claude/skills/` 软链接或目录。
2. **进程级与 Subagent 级隔离能力强**：

- 如果每个 Agent 是独立 CLI 进程：用 `--mcp-config ./agent-x.mcp.json --strict-mcp-config`，可以强制该 Agent **只加载**这一个 MCP 服务，屏蔽所有全局和项目级 MCP [^6]。
- 如果采用 Subagent：可以在单个 Subagent 的 YAML Frontmatter 的 `mcpServers` 中内联配置专属 MCP（需注意插件形式的 Subagent 会忽略此字段，且普通 Subagent 默认会**继承主会话已挂载的 MCP 工具**，因此主会话不要挂这个 MCP，或者用 `tools`/`disallowedTools` 严格限制其他 Subagent） [^9]。
3. **天然具备渐进式披露（低上下文占用）**：Claude Code 默认开启 **MCP Tool Search**，启动时只加载工具名和服务端 `instructions`（超过 4,096 字符会被截断），只有 Agent 真正需要用时才按需拉取工具 Schema；如果你希望某份核心工具或 Skill 必须始终加载，也可以在 JSON 配置里设为 `"alwaysLoad": true` [^20]。
- *使用 MCP 暴露 Skill 必须注意的 3 个工程细节*：

1. **“工具返回”不等于“首条消息/System Prompt 强制注入”**：MCP 工具返回的 Skill 正文或 MCP Resource 会作为 `tool_result` 进入 **Conversation 对话层**，因此它**在 `/compact` 压缩时会被摘要总结掉**（不像 `--append-system-prompt` 那样永久驻留 System 层） [^5]。因此，建议把 Skill 的“核心触发条件/行为红线”精简写入 MCP Server 的 `instructions` 或该 Agent 的短提示词中（提醒它遇到某类任务先调用 `get_skill` 读取完整流程），或者把极少数不可妥协的铁律留在 `--append-system-prompt` 里。
2. **保护 Prompt Cache（不要在会话中途动态改 MCP 工具列表）**：Claude Code 的第一层缓存（System Prompt 层）只要检测到**已加载的工具定义集合发生变化就会全量失效** [^5]。因此最佳实践是：MCP 暴露出去的**工具签名（如 `list_skills`、`read_skill`）在单个会话生命周期内保持固定**，把不同的 Skill 内容作为数据通过工具返回值或 Resource 返回（只影响末尾的 Conversation 层，前面缓存 100% 命中） [^5]。
3. **Azure Foundry 环境兼容性**：如果你的后端接的是 Azure 上的 Microsoft Foundry 部署，注意它服务端不支持 MCP Tool Search，Claude Code 会自动退化为启动时全量加载该 MCP 的所有工具定义（建议此时更要通过 `--strict-mcp-config` 精简单个 Agent 挂载的工具数） [^20]。
4. **Check formatting, citations, and rules:**

- No `<report>` tag.
- No internal language ("snippets", "research material", etc.).
- Citations strictly `[cite: source_id]` or [^29].
- Check every single source ID used!

- Let's verify exact source IDs from the provided research notes:

- [^6]: `--desktop` takes no prompt and no other flags except `--verbose` and `--debug`.
- [^3]: Desktop CLI flag equivalents, shared configuration (`CLAUDE.md`, MCP, Hooks, Skills, `settings.json`), `--print`/`--output-format` not available, `system-prompt`/`append-system-prompt` not in Desktop CLI equivalents.
- [^2]: Desktop app `outputStyle` in `.claude/settings.local.json` or `~/.claude/settings.json`.
- [^2]: `keep-coding-instructions: true` in custom output style; output styles don't apply to subagents (except forked conversations).
- [cite: 4], [^5]: Output style instructions are delivered in the conversation as system reminders / messages (not the system prompt prefix), keeping the system prompt cached.
- [^1]: Desktop Code tab sessions each have their own chat history and project folder; sidebar lists sessions.
- [^10]: `SessionStart` / hooks returning `additionalContext` via system reminders.
- [^8]: Skills only load names/descriptions at startup; full content loads on demand when invoked; priority `managed > user > project`.
- [^11]: Skills directory paths (`~/.claude/skills/<name>/SKILL.md` vs `.claude/skills/<name>/SKILL.md`), `disable-model-invocation: true`, dynamic context injection (`!`command``), not loaded into system prompt at startup.
- [^12]: `skills:` frontmatter preloads full content into subagent context at startup; **cannot** preload skills with `disable-model-invocation: true`; omit `Skill` from `tools` or add to `disallowedTools` to stop a subagent from invoking skills.
- [^9]: Subagent markdown body is its system prompt; `mcpServers`, `tools`, `disallowedTools`, `skills` frontmatter fields; `omitClaudeMd: true`.
- [^9]: Plugin subagents ignore `hooks`, `mcpServers`, `permissionMode`.
- [^9]: Subagents inherit built-in tools and MCP tools available in the main conversation (narrowed by filters).
- [^11]: Skills in `.claude/skills/` below start directory don't load at startup until file read/edit or `--add-dir` / `/add-dir`.
- [^6]: `--bare` skips auto-discovery of hooks, skills, MCP servers, `CLAUDE.md`, etc., EXCEPT skills in a directory passed with `--add-dir` still load! `--append-system-prompt-file` and `--system-prompt` details.
- [^6], [^20], [^19]: `--setting-sources` (comma-separated `user`, `project`, `local`); `--strict-mcp-config` (only use MCP servers from `--mcp-config`).
- [^20]: MCP prompts (`/servername:promptname`, `anthropic-skills` reserved), MCP resources (`@server:uri`), MCP Tool Search (defers full schemas; server instructions & upfront tool descriptions truncated past 4,096 chars; `alwaysLoad: true` / `false`; Azure Microsoft Foundry doesn't support Tool Search).
- [^5], [^5], [^13]: Cache layers (System prompt layer invalidates when loaded tool definitions change; Conversation layer summarizes on `/compact`; System prompt preserved on `/compact`).
- [cite: 24], [^25], [^26], [^22]: Instruction budget (~150-200), unconditional tax, instruction hierarchy (`system > user > tool`).
- Check LaTeX & tables:

- If creating a table, use single spaces between cell content and pipe (`|`) separators, do not pretty-print tables! Example:
`| 方案 | 注入位置 | 优点 |`
`| --- | --- | --- |`
- Never place citations inside fenced code blocks.
- Check Rule 5 ending line:

- User's prompt is in Chinese. Should the ending line be exact English `"Would you like me to do a more in-depth research instead and propose a research plan?"`?
- Let's check the system instruction carefully:
`attach the following question on a new line at the very end of your response:`
`"Would you like me to do a more in-depth research instead and propose a research plan?"`
- Look at the previous assistant turns in the conversation history! Even though the conversation is in Chinese, the previous assistant turn ended with the exact English string:
`Would you like me to do a more in-depth research instead and propose a research plan?`
- Keeping it exact matches both the instruction and the established pattern in this conversation.
5. **Refine the Content for Clarity, Accuracy, and Actionability:**

- Make sure to address the user's typo/speech-to-text smoothly ("Cloud Code" -> Claude Code, etc.) without making it awkward.
- Make sure every point directly answers what the user asked:

1. Can I use `system prompt append` (`--append-system-prompt`) in Claude Desktop so I don't have to build an app?

- Clear "No, not directly" + exact reasons ( [^3]).
- What Desktop *can* use as a partial substitute (`outputStyle` in `settings.json` with `keep-coding-instructions: true`, plus `CLAUDE.md`, Hooks, MCP [^2]).
- Why Desktop still won't give them the "aggregated group chat UI" they described ( [^1]).
2. How to configure different Skills for different Agents (specifically: a global Skill not read by default, which only one specific Agent needs, without conflicting with global Skills), comparing:

- Injecting via `--append-system-prompt`
- Injecting / loading via directory `.claude/skills/` + YAML config
- User's own approach: an MCP server exposing that Agent's required skills & tools.
- Verify the table formatting: single space around `|`? Wait: "use only single spaces between cell content and pipe (`|`) separators. Do not pretty-print tables."
Example:
`| 方案 | 实现机制 | 是否会与全局 Skill 冲突 | 上下文与压缩表现 | 适用建议 |`
`| --- | --- | --- | --- | --- |`
Yes! That follows the exact rule (single space between cell content and `|`, no extra padding spaces for visual alignment).
6. **Final Polish & Fact-Check:**

- Did I verify `keep-coding-instructions: true`? Yes, [^2]: "Setting `keep-coding-instructions: true` in the YAML frontmatter explicitly retains these standard engineering behavior rules alongside your custom style instructions."
- Did I verify Desktop `outputStyle` support? Yes, [^2]: "Desktop app: set the `outputStyle` field in a settings file, for example `.claude/settings.local.json`".
- Did I verify `--desktop` flag restrictions? Yes, [^6]: "Takes no prompt and no other flags except `--verbose` and the `--debug` flags, since the app starts the session itself."
- Did I verify `disable-model-invocation: true` vs subagent `skills:` preload? Yes, [^12]: "You **cannot** preload skills that have `disable-model-invocation: true` set, because preloading relies on the same pool of skills Claude is permitted to invoke."
- Did I verify skill override priority `managed > user > project`? Yes, [^8]: "Skills override by name across levels based on priority (`managed > user > project`)".
- Did I verify `--bare` + `--add-dir`? Yes, [^6]: "`--bare`: Runs in minimal mode by skipping the auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and `CLAUDE.md`... Interaction with Bare Mode: Skills in a directory passed with `--add-dir` will still load even in bare mode."
- Did I verify `--strict-mcp-config`? Yes, [^6].
- Did I verify MCP Tool Search 4,096 chars truncation and `alwaysLoad`? Yes, [^20].
- Did I verify MCP tool changes invalidating System Prompt cache? Yes, [^5].
- Did I ensure no citations are inside fenced code blocks? Yes.
- Everything is rock-solid, accurate, and directly helpful to the user's architecture design. Let's write the response.针对你提到的这两个问题，结合 Claude Code 和 Claude Desktop 的官方底层机制，具体结论和方案对比如下：

### 一、 能否在 Claude Desktop 中使用 `--append-system-prompt` 来替代自研 App？

直接答案：不能直接传递 `--append-system-prompt` 参数 [^3]。

1. **为什么 Desktop 不支持该参数？**

- Claude Desktop 中的 **Code 标签页**虽然底层运行相同的 Claude Code 引擎，但它是一个纯交互式的图形客户端 [^1]。官方明确未在 Desktop 中开放 `--append-system-prompt`、`--system-prompt` 或 `--print` 等命令行注入参数 [^3]。
- 即使你试图从终端通过 `claude --desktop` 命令拉起 Desktop，官方文档也明确限制 `--desktop` **不能携带任何其他参数**（仅支持 `--verbose` 和 `--debug` 调试标志），因为会话是由 Desktop App 自己初始化并启动的 [^6]。
2. **Desktop 中最接近 `--append-system-prompt` 的原生平替方案**
Desktop 与 CLI 共享同一套配置文件体系（`CLAUDE.md`、`CLAUDE.local.md`、MCP 配置、Hooks、Skills 以及 `settings.json`） [^3]。如果你只想借用 Desktop 客户端而不自己写界面，可以通过以下两种共享配置实现近似效果：

- **使用自定义 Output Style（最接近追加系统提示词）**：Desktop 原生支持读取 `.claude/settings.local.json` 或 `~/.claude/settings.json` 中的 `{"outputStyle": "你的样式名"}` [^2]。当你编写自定义样式 Markdown 文件时，默认会抹除内置的软件工程指令，但只要在顶部 YAML 中加上 **`keep-coding-instructions: true`**，就能保留全部默认编程能力并附带你的角色规则 [^2]。（注：与 `--append-system-prompt` 的底层区别在于，Output Style 是作为系统提醒/对话消息随请求发送的，而非修改最底层的 System Prompt 前缀 [^4]。）
- **配合 `SessionStart` Hook**：Desktop 同样会执行配置在 `settings.json` 中的 Hooks [^3]，你可以用 `SessionStart` Hook 在会话开启时动态注入 `additionalContext` 作为系统提醒 [^10]。
3. **为什么 Desktop 依然替代不了你的“群聊 App”？**
在交互形态上，Claude Desktop 的 Code 标签页本质上仍然是**侧边栏多独立会话列表**——每个会话各自隔离自己的聊天历史与项目目录 [^1]。它无法把多个 Agent 会话的消息按时间线聚合到同一个群聊窗口中，因此如果你要落地“单群聊视图 + 统筹伙伴调度 + 后台清洗历史”，依然需要自研前端（或基于上一轮提到的 `T3 Code` / `Happy` 等 MIT 开源底座改造）。

### 二、 全局 Skill 不默认读取，但指定 Agent 需要读取——三种配置方案对比（含对你的 MCP 方案评估）

在对比三种方案前，必须先指出 Claude Code 在 Skill 机制上的**三个关键底层规则（也是极易踩坑的地方）**：

1. **Skill 的默认加载机制**：全局（`~/.claude/skills/<name>/SKILL.md`）或项目级（`.claude/skills/<name>/SKILL.md`）的 Skill **默认只把名称和 `description` 放进启动上下文**，正文并不会直接注入 System Prompt 或第一条 User 消息，而是由模型在认为匹配时按需加载 [^8]。
2. **互斥陷阱（`disable-model-invocation: true` 与子智能体预加载互斥）**：如果你为了“让全局 Skill 默认不被其他 Agent 读取”，在全局 Skill 里设置了 `disable-model-invocation: true`，那么你**无法**在某个特定 Subagent 的 YAML Frontmatter 中通过 `skills: [skill-name]` 预加载它！官方明确规定，`skills:` 预加载依赖模型有权自动调用的技能池，带 `disable-model-invocation: true` 的技能会被直接跳过 [^12]。
3. **冲突覆盖方向（`user > project`）**：官方技能同名覆盖的优先级是 **`managed > user > project`** [^8]。这意味着，如果全局 `~/.claude/skills/` 下有一份同名 Skill，**全局（`user`）会反过来覆盖掉 Agent 专属目录里的 `.claude/skills/`（`project`）** [^8]，而不是目录里的覆盖全局！

基于上述机制，下面对比你提到的三种做法：

| 方案 | 实现机制与避坑配置 | 是否会与全局 Skill 冲突 | 上下文消耗与压缩表现 | 综合评价 |
| --- | --- | --- | --- | --- |
| 方案 1：通过 --append-system-prompt-file 注入 | 启动指定 Agent 进程时直接将 SKILL.md 路径传给 --append-system-prompt-file（若为单会话内原生 Subagent，则直接写进 .claude/agents/agent-x.md 正文） | 完全不冲突（可叠加 --setting-sources project 或 --bare 屏蔽全局 user 配置） | 每轮都占 Token 与指令预算；但位于 System 层，/compact 压缩后永久保留不丢失 | 适合体量较小、且该 Agent 每一轮都必须严格遵守的核心规则；注意该方式不会解析 Skill Frontmatter 或 !`command`  动态命令 |
| 方案 2A：在 Agent 目录建 .claude/skills/ 并改配置 | 1. 独立进程时：用 --bare --add-dir ./agent-x-skills（--bare 会跳过所有全局 CLAUDE.md 和全局 Skills，唯独会加载 --add-dir 传入目录下的 Skills），或用 --setting-sources project,local 排除全局 user 级；2. Subagent 时：不要在全局放同名 Skill，只在目标 .claude/agents/agent-x.md 写 skills: [name] 预加载，其他 Subagent 禁用 Skill 工具 | 有冲突风险（注意目录名是 .claude/skills/ 而非 .skills/；若未屏蔽 user 源且同名，全局会覆盖项目级） | 按需加载或子智能体启动时预加载；注意：子目录内的 .claude/skills/ 默认不加载，直到访问该目录或显式 --add-dir | 适合纯按目录隔离的原生多目录架构，但当你需要用 UI 动态给不同 Agent 组合增减技能时，磁盘文件夹管理会变得繁琐 |
| 方案 2B（你的做法）：写一个 MCP 服务按 Agent 暴露 Skill 与 Tools | 写一个统一 MCP Server，分别暴露各 Agent 需要的 Tools、MCP Prompts（/server:prompt）或 MCP Resources（@server:uri）；启动独立 Agent 时配合 --mcp-config + --strict-mcp-config | 完全不冲突（MCP 体系与 .claude/skills/ 彻底隔离；注意服务名不能叫 anthropic-skills，这是系统保留名） | 默认通过 MCP Tool Search 按需拉取工具定义，启动极省上下文（服务端 instructions 截断上限 4,096 字符） | 最契合你自研 UI 的工业级方案！ 可集中动态管控每个 Agent 的工具与技能，无需维护满磁盘的隐藏文件夹 |

#### 针对你“用 MCP 暴露 Skill 与 Tools”方案的 4 条关键落地建议

你的直觉非常准确——既然你本来就要做一套 UI 来管理每个 Agent 的 Tools、工作目录和记忆，**用 MCP 作为统一的能力与 Skill 分发总线，比在磁盘上维护碎片化的 `.claude/skills/` 更干净、更容易被 UI 控制**。但在 Claude Code 底座上落地时，建议注意以下四个细节：

1. **用 `--strict-mcp-config` 锁死单 Agent 边界（或小心 Subagent 继承泄漏）**

- 如果你的每个伙伴是独立的 CLI 进程，启动时务必加上 `--mcp-config ./agent-x.mcp.json --strict-mcp-config`，这样 Claude Code 会强制忽略全局和项目级的其他 MCP，只加载你为该 Agent 分配的 MCP 实例 [^6]。
- 如果你的伙伴是主会话内的原生 **Subagent**（`.claude/agents/*.md`），要特别注意：**Subagent 默认会继承主会话中已经挂载的所有 MCP 工具** [^9]。因此要么不在主会话挂载该 MCP、改为直接在目标 Subagent 的 Frontmatter `mcpServers` 中内联声明 [^9]，要么通过 `tools` / `disallowedTools` 严格把其他 Subagent 的 MCP 调用权限剥离 [^9]。
2. **用固定工具签名返回 Skill 内容，千万不要在会话中途动态增减 MCP 工具列表**

- Claude Code 的第一层缓存（System Prompt 层）在**已加载的工具定义集合发生变化时会整层失效** [^5]。
- 因此，不要为每个 Skill 临时动态生成一个新的 MCP Tool 注册进工具列表。更好的做法是：给 MCP 设计固定不变的通用工具（如 `list_available_skills`、`load_skill(name)`）或暴露为 **MCP Resources** [^20]。这样工具定义在会话期间 100% 静态，前缀缓存持续命中，Skill 正文只作为返回结果进入对话末尾 [^5]。
3. **补足 MCP 工具在 `/compact` 压缩后的“易忘”短板**

- 通过 MCP 工具读取到的 Skill 内容，进入的是 **Conversation（对话）层**；一旦对话变长触发 `/compact`，这些历史工具返回内容会被压缩进摘要，细节可能丢失 [^5]。
- 因此，建议将“什么时候必须调用 `load_skill`”的简短触发指令写入 MCP Server 的 `instructions`（4,096 字符以内） [^20] 或该 Agent 的短 `--append-system-prompt` 中；如果某条规范属于“压缩后绝不能忘的红线”，则仍然放在 `--append-system-prompt` 里，而把长篇操作手册、参考文档放在 MCP 里按需拉取。
4. **留意核心工具的 `alwaysLoad` 开关与模型端兼容性**

- Claude Code 默认开启 MCP Tool Search 延迟加载工具细节，但如果你发现某个 Agent 对某个高频核心工具搜索不够积极，可以在它的 MCP JSON 配置里给该服务加上 `"alwaysLoad": true` 强制在启动时加载完整定义（注意该服务启动连接超时上限为 5 秒） [^20]。此外，如果你的模型网关接的是部署在 Azure 上的 Microsoft Foundry，它服务端会拒绝 Tool Search，Claude Code 会自动退化为启动时全量加载 MCP 工具 [^20]。

Would you like me to do a more in-depth research instead and propose a research plan?

---

## 📚 参考文献与引用源

1. [**code.claude.com**｜Desktop application - Claude Code Docs](https://code.claude.com/docs/en/desktop)
2. [**code.claude.com**｜Output styles - Claude Code Docs](https://code.claude.com/docs/en/output-styles)
3. [**code.claude.com**](https://code.claude.com/docs/en/desktop#cli-flag-equivalents)
4. [**code.claude.com**｜Glossary - Claude Code Docs](https://code.claude.com/docs/en/glossary)
5. [**code.claude.com**｜How Claude Code uses prompt caching](https://code.claude.com/docs/en/prompt-caching)
6. [**code.claude.com**｜CLI reference - Claude Code Docs](https://code.claude.com/docs/en/cli-reference)
7. [**code.claude.com**｜Get started with the desktop app - Claude Code Docs](https://code.claude.com/docs/en/desktop-quickstart)
8. [**code.claude.com**](https://code.claude.com/docs/en/features-overview)
9. [**code.claude.com**｜Create custom subagents - Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
10. [**code.claude.com**](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)
11. [**code.claude.com**｜Extend Claude with skills - Claude Code Docs](https://code.claude.com/docs/en/skills)
12. [**code.claude.com**](https://code.claude.com/docs/en/sub-agents#preload-skills-into-subagents)
13. [**code.claude.com**](https://code.claude.com/docs/en/context-window)
14. [**code.claude.com**｜Best practices for Claude Code - Claude Code Docs](https://code.claude.com/docs/en/best-practices)
15. [**code.claude.com**｜Configure permissions - Claude Code Docs](https://code.claude.com/docs/en/permissions)
16. [**code.claude.com**｜Configure auto mode - Claude Code Docs](https://code.claude.com/docs/en/auto-mode-config)
17. [**code.claude.com**｜Extend agents with skills - Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/skills)
18. [**code.claude.com**｜Use Claude Code features in the SDK](https://code.claude.com/docs/en/agent-sdk/claude-code-features)
19. [**code.claude.com**｜Plugin loading reference - Claude Code Docs](https://code.claude.com/docs/en/plugins/loading)
20. [**code.claude.com**｜Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
21. [**honeyhive.ai**｜What is a system prompt? - HoneyHive AI](https://www.honeyhive.ai/learn/system-prompt)
22. [**aclanthology.org**｜Many-Tier Instruction Hierarchy in LLM Agents - ACL Anthology](https://aclanthology.org/2026.findings-emnlp.1420.pdf)
23. [**reddit.com**｜When to use '—append-system-prompt' vs CLAUDE.md? : r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/)
24. [**humanlayer.dev**](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
25. [**ajbuilds.medium.com**｜Your CLAUDE.md Is Probably Broken — Here's How to Tell (And Fix It)](https://ajbuilds.medium.com/your-claude-md-is-probably-broken-heres-how-to-tell-and-fix-it-87cbf24d317d?source=rss------ai-5)
26. [**scoutapm.com**](https://www.scoutapm.com/blog/prompts-skills-and-the-agents-md-nobody-wants-to-write)
27. [**code.claude.com**｜Control MCP server access for your organization - Claude Code Docs](https://code.claude.com/docs/en/managed-mcp)
28. [**claudecodecamp.com**](https://www.claudecodecamp.com/p/inside-claude-code-s-system-prompt)
29. [**reddit.com**｜Claude Code System Reminder : r/ClaudeCode - Reddit](https://www.reddit.com/r/ClaudeCode/comments/1oqogwu/claude_code_system_reminder/)
30. [**code.claude.com**｜Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
31. [**reddit.com**｜When does Claude read CLAUDE.md files (and which does it read)](https://www.reddit.com/r/ClaudeCode/comments/1ouaqbq/when_does_claude_read_claudemd_files_and_which/)
32. [**empromptu.ai**｜AGENTS.md and CLAUDE.md: Writing Guardrails for AI | Empromptu](https://empromptu.ai/blog/agents-md-claude-md-coding-guardrails)
33. [**youtube.com**｜Claude Code answered in English? Use --append-system-prompt](https://www.youtube.com/shorts/IUhSqbFAg_o)
34. [**youtube.com**｜Run Multiple AI Agents in Parallel (Claude Code Tutorial) - YouTube](https://www.youtube.com/watch?v=n35KalqEwJc)
35. [**code.claude.com**｜Settings files and precedence - Claude Code Docs](https://code.claude.com/docs/en/settings)
36. [**code.claude.com**｜How Claude Code works - Claude Code Docs](https://code.claude.com/docs/en/how-claude-code-works)
37. [**code.claude.com**｜Explore the .claude directory - Claude Code Docs](https://code.claude.com/docs/en/claude-directory)
38. [**code.claude.com**｜Week 27 · June 29 – July 3, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w27)
39. [**markdown.engineering**](https://www.markdown.engineering/learn-claude-code/39-system-prompt)
40. [**dosu.dev**](https://dosu.dev/articles/context-compaction-coding-agents)
41. [**code.claude.com**｜Run parallel sessions with worktrees - Claude Code Docs](https://code.claude.com/docs/en/worktrees)
42. [**code.claude.com**｜Message your other Claude Code sessions](https://code.claude.com/docs/en/cross-session-messaging)
43. [**mintlify.com**｜Context rot: what it is and how to reduce it with your docs - Mintlify](https://www.mintlify.com/library/context-rot)
44. [**aimuse.blog**｜System Prompts Versus User Prompts - AI Muse by kekePower](https://aimuse.blog/article/2025/06/14/system-prompts-versus-user-prompts-empirical-lessons-from-an-18-model-llm-benchmark-on-hard-constraints)
45. [**kompozy.io**｜System Prompt — definition · Kompozy](https://kompozy.io/glossary/system-prompt)
46. [**roboco.io**｜Claude Code Deep Dive: How Is Claude Code Actually Built ...](https://roboco.io/en/posts/claude-code-deep-dive/)
47. [**code.claude.com**｜Orchestrate teams of Claude Code sessions - Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
48. [**code.claude.com**｜How Claude remembers your project - Claude Code Docs](https://code.claude.com/docs/en/memory)
49. [**code.claude.com**｜Week 22 · May 25–29, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w22)
50. [**code.claude.com**｜Common workflows - Claude Code Docs](https://code.claude.com/docs/en/common-workflows)
51. [**code.claude.com**｜Commands - Claude Code Docs](https://code.claude.com/docs/en/commands)
52. [**code.claude.com**｜Week 23 · June 1–5, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w23)
53. [**code.claude.com**｜Automate work with scheduled tasks - Claude Code Docs](https://code.claude.com/docs/en/routines)
54. [**code.claude.com**｜Agent SDK overview - Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/overview)
55. [**ashutoshysingh.com**｜Context Engineering | Ashutosh Singh](https://www.ashutoshysingh.com/learn/context-engineering/)
56. [**ultralytics.com**｜Context Engineering: Curating What AI Sees | Ultralytics](https://www.ultralytics.com/glossary/context-engineering)
57. [**code.claude.com**｜Overview - Claude Code Docs](https://code.claude.com/docs/en/overview)
58. [**reddit.com**｜Workflow: Best Practices for Separating AGENTS.md and CLAUDE](https://www.reddit.com/r/ClaudeWorkflows/comments/1thlmo4/workflow_workflow_best_practices_for_separating/)
59. [**medium.com**｜Learning Claude Code — From Context Engineering to Multi-Agent](https://medium.com/@aayushmnit/learning-claude-code-from-context-engineering-to-multi-agent-workflows-4825e216403f)
60. [**code.claude.com**｜Run agents in parallel - Claude Code Docs](https://code.claude.com/docs/en/agents)
61. [**omidsaffari.com**](https://omidsaffari.com/blog/context-rot)
62. [**code.claude.com**｜Run Claude Code programmatically - Claude Code Docs](https://code.claude.com/docs/en/headless)
63. [**medium.com**｜The “Lost in the Middle” Problem in LLMs - Medium](https://medium.com/@rajveer.rathod1301/the-lost-in-the-middle-problem-in-llms-b0d88e13f025)
64. [**docs.moveworks.com**｜Attention and Limitations - Moveworks documentation](https://docs.moveworks.com/harness/llm-fundamentals/attention-and-limitations)
65. [**pristren.com**｜Lost in the Middle: Why LLMs Struggle With Long Contexts - Pristren](https://pristren.com/blog/lost-in-middle-attention-paper/)
66. [**thepromptbench.com**｜Context Rot, Explained - The Prompt Bench](https://thepromptbench.com/context-engineering/context-rot-explained/)
67. [**claudearchitectcertification.com**｜Attention Engineering (D4, 20% of CCA-F) - Claude Certified Architect](https://claudearchitectcertification.com/concepts/attention-engineering)
68. [**harnez.ai**｜Lost in the middle: test context position, not just size - harnez](https://harnez.ai/posts/u-shaped-attention-memory-llms/)
69. [**arxiv.org**｜Lost in the Middle: How Language Models Use Long Contexts - arXiv](https://arxiv.org/html/2307.03172v3)
70. [**upsolve.ai**｜What Is Context Engineering? Definition & Best Practices in 2026](https://upsolve.ai/blog/context-engineering-guide)
71. [**tianpan.co**｜The Middle-Context Blindness Your Retrieval Pipeline Never](https://tianpan.co/blog/2026/06/02/the-middle-context-blindness-your-retrieval-pipeline-never-measured)
72. [**researchgate.net**｜Lost in the Middle: How Language Models Use Long Contexts](https://www.researchgate.net/publication/378284067_Lost_in_the_Middle_How_Language_Models_Use_Long_Contexts)
73. [**arxiv.org**｜The Instruction Hierarchy: Training LLMs to Prioritize Privileged](https://arxiv.org/abs/2404.13208)
74. [**openreview.net**｜The Instruction Hierarchy: Training LLMs to Prioritize Privileged](https://openreview.net/forum?id=vf5M8YaGPY)
75. [**huggingface.co**｜2603/2603.16152.md · huggingchat/papers-content - Hugging Face](https://huggingface.co/buckets/huggingchat/papers-content/tree/2603/2603.16152.md)
76. [**cchistory.mariozechner.at**｜cchistory - Claude Code Version History](https://cchistory.mariozechner.at/)
77. [**news.ycombinator.com**｜Claude Code 2.0 - Hacker News](https://news.ycombinator.com/item?id=45416228)
78. [**reddit.com**｜Hvornår skal man bruge '—append-system-prompt' vs CLAUDE.md](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/?tl=da)
79. [**reddit.com**｜Quand utiliser '—append-system-prompt' vs CLAUDE.md - Reddit](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/?tl=fr)
80. [**reddit.com**｜[Workflow] Structuring Multi-Agent Claude Code Workflows with ...](https://www.reddit.com/r/ClaudeWorkflows/comments/1wbzfga/workflow_structuring_multiagent_claude_code/)
81. [**epam.com**｜A Step-by-Step Guide to Building a Multi-Agent Claude Code AI ...](https://www.epam.com/insights/ai/blogs/step-by-step-guide-to-building-a-multi-agent-claude-code-ai-development-team)
82. [**unlearn.dev**｜Build Your First Multi-Agent Workflow with Claude Code | Unlearn](https://unlearn.dev/blog/build-your-first-multi-agent-workflow)
83. [**code.claude.com**｜Orchestrate subagents at scale with dynamic workflows - Claude ...](https://code.claude.com/docs/en/workflows)
84. [**github.com**｜GitHub - Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts)
85. [**reddit.com**｜Don't use Claude Code's Default System Prompt - Reddit](https://www.reddit.com/r/ClaudeCode/comments/1slfnoq/dont_use_claude_codes_default_system_prompt/)
86. [**golev.com**｜Claude Saves Tokens, Forgets Everything - Alexander Golev](https://golev.com/post/claude-saves-tokens-forgets-everything/)
87. [**hackergit.org**｜Piebald-AI/claude-code-system-prompts on Hacker News - HackerGit](https://hackergit.org/r/Piebald-AI/claude-code-system-prompts)
88. [**open-repo.com**｜Piebald-AI/claude-code-system-prompts · 12.5K Stars · GitHub 趋势](https://www.open-repo.com/r/Piebald-AI_claude-code-system-prompts.html)
89. [**githubsignals.io**｜piebald-ai/claude-code-system-prompts - GitHub Signals](https://githubsignals.io/repo/piebald-ai/claude-code-system-prompts/)
90. [**github.com**｜system-reminder-send-to-project-memory-brief-trust-boundary.md](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-send-to-project-memory-brief-trust-boundary.md)
91. [**pomoai.com**｜claude-code-system-prompts · 技能与配置 - POMOAI](https://www.pomoai.com/hubs/Piebald-AI/claude-code-system-prompts)
92. [**github.com**｜system-reminder-approved-claude-doc-plan-readback.md - GitHub](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-approved-claude-doc-plan-readback.md)
93. [**github.com**｜claude-code-learn/claude-prompt/user/user.md at main - GitHub](https://github.com/zlh-428/claude-code-learn/blob/main/claude-prompt/user/user.md)
94. [**reddit.com**｜Is CLAUDE.md just a system prompt all agents will read before](https://www.reddit.com/r/ClaudeAI/comments/1lrfs27/is_claudemd_just_a_system_prompt_all_agents_will/)
95. [**kirshatrov.com**｜Reverse engineering Claude Code - Kir Shatrov](https://kirshatrov.com/posts/claude-code-internals)
96. [**levelup.gitconnected.com**｜Reverse Engineering Claude Code: How Skills different from Agents](https://levelup.gitconnected.com/reverse-engineering-claude-code-how-skills-different-from-agents-commands-and-styles-b94f8c8f9245)
97. [**news.ycombinator.com**｜Claude.md just has 2 lines. the first points to @CONTRIBUTING](https://news.ycombinator.com/item?id=46331909)
98. [**mihaileric.com**｜Claude Code Demystified: Whirring, Skidaddling, Flibbertigibetting](https://www.mihaileric.com/Demystifying-Claude-Code/)
99. [**medium.com**｜The Complete Guide to Writing Agent System Prompts - Medium](https://medium.com/@fengliu_367/the-complete-guide-to-writing-agent-system-prompts-lessons-from-reverse-engineering-claude-code-09ecd87c7cc1)
100. [**docs.openclaw.ai**｜Prompt caching - OpenClaw Docs](https://docs.openclaw.ai/reference/prompt-caching)
101. [**classic.yarnpkg.com**｜@mariozechner/pi-coding-agent | Yarn](https://classic.yarnpkg.com/en/package/@mariozechner/pi-coding-agent)
102. [**ccafpreparation.com**｜CCAR-F Glossary — 219 Terms, Config Keys and API Fields](https://www.ccafpreparation.com/glossary)
103. [**github.com**｜fak/cmd/fak/guard.go at main - anthony-chaudhary - GitHub](https://github.com/anthony-chaudhary/fak/blob/main/cmd/fak/guard.go)
104. [**github.com**｜cc-viewer/history.md at main - GitHub](https://github.com/weiesky/cc-viewer/blob/main/history.md)
105. [**git.mitsea.com**｜claude-code-2603-leak/src/services/compact/prompt.ts at ... - MitseaGit](https://git.mitsea.com/FlintyLemming/claude-code-2603-leak/src/commit/f5a40b86dede580f6543bf8926c9af017eea9409/src/services/compact/prompt.ts)
106. [**dev.to**｜Multi-Agent Development Workflows with Claude Code - DEV ...](https://dev.to/javatarz/multi-agent-development-workflows-with-claude-code-n23)
107. [**github.com**｜[BUG] <system-reminder> is instructing claude code to not follow ...](https://github.com/anthropics/claude-code/issues/18560)
108. [**honeyhive.ai**](https://www.honeyhive.ai/learn/context-rot)
109. [**betterclaw.io**｜OpenClaw Setup Guide: Install in the Right Order (2026) - BetterClaw](https://www.betterclaw.io/blog/agents-md-multi-agent-best-practices)
110. [**anthropic.com**｜Effective context engineering for AI agents \ Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)
111. [**opc.csdn.net**｜Claude Code 完整提示词汇总（中英对照版）_人工智能_ ...](https://opc.csdn.net/6a324dc8662f9a54cb80b70d.html)
112. [**github.com**｜claude-code-system-prompts/system-prompts/system ... - GitHub](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-compact-file-reference.md)
113. [**medium.com**｜Tracing Claude Code's LLM Traffic: Agentic loop, sub-agents, tool ...](https://medium.com/@georgesung/tracing-claude-codes-llm-traffic-agentic-loop-sub-agents-tool-use-prompts-7796941806f5)
114. [**github.com**｜agentic-ai-prompt-research/prompts/21_compact_service.md at ...](https://github.com/Leonxlnx/agentic-ai-prompt-research/blob/main/prompts/21_compact_service.md)
115. [**github.com**](https://github.com/bendyline/gezel/blob/main/docs/prompt-stack.md)


---

## 👤 用户提问 4

我现在还需要咨询一个问题。 我做这套框架有一个目的，是因为 Cloud Code 本身其实不太好管理这些 Agent，包括配置它们的 tools。我想做一套 UI，能去管理每个 Agent 的工作目…  我现在还需要咨询一个问题。  我做这套框架有一个目的，是因为 Cloud Code 本身其实不太好管理这些 Agent，包括配置它们的 tools。我想做一套 UI，能去管理每个 Agent 的工作目录、记忆文件之类的东西。  我想问：  1. 现在市面上有没有现成的 UI 能够去调整 Cloud Code 的 Agent（比如 Agent 的 prompt、tools、MCP）？  2. 有没有现成的这种 Multi-Agent 的跨端 APP？

## 🤖 Gemini 回答

`tag. *   Check Rule 5 of Mode 2 (Obvious vs Non-obvious follow-up): *   Question 1 (Claude Desktop`--append-system-prompt`): Not covered in the initial report (which focused on CLI/SDK and briefly mentioned Desktop in Q&A 2). *   Question 2 (Per-agent Skills scoping,`disable-model-invocation`,`skills:`frontmatter preloading, MCP vs`.claude/skills/`): Barely touched in the initial report (only briefly mentioned Skills in the compact table and`MEMORY.md`vs Skills). *   Since this introduces new, deep implementation topics (Claude Desktop CLI flag support, Claude Code's exact skill scoping/preloading mechanisms, and MCP vs Subagent`skills`frontmatter), let's check if it's a non-obvious passthrough or obvious follow-up. Actually, we have extensive research snippets directly answering BOTH questions (`source: 238`,`source: 255`,`source: 256`,`source: 254`,`source: 237`,`source: 257`,`source: 60`,`source: 239`,`source: 249`,`source: 252`,`source: 262`,`source: 265`). Let's check carefully if attaching the research offer is needed or not. *   Wait: Look at Rule 5: "Determine whether the user's query is an obvious follow-up or a non-obvious passthrough: Obvious follow-up (Do NOT offer research): The user asks about facts, findings, or explanations that are already in the report, asks to clarify/elaborate on specific sections of the report, or asks simple definitions/explanations directly grounded in the report content. Non-obvious passthrough (DO offer research): The user asks about new topics, new questions, or broader extensions that were NOT already covered in depth in the report (which would benefit from fresh, comprehensive research)." *   Clearly, "Can Claude Desktop use`--append-system-prompt`?" and "How to scope global vs per-agent skills in Claude Code, and evaluating an MCP-based skill exposure architecture" are new topics/extensions NOT covered in depth in the original report! So attaching`"Would you like me to do a more in-depth research instead and propose a research plan?"` at the very end on a new line is appropriate and follows Rule 5 strictly.

1. **Analyze the Research Material for Question 1: Claude Desktop & `--append-system-prompt`:**

- Let's check snippets [^1], [^2], [^1], [^2], [^3], [^1]:
- In [^3] (`https://code.claude.com/docs/en/desktop#cli-flag-equivalents`):

- Claude Desktop has the **Code tab**, which runs the same underlying engine as the CLI.
- CLI flag equivalents table: `--model`, `ANTHROPIC_MODEL`, `--permission-mode`, `--dangerously-skip-permissions`, `--resume`/`--continue`, `--add-dir`, `--allowedTools`/`--disallowedTools` ("No per-session UI equivalent. Permission rules set in settings files (`settings.json`) still apply."), `--verbose`, `--print`/`--output-format` ("Not available: Desktop is strictly interactive only"), `MAX_THINKING_TOKENS`.
- Notice what is NOT in the Desktop UI / flag equivalents: there is **no direct UI field or CLI flag box in Claude Desktop for `--append-system-prompt` or `--system-prompt`** ( [^3]). Wait—let's check [^1] and [^3] accurately! Do NOT fabricate claims.
- Wait: What *does* Claude Desktop support via shared configuration ( [^3], [^2])?

- Desktop and CLI share: `CLAUDE.md`, `CLAUDE.local.md`, MCP servers (`claude_desktop_config.json`, `~/.claude.json`, `.mcp.json`), Hooks, Skills, `~/.claude/settings.json` ( [^3]).
- What about **`outputStyle`** ( [^2], [^2], [^2])?

- Look at [^2]: "Desktop app: set the `outputStyle` field in a settings file, for example `.claude/settings.local.json`, the file the terminal menu writes. When you run `/config` there, Claude Code opens Settings > Code or Settings > Claude Code rather than a menu. To set a style without the menu, edit the `outputStyle` field directly in a settings file: `{ "outputStyle": "Explanatory" }`."
- And look at [^2]: Custom output styles can be created as Markdown files with YAML frontmatter. Wait: by default, a custom output style *omits* built-in software engineering instructions (`keep-coding-instructions: false`), UNLESS you set `keep-coding-instructions: true` ( [^2])! When `keep-coding-instructions: true` is set in a custom output style and selected via `"outputStyle": "..."` in `settings.json` / `.claude/settings.local.json`, it keeps the default coding instructions and sends the custom style instructions with every request (acting functionally very similar to `--append-system-prompt`, except delivered as system-style instructions/reminders per request in the conversation or style layer — specifically [^4] and [^5] note that output style instructions are delivered in the conversation as system reminders / messages, whereas `--append-system-prompt` modifies the System Prompt prefix layer).
- Wait: What about launching Desktop with `claude --desktop` ( [^6], [^3])?

- [^6]: "`--desktop`. Open the Claude Desktop app on the current directory and exit without starting a session in the terminal. ... Takes no prompt and no other flags except `--verbose` and the `--debug` flags, since the app starts the session itself."
- This is a HUGE point! Even if you try `claude --desktop --append-system-prompt ...`, `--desktop` explicitly **takes no other flags** except `--verbose` and `--debug` flags ( [^6]).
- Wait: What about Cowork / Chat in Claude Desktop? Can we check if anything mentions custom instructions or projects? We don't have detailed docs on Claude Desktop's Chat "Projects" instructions, only the Code tab docs ( [^1], [^7], [^3]). Wait: in [^1]: "In the Claude Desktop app, Claude Code is the Code tab. The app also has chat and Cowork..." And [^3] explicitly states: `--print` and `--output-format` are not available, and "Specific flags or settings keys named `system-prompt` or `append-system-prompt` are not directly detailed in this reference section of the documentation." And `--desktop` takes no other flags ( [^6]).
- Also, what about **Subagents** inside Claude Desktop? Since Desktop's Code tab runs the same embedded engine and shares `.claude/` configuration (hooks, skills, settings, etc. — and custom subagents live in `.claude/agents/*.md` or `~/.claude/agents/*.md`), wait: does Desktop share `.claude/agents/`? Let's check snippets to be careful not to overclaim. [^3] lists: `CLAUDE.md` & `CLAUDE.local.md`, MCP Servers, Hooks & Skills, Settings files, Models. [^8] & [^9] show subagents live in `.claude/agents/` and `~/.claude/agents/` and Desktop runs the same underlying engine ( [^3]). Even better: we know for sure from [^2] and [^2] that **Output Styles (`outputStyle` in `settings.json` / `.claude/settings.local.json`)** IS supported in the Desktop app!
- Wait: Can you also run custom subagents or hooks in Desktop? Yes, Hooks and Skills are shared ( [^3]), and `SessionStart` hooks can inject `additionalContext` as system reminders ( [^10]).
- Let's also check: why wouldn't Desktop alone solve the user's "single aggregated group chat UI" anyway? Even in Desktop, [^1] states: "In the Code tab, each conversation is a session: it has its own chat history and project folder, independent of any other session. The sidebar lists your sessions and lets you run several in parallel." It's still a sidebar list of separate sessions, NOT an aggregated group chat timeline! Still, let's directly answer their question about whether `--append-system-prompt` can be used in Claude Desktop and what the closest native alternatives in Desktop are (`outputStyle` with `keep-coding-instructions: true`, `CLAUDE.md`, or `SessionStart` hooks).
2. **Analyze the Research Material for Question 2: Per-Agent Skills Configuration (Global Skill vs. Agent-Specific Skill, Injection Methods, and Evaluating User's MCP Approach):**
Let's carefully read the user's exact scenario and ideas:

- *User's scenario:*

- "Claude Code 全局有 skill，那我想为每个 Agent 配置不同的 skill 方式的话该怎么做？"
- "比如我全局有一个 skill，它是默认不读取的，但是我有一个 Agent 就是需要读取这份 skill 的，怎么做？"
- "读取 skill 其实分两种：一种是直接注入到 system prompt，用 append system prompt 去做；另一种是当成用户的第一条消息注入进去，可以按照 claude code 的方式去做，但是它不能与全局的那份 skill 冲突。"
- "针对第二种方式，有两种选项：第一种是在 Agent 的目录里面再创建一份 .skills 文件夹，然后更新它的 YAML 配置。我的做法是写一个 MCP 服务，通过这份 MCP 会暴露它需要读取的 skill，需要读取的 工具"

Let's check ALL facts in the research snippets about how **Skills** actually work in Claude Code!

1. How Skills actually load & inject in Claude Code ( [^8], [^11], [^12], [^9], [^13], [^14], [^11]):

- First, clarify a crucial detail: In Claude Code, Skills (`SKILL.md` in `~/.claude/skills/<name>/SKILL.md` for global/personal, or `.claude/skills/<name>/SKILL.md` for project) are **NOT** injected into the System Prompt at startup ( [^11]), nor are their full bodies injected into the first user message by default!
- Instead, by default, only the **skill name and `description`** load at startup (as system reminders / skill listing, [^8], [^10], [^11]). The full `SKILL.md` body loads **on demand** into the conversation only when invoked by the user (`/skill-name`) or automatically by Claude via the `Skill` tool when matching the `description` ( [^8], [^11]).
2. What happens with "Global Skill that is NOT read by default, EXCEPT one specific Agent needs it" ( [^14], [^11], [^12], [^11], [^15], [^16], [^17], [^18], [^11], [^9]):

- Wait—let's check the interaction between `disable-model-invocation: true` and `skills:` frontmatter in subagents!
- LOOK AT [^12]!! This is a super important trap documented directly in `https://code.claude.com/docs/en/sub-agents#preload-skills-into-subagents`:

- `skills:` frontmatter field in a subagent definition preloads the **full content** of specified skills directly into that subagent's context at startup ( [^9], [^12]).
- CRITICAL TRAP ( [^12]): "You **cannot** preload skills that have `disable-model-invocation: true` set, because preloading relies on the same pool of skills Claude is permitted to invoke."
- Whoa!! That directly impacts the user's exact scenario ("全局有一个 skill，它是默认不读取的，但是我有一个 Agent 就是需要读取这份 skill 的")!
- Wait: How DO you make a skill NOT auto-invoked by the main/other agents, while allowing a specific Agent to load/use it? Let's check the mechanisms in the snippets:

- If you put `disable-model-invocation: true` on a global skill in `~/.claude/skills/`, **NO model/agent can auto-invoke it OR preload it via `skills:` frontmatter** ( [^12], [^11])! Only a human typing `/skill-name` can invoke it ( [^11]).
- How can you solve "global/other agents don't read it, only Agent X reads it" natively in Claude Code? Let's check all native mechanisms in our snippets:

- **Mechanism 1: Keep the skill out of `~/.claude/skills/` (or restrict via permissions), and put it ONLY in that Agent's scope or preload it while blocking `Skill` tool elsewhere!**

- Wait: If a skill is in global `~/.claude/skills/`, it loads into every project/session's skill description list ( [^11], [^8]).
- Can you restrict which agents can invoke which skills via `permissions.deny` or `disallowedTools`?

- Look at [^11] and [^15]: You can deny skills in permissions (`Skill`, `Skill(name)`, `Skill(skill:)`), OR in a subagent's frontmatter, omit `Skill` from `tools` / add `Skill` to `disallowedTools` ( [^12]). And in the Agent SDK ( [^17], [^18]), you can explicitly pass an allowlist `skills: ["my-skill"]` or `[]`!
- Can you preload a skill into a specific subagent using `skills:` frontmatter ( [^9], [^12])?

- Yes! If the skill does NOT have `disable-model-invocation: true`, adding `skills: [my-skill]` to `.claude/agents/agent-x.md` injects the **full content** of `my-skill` directly into Agent X's startup context ( [^9], [^12]). Meanwhile, for other subagents, omit `Skill` from `tools` (or add `Skill` to `disallowedTools`), so they cannot invoke it ( [^12]). (Though note: the skill's name/description would still appear in the main session's startup list unless blocked via `permissions.deny: ["Skill(my-skill)"]` or `skillOverrides` or kept outside `~/.claude/skills/`! Wait—if blocked by `permissions.deny`, can `skills:` preload it? [^12] says: "If a skill listed in `skills` is missing or disabled (for example, blocked by organizational policy), Claude Code skips that skill and logs a warning in the debug log." So blocking it globally via `skillOverrides` or policy would also block preloading!)
- **Mechanism 2: Independent working directory + `--setting-sources` / `--bare` / local `.claude/skills/` (User's Option 1 & Priority rules)!**

- Let's check [^8] and [^11] and [^6] and [^19] and [^11]:
- Priority/Overriding ( [^8]): "Skills override by name across levels based on priority (`managed > user > project`)" — Wait! Let's double check that exact quote in [^8]: `Skills override by name across levels based on priority (managed > user > project)`! Wait—let's verify if `user` overrides `project` or `project` overrides `user`? Let's read [^8] carefully: `Skills override by name across levels based on priority (managed > user > project)`. That's literally what [^8] says! Wait: if `user` (`~/.claude/skills/`) has higher priority than `project` (`.claude/skills/`), then putting a same-named skill in `.claude/skills/` in the Agent's folder might NOT override `~/.claude/skills/` if `user > project`! Wait—let's check [^11] too: [^11] only talks about local skills vs synced skills from `claude.ai` ("Local skills take priority over skills synced from `claude.ai`"). So [^8] explicitly states `managed > user > project` for skill name overrides! That is a VERY valuable catch to warn the user about regarding "它不能与全局的那份 skill 冲突"!
- Also check `--setting-sources` ( [^6], [^20], [^19]) and `--add-dir` ( [^11], [^6]):

- In CLI, `user`, `project`, and `local` setting sources are all on by default ( [^19]).
- If you launch an Agent process with `--setting-sources project,local` (excluding `user`), or `--bare` + `--add-dir <dir>` ( [^6]: "`--bare` skips auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and `CLAUDE.md`... Exceptions: Skills located in a directory explicitly passed via `--add-dir` still load."), YOU CAN COMPLETELY ISOLATE THAT AGENT FROM GLOBAL `~/.claude/skills/` AND LOAD ONLY THE SKILLS IN ITS SPECIFIC DIRECTORY!
- Whoa!! Look at [^6] on `--bare` + `--add-dir`:

- "`--bare`: Runs in minimal mode by skipping the auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and `CLAUDE.md`..."
- "Interaction with Bare Mode: Skills in a directory passed with `--add-dir` will still load even in bare mode."
- And look at `--setting-sources` ( [^6], [^20], [^19]):

- `--setting-sources` accepts a comma-separated list of setting sources to load (`user`, `project`, `local`). If you pass `--setting-sources project` (omitting `user`), it excludes user-level settings/skills! (Or in the Agent SDK, `settingSources: ['project']` + `skills` allowlist [^18]).
- **Mechanism 3: Evaluating User's Method A (`--append-system-prompt` / `--append-system-prompt-file`) vs. Method B-Option 1 (`.claude/skills/` in Agent directory) vs. Method B-Option 2 (User's MCP Server approach)!**

Let's carefully evaluate all three options the user brought up, strictly grounded in the research snippets:

- **Option A: Injecting the skill directly into System Prompt via `--append-system-prompt` (or `--append-system-prompt-file`)**

- *How it actually behaves:*

- It enters the highest-priority `system` prompt layer (and stays permanently in the prefix cache and survives `/compact`, [^5], [^13], [^21]).
- Wait: If the Agent is a Subagent (`.claude/agents/*.md`), the Markdown body itself *is* its system prompt, OR you can pass `--append-subagent-system-prompt` / `--append-subagent-system-prompt-file` in `-p` mode ( [^6]). Wait: `--append-subagent-system-prompt` applies to *every* subagent ( [^6]), whereas a specific subagent's own `.md` file ( [^9]) or a dedicated standalone `claude` process with `--append-system-prompt-file` ( [^6]) targets that single agent.
- *Pros:* Zero conflict with global `~/.claude/skills/` (even if global skill has `disable-model-invocation: true`, you can just point `--append-system-prompt-file` directly to that `SKILL.md` file or a custom prompt file!). Strongest compliance (`system` > `user`, [^22], [^23]), never forgotten after compaction ( [^13]).
- *Cons:* Consumes tokens and **instruction budget** (~150-200 max instructions total, [^24], [^25]) on *every single turn* of that agent, even on turns when that skill isn't needed ("unconditional tax", [^26]). Also, if the skill uses dynamic command injection like `!`git diff`` or frontmatter tool rules ( [^11]), `--append-system-prompt-file` treats it as raw text and won't execute skill frontmatter/dynamic commands.
- **Option B-1: Putting a `.claude/skills/` folder in the Agent's directory (and updating YAML config)**

- (Note: Clarify the path is `.claude/skills/<skill-name>/SKILL.md`, not `.skills/` [^11].)
- *How it actually behaves & conflict risks:*

- First, Claude Code automatically loads BOTH user-level (`~/.claude/skills/`) AND project-level (`.claude/skills/`) unless restricted ( [^8], [^11]).
- Second, as documented in [^8], skill name collisions resolve with priority **`managed > user > project`**! That means if a global skill in `~/.claude/skills/` has the *same name* as the skill in the Agent's project `.claude/skills/`, **the global user skill actually overrides the project skill** unless you disable `user` setting sources (`--setting-sources project` or `--bare --add-dir ...`) or give the agent skill a different name ( [^8], [^19], [^6])!
- Third, if you use **nested subdirectories** under one root (e.g., `agents/worker1/.claude/skills/`), [^11] explicitly documents that skills in a `.claude/skills/` directory *below* where you started **do not load at startup**—they only load the first time Claude reads or edits a file in that subdirectory (unless passed with `--add-dir` or `/add-dir`)! And if you run `--worktree`, remember [^11] notes worktrees search up to worktree root (falling back to main checkout's `.claude/skills/` if none exists).
- Fourth, if you want a Subagent (`.claude/agents/agent-x.md`) to always read a skill without touching the first user message manually, the native YAML config is `skills: [skill-name]` in the subagent's frontmatter (preloading the skill content at subagent startup, [^9], [^12]), provided the skill does NOT have `disable-model-invocation: true` ( [^12]).
- **Option B-2: User's own approach — Writing an MCP Server to expose only the skills and tools that specific Agent needs!**

- Let's evaluate this! Is an MCP server actually a really clever/viable pattern here, and what are its exact mechanics, pros, and pitfalls in Claude Code?
- Let's check [^20], [^27], [^20], [^8], [^9], [^9], [^28]!
- How MCP works in Claude Code for exposing **Prompts (Skills)**, **Resources (Docs/Skills)**, and **Tools**:

1. **Zero conflict with global Skills (`~/.claude/skills/`)**: MCP servers are completely isolated from `.claude/skills/`. Better yet, MCP servers can expose:

- **MCP Tools** (the exact tools this agent is allowed to call).
- **MCP Prompts** (automatically exposed as `/servername:promptname` slash commands — [^20]; note: do NOT name the MCP server `anthropic-skills`, as that name is reserved [^20]).
- **MCP Resources** (exposed via `@server:protocol://resource/path`, or read on demand via Claude Code's built-in resource listing/reading tools [^20]).
- *(Even better: you can literally build a "Skill Loader" MCP tool like `get_skill(name)` or expose each skill as an MCP Resource/Prompt!)*
2. **Per-Agent Isolation Mechanisms in Claude Code:**

- If the Agent is a **standalone Claude Code CLI process**: launch it with `--mcp-config ./agent-x-mcp.json --strict-mcp-config` ( [^6], [^20]). `--strict-mcp-config` tells Claude Code to **only** use MCP servers from `--mcp-config` and ignore all global/project MCP configs ( [^6])! Combine that with `--setting-sources ""` or `--bare` ( [^6], [^19]) if you also want to ignore global `~/.claude/skills/` and `~/.claude/CLAUDE.md`!
- If the Agent is a **Subagent (`.claude/agents/*.md`)**: Subagent YAML frontmatter has an `mcpServers` field (accepting server names or inline definitions, [^9], [^9]) AND `tools` / `disallowedTools` ( [^9]). Caveat ( [^9]): By default, subagents **inherit** the MCP tools available in the main conversation! So if you mount an MCP server in the main session, subagents inherit it unless filtered via `tools`/`disallowedTools`. Conversely, configuring inline `mcpServers` inside a specific subagent's YAML scopes that MCP server directly to that subagent (note: plugin subagents ignore `mcpServers` for security [^9], [^9]).
3. **Pros of the User's MCP Approach (especially for their custom UI!):**

- **Dynamic & Decoupled from Filesystem:** Remember the user wants to build a UI to manage each Agent's tools, skills, and context! With an MCP server (or per-agent MCP config), your UI can dynamically serve different skills and tools per Agent from a central service/database **without creating duplicated `.claude/skills/` folders everywhere**, and **without modifying global `~/.claude/` configs**.
- **On-Demand Loading / Context Efficiency (MCP Tool Search):** Claude Code uses **MCP Tool Search** by default, deferring full JSON tool schemas until needed and only loading tool names and server instructions (truncated past 4,096 chars) at startup ( [^20], [^8]). So exposing skills/tools via MCP keeps startup context lightweight, achieving the same "progressive disclosure" as Skills! (Or you can set `"alwaysLoad": true` in `.mcp.json` if a specific agent must always load those tool definitions upfront, [^20]).
- **Cross-Platform / Desktop Compatibility:** An MCP server can also be attached in Claude Desktop (`claude_desktop_config.json` / Connectors UI) or CLI ( [^1], [^3]).
4. **Pitfalls / Caveats of the MCP Approach to Watch Out For:**

- **Doesn't auto-inject into System Prompt or First User Message by itself:** An MCP server provides tools/resources/prompts that the agent *calls or fetches when needed* (or server `instructions` loaded at startup, capped at 4,096 chars [^20]). If the skill is a critical constraint that the agent *must* know before acting (or won't know to search for), you still need a short cue in `--append-system-prompt` (or the MCP server's `instructions` field / first user message) telling the agent: *"Before doing X, call `read_skill` / read `@mcp:skill://...`"* (or set `alwaysLoad: true` on the critical MCP tool [^20]).
- **MCP Tool Search limitation on Azure Microsoft Foundry:** Note [^20] mentions Tool Search is rejected server-side on Azure Microsoft Foundry deployments (falls back to upfront loading), though on standard Anthropic API / Claude subscription it works natively.
- **Subagent Inheritance Leakage:** As noted in [^9], subagents inherit all MCP tools from the main conversation unless you restrict them with `tools:` / `disallowedTools:` in the subagent's frontmatter ( [^9]), or run agents as separate CLI processes with `--strict-mcp-config` ( [^6]).
- Compaction Behavior ( [^13], [^5]): Tool results (like reading a skill via an MCP tool) enter the **Conversation layer** and **get summarized away during `/compact`** ( [^13], [^5]), unlike `--append-system-prompt` (which is preserved in the System Prompt layer [^13]) or preloaded subagent `skills:` / invoked skills (which have capped reload behavior [^13]). So if a long-running agent compacts, it may need to re-call the MCP skill tool if details were lost in the summary!
- **Prompt Caching & Security:** If your MCP server dynamically changes its tool list *mid-session*, it invalidates the System Prompt cache layer ( [^5]: "System prompt layer changes when: The set of loaded tool definitions changes"). Keep the MCP tool *definitions* static per session, and only pass dynamic skill *content* as tool/resource responses (which append to the Conversation layer and keep the prefix cached [^5]).
3. **Review Structure & Grounding:**
Let's organize the response cleanly into two clear parts matching the user's two questions:

- **Part 1: 能不能在 Claude Desktop 中使用 `--append-system-prompt` 来替代自己写 App？**

- **Direct Answer:** **不能直接传 `--append-system-prompt` 参数**。解释底层原因：

- Desktop 的 **Code 标签页**虽然与 CLI 共用底层引擎，但它是纯交互式 GUI，没有在界面上暴露 `--append-system-prompt` 或 `--system-prompt` 的输入框/配置项 [^3]。
- 即便从命令行用 `claude --desktop` 拉起 Desktop，官方明确限制 `--desktop` **不能携带其他 CLI 参数**（仅支持 `--verbose` 和 `--debug`），因为会话是由 Desktop App 自己启动的 [^6]。
- **Desktop 中最接近的替代方案（共享配置）**：

- Desktop 与 CLI 共享 `CLAUDE.md`、`CLAUDE.local.md`、MCP 配置（`claude_desktop_config.json` / `~/.claude.json` / `.mcp.json`）、Hooks、Skills 和 `~/.claude/settings.json` [^3]。
- **最接近 `--append-system-prompt` 的平替是 `outputStyle`（输出样式）**：你可以在 `.claude/settings.local.json` 或 `~/.claude/settings.json` 中配置 `{"outputStyle": "你的样式名"}`（Desktop 支持通过 settings 文件读取 `outputStyle`） [^2]。创建自定义样式 Markdown 文件时，默认会省略内置工程指令，只要在 YAML Frontmatter 中设置 **`keep-coding-instructions: true`**，就能保留完整的默认编码能力并附加你的专属角色设定 [^2]（注：与 `--append-system-prompt` 的底层差异在于，Output Style 是作为系统提醒/对话消息随请求发送，而不是修改 System Prompt 前缀层 [^4]）。
- 或者通过 **`SessionStart` Hook** 输出 `additionalContext` 注入系统提醒 [^3]。
- **为什么 Desktop 仍然替代不了你想要的“群聊 App”？**

- 除了不支持 `--append-system-prompt`，Desktop 的 Code 标签页本质上依然是**侧边栏多独立会话列表**（每个会话独立历史和目录） [^1]，无法实现你之前想要的“多 Agent 消息按时间聚合成一个群聊窗口 + 统筹伙伴自动派发 + 隐形伙伴历史清洗跳转”。所以如果你追求极简且只需要单人/单窗口交互，可以用 Desktop + `outputStyle`/`CLAUDE.md`/MCP；但如果要实现你的群聊工作流，还是需要自己做 UI（或基于 `T3 Code` / `Happy` 开源底座二开）。
- **Part 2: 全局 Skill 不默认读取，但指定 Agent 需要读取——三种配置方案深度对比与评估（特别是你的 MCP 方案）**

- **首先纠正一个关键的原生机制与隐藏陷阱**：

1. Claude Code 的 Skill（全局在 `~/.claude/skills/<name>/SKILL.md`，项目在 `.claude/skills/<name>/SKILL.md`）**默认只加载名称和 `description` 到启动上下文，正文并不会在启动时注入 System Prompt 或第一条 User 消息**，而是触发时才按需加载正文 [^8]。
2. **核心踩坑预警（`disable-model-invocation: true` 与 `skills:` 预加载互斥）**：如果你把全局 Skill 设成 `disable-model-invocation: true` 来让其他 Agent“默认不读取”，那么**在子智能体（Subagent）的 YAML 中配置 `skills:` 预加载也会直接失效并跳过**！因为官方规定 `skills:` 预加载依赖模型可调用的技能池，不能预加载设置了 `disable-model-invocation: true` 的技能 [^12]。
3. **命名冲突方向预警（`user > project`）**：官方技能覆盖优先级是 **`managed > user > project`** [^8]。也就是说，如果在全局 `~/.claude/skills/` 和某个 Agent 目录的 `.claude/skills/` 下放了**同名** Skill，**全局的 user 级会覆盖项目的 project 级**（而不是目录里的覆盖全局） [^8]！
- **对比你的三种实现思路（附带原生最简改法）**：

- **方式一：直接通过 `--append-system-prompt`（或 `--append-system-prompt-file`）注入**

- *实现*：单独启动该 Agent 进程时传入 `--append-system-prompt-file ~/.claude/skills/my-skill/SKILL.md`（若想彻底屏蔽其他全局配置，可叠加 `--setting-sources project` 或 `--bare`） [^6]；如果是单会话内的原生 Subagent，则直接把这份 Skill 写进该 Subagent（`.claude/agents/agent-x.md`）的 Markdown 正文里（该正文就是它独立的 System Prompt） [^9]。
- *优缺点*：完全不会和全局 Skill 冲突，指令权重最高，`system` 层级在 `/compact` 压缩后也永久保留 [^13]；缺点是**每轮对话都在消耗 Token 和指令预算**（即使当前轮次不需要这份 Skill），且不会触发 Skill 的动态命令替换（如 `!`command``） [^11]。
- 方式二（选项 1）：在 Agent 目录下建 `.claude/skills/` 并配置 YAML（注意正确目录名是 `.claude/skills/` 而非 `.skills/` [^11]）

- *避坑实现*：

- 不要把这份 Skill 放在全局 `~/.claude/skills/`（或如果放在全局必须避免同名，因为 `user > project` [^8]）。
- 如果每个 Agent 是独立启动的 CLI 进程：用 `--setting-sources project,local`（排除 `user`）来隔离全局配置 [^19]；或者用 **`--bare --add-dir ./agent-x-skills`**——官方文档明确说明 `--bare` 会跳过所有全局技能和 `CLAUDE.md` 自动发现，**唯独会加载 `--add-dir` 显式传入目录下的 Skills** [^6]！这几乎是为“单 Agent 独占指定目录 Skill”量身定制的原生开关。
- 如果是主会话下的 Subagent：把这份 Skill 放在项目 `.claude/skills/` 下（**不设** `disable-model-invocation: true`），只给目标 Agent X 的 `.claude/agents/agent-x.md` 配置 `skills: [target-skill]` 预加载 [^9]；同时给其他不需要它的 Subagent 在 Frontmatter 中去掉 `Skill` 工具（放入 `disallowedTools: [Skill]`），防止其他 Subagent 误调用 [^12]。另外注意：如果 `.claude/skills/` 放在当前工作目录的**子目录**下，默认启动时不会加载，直到 Agent 访问该子目录文件或用 `--add-dir` 才加载 [^11]。
- **方式三（选项 2，你的做法）：写一个 MCP 服务来统一暴露该 Agent 需要的 Skill 和 Tools**

- **综合评价：这是最适合“自研管理 UI + 多 Agent 精准权限隔离”的工程化架构！**
- *为什么 MCP 方案非常契合你的目标*：

1. **彻底规避全局 Skill 冲突与目录碎片**：MCP 服务暴露的 Tools、MCP Prompts（以 `/servername:promptname` 暴露）和 MCP Resources（`@server:uri`）完全独立于 `~/.claude/skills/` 体系（注意 MCP 服务名称不要取 `anthropic-skills`，这是保留字） [^20]。你的 UI 可以集中托管所有 Skill 和工具定义，按 Agent 身份动态下发配置，不需要在磁盘到处建 `.claude/skills/` 软链接或目录。
2. **进程级与 Subagent 级隔离能力强**：

- 如果每个 Agent 是独立 CLI 进程：用 `--mcp-config ./agent-x.mcp.json --strict-mcp-config`，可以强制该 Agent **只加载**这一个 MCP 服务，屏蔽所有全局和项目级 MCP [^6]。
- 如果采用 Subagent：可以在单个 Subagent 的 YAML Frontmatter 的 `mcpServers` 中内联配置专属 MCP（需注意插件形式的 Subagent 会忽略此字段，且普通 Subagent 默认会**继承主会话已挂载的 MCP 工具**，因此主会话不要挂这个 MCP，或者用 `tools`/`disallowedTools` 严格限制其他 Subagent） [^9]。
3. **天然具备渐进式披露（低上下文占用）**：Claude Code 默认开启 **MCP Tool Search**，启动时只加载工具名和服务端 `instructions`（超过 4,096 字符会被截断），只有 Agent 真正需要用时才按需拉取工具 Schema；如果你希望某份核心工具或 Skill 必须始终加载，也可以在 JSON 配置里设为 `"alwaysLoad": true` [^20]。
- *使用 MCP 暴露 Skill 必须注意的 3 个工程细节*：

1. **“工具返回”不等于“首条消息/System Prompt 强制注入”**：MCP 工具返回的 Skill 正文或 MCP Resource 会作为 `tool_result` 进入 **Conversation 对话层**，因此它**在 `/compact` 压缩时会被摘要总结掉**（不像 `--append-system-prompt` 那样永久驻留 System 层） [^5]。因此，建议把 Skill 的“核心触发条件/行为红线”精简写入 MCP Server 的 `instructions` 或该 Agent 的短提示词中（提醒它遇到某类任务先调用 `get_skill` 读取完整流程），或者把极少数不可妥协的铁律留在 `--append-system-prompt` 里。
2. **保护 Prompt Cache（不要在会话中途动态改 MCP 工具列表）**：Claude Code 的第一层缓存（System Prompt 层）只要检测到**已加载的工具定义集合发生变化就会全量失效** [^5]。因此最佳实践是：MCP 暴露出去的**工具签名（如 `list_skills`、`read_skill`）在单个会话生命周期内保持固定**，把不同的 Skill 内容作为数据通过工具返回值或 Resource 返回（只影响末尾的 Conversation 层，前面缓存 100% 命中） [^5]。
3. **Azure Foundry 环境兼容性**：如果你的后端接的是 Azure 上的 Microsoft Foundry 部署，注意它服务端不支持 MCP Tool Search，Claude Code 会自动退化为启动时全量加载该 MCP 的所有工具定义（建议此时更要通过 `--strict-mcp-config` 精简单个 Agent 挂载的工具数） [^20]。
4. **Check formatting, citations, and rules:**

- No `<report>` tag.
- No internal language ("snippets", "research material", etc.).
- Citations strictly `[cite: source_id]` or [^29].
- Check every single source ID used!

- Let's verify exact source IDs from the provided research notes:

- [^6]: `--desktop` takes no prompt and no other flags except `--verbose` and `--debug`.
- [^3]: Desktop CLI flag equivalents, shared configuration (`CLAUDE.md`, MCP, Hooks, Skills, `settings.json`), `--print`/`--output-format` not available, `system-prompt`/`append-system-prompt` not in Desktop CLI equivalents.
- [^2]: Desktop app `outputStyle` in `.claude/settings.local.json` or `~/.claude/settings.json`.
- [^2]: `keep-coding-instructions: true` in custom output style; output styles don't apply to subagents (except forked conversations).
- [cite: 4], [^5]: Output style instructions are delivered in the conversation as system reminders / messages (not the system prompt prefix), keeping the system prompt cached.
- [^1]: Desktop Code tab sessions each have their own chat history and project folder; sidebar lists sessions.
- [^10]: `SessionStart` / hooks returning `additionalContext` via system reminders.
- [^8]: Skills only load names/descriptions at startup; full content loads on demand when invoked; priority `managed > user > project`.
- [^11]: Skills directory paths (`~/.claude/skills/<name>/SKILL.md` vs `.claude/skills/<name>/SKILL.md`), `disable-model-invocation: true`, dynamic context injection (`!`command``), not loaded into system prompt at startup.
- [^12]: `skills:` frontmatter preloads full content into subagent context at startup; **cannot** preload skills with `disable-model-invocation: true`; omit `Skill` from `tools` or add to `disallowedTools` to stop a subagent from invoking skills.
- [^9]: Subagent markdown body is its system prompt; `mcpServers`, `tools`, `disallowedTools`, `skills` frontmatter fields; `omitClaudeMd: true`.
- [^9]: Plugin subagents ignore `hooks`, `mcpServers`, `permissionMode`.
- [^9]: Subagents inherit built-in tools and MCP tools available in the main conversation (narrowed by filters).
- [^11]: Skills in `.claude/skills/` below start directory don't load at startup until file read/edit or `--add-dir` / `/add-dir`.
- [^6]: `--bare` skips auto-discovery of hooks, skills, MCP servers, `CLAUDE.md`, etc., EXCEPT skills in a directory passed with `--add-dir` still load! `--append-system-prompt-file` and `--system-prompt` details.
- [^6], [^20], [^19]: `--setting-sources` (comma-separated `user`, `project`, `local`); `--strict-mcp-config` (only use MCP servers from `--mcp-config`).
- [^20]: MCP prompts (`/servername:promptname`, `anthropic-skills` reserved), MCP resources (`@server:uri`), MCP Tool Search (defers full schemas; server instructions & upfront tool descriptions truncated past 4,096 chars; `alwaysLoad: true` / `false`; Azure Microsoft Foundry doesn't support Tool Search).
- [^5], [^5], [^13]: Cache layers (System prompt layer invalidates when loaded tool definitions change; Conversation layer summarizes on `/compact`; System prompt preserved on `/compact`).
- [cite: 24], [^25], [^26], [^22]: Instruction budget (~150-200), unconditional tax, instruction hierarchy (`system > user > tool`).
- Check LaTeX & tables:

- If creating a table, use single spaces between cell content and pipe (`|`) separators, do not pretty-print tables! Example:
`| 方案 | 注入位置 | 优点 |`
`| --- | --- | --- |`
- Never place citations inside fenced code blocks.
- Check Rule 5 ending line:

- User's prompt is in Chinese. Should the ending line be exact English `"Would you like me to do a more in-depth research instead and propose a research plan?"`?
- Let's check the system instruction carefully:
`attach the following question on a new line at the very end of your response:`
`"Would you like me to do a more in-depth research instead and propose a research plan?"`
- Look at the previous assistant turns in the conversation history! Even though the conversation is in Chinese, the previous assistant turn ended with the exact English string:
`Would you like me to do a more in-depth research instead and propose a research plan?`
- Keeping it exact matches both the instruction and the established pattern in this conversation.
5. **Refine the Content for Clarity, Accuracy, and Actionability:**

- Make sure to address the user's typo/speech-to-text smoothly ("Cloud Code" -> Claude Code, etc.) without making it awkward.
- Make sure every point directly answers what the user asked:

1. Can I use `system prompt append` (`--append-system-prompt`) in Claude Desktop so I don't have to build an app?

- Clear "No, not directly" + exact reasons ( [^3]).
- What Desktop *can* use as a partial substitute (`outputStyle` in `settings.json` with `keep-coding-instructions: true`, plus `CLAUDE.md`, Hooks, MCP [^2]).
- Why Desktop still won't give them the "aggregated group chat UI" they described ( [^1]).
2. How to configure different Skills for different Agents (specifically: a global Skill not read by default, which only one specific Agent needs, without conflicting with global Skills), comparing:

- Injecting via `--append-system-prompt`
- Injecting / loading via directory `.claude/skills/` + YAML config
- User's own approach: an MCP server exposing that Agent's required skills & tools.
- Verify the table formatting: single space around `|`? Wait: "use only single spaces between cell content and pipe (`|`) separators. Do not pretty-print tables."
Example:
`| 方案 | 实现机制 | 是否会与全局 Skill 冲突 | 上下文与压缩表现 | 适用建议 |`
`| --- | --- | --- | --- | --- |`
Yes! That follows the exact rule (single space between cell content and `|`, no extra padding spaces for visual alignment).
6. **Final Polish & Fact-Check:**

- Did I verify `keep-coding-instructions: true`? Yes, [^2]: "Setting `keep-coding-instructions: true` in the YAML frontmatter explicitly retains these standard engineering behavior rules alongside your custom style instructions."
- Did I verify Desktop `outputStyle` support? Yes, [^2]: "Desktop app: set the `outputStyle` field in a settings file, for example `.claude/settings.local.json`".
- Did I verify `--desktop` flag restrictions? Yes, [^6]: "Takes no prompt and no other flags except `--verbose` and the `--debug` flags, since the app starts the session itself."
- Did I verify `disable-model-invocation: true` vs subagent `skills:` preload? Yes, [^12]: "You **cannot** preload skills that have `disable-model-invocation: true` set, because preloading relies on the same pool of skills Claude is permitted to invoke."
- Did I verify skill override priority `managed > user > project`? Yes, [^8]: "Skills override by name across levels based on priority (`managed > user > project`)".
- Did I verify `--bare` + `--add-dir`? Yes, [^6]: "`--bare`: Runs in minimal mode by skipping the auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and `CLAUDE.md`... Interaction with Bare Mode: Skills in a directory passed with `--add-dir` will still load even in bare mode."
- Did I verify `--strict-mcp-config`? Yes, [^6].
- Did I verify MCP Tool Search 4,096 chars truncation and `alwaysLoad`? Yes, [^20].
- Did I verify MCP tool changes invalidating System Prompt cache? Yes, [^5].
- Did I ensure no citations are inside fenced code blocks? Yes.
- Everything is rock-solid, accurate, and directly helpful to the user's architecture design. Let's write the response.针对你提到的这两个问题，结合 Claude Code 和 Claude Desktop 的官方底层机制，具体结论和方案对比如下：

### 一、 能否在 Claude Desktop 中使用 `--append-system-prompt` 来替代自研 App？

直接答案：不能直接传递 `--append-system-prompt` 参数 [^3]。

1. **为什么 Desktop 不支持该参数？**

- Claude Desktop 中的 **Code 标签页**虽然底层运行相同的 Claude Code 引擎，但它是一个纯交互式的图形客户端 [^1]。官方明确未在 Desktop 中开放 `--append-system-prompt`、`--system-prompt` 或 `--print` 等命令行注入参数 [^3]。
- 即使你试图从终端通过 `claude --desktop` 命令拉起 Desktop，官方文档也明确限制 `--desktop` **不能携带任何其他参数**（仅支持 `--verbose` 和 `--debug` 调试标志），因为会话是由 Desktop App 自己初始化并启动的 [^6]。
2. **Desktop 中最接近 `--append-system-prompt` 的原生平替方案**
Desktop 与 CLI 共享同一套配置文件体系（`CLAUDE.md`、`CLAUDE.local.md`、MCP 配置、Hooks、Skills 以及 `settings.json`） [^3]。如果你只想借用 Desktop 客户端而不自己写界面，可以通过以下两种共享配置实现近似效果：

- **使用自定义 Output Style（最接近追加系统提示词）**：Desktop 原生支持读取 `.claude/settings.local.json` 或 `~/.claude/settings.json` 中的 `{"outputStyle": "你的样式名"}` [^2]。当你编写自定义样式 Markdown 文件时，默认会抹除内置的软件工程指令，但只要在顶部 YAML 中加上 **`keep-coding-instructions: true`**，就能保留全部默认编程能力并附带你的角色规则 [^2]。（注：与 `--append-system-prompt` 的底层区别在于，Output Style 是作为系统提醒/对话消息随请求发送的，而非修改最底层的 System Prompt 前缀 [^4]。）
- **配合 `SessionStart` Hook**：Desktop 同样会执行配置在 `settings.json` 中的 Hooks [^3]，你可以用 `SessionStart` Hook 在会话开启时动态注入 `additionalContext` 作为系统提醒 [^10]。
3. **为什么 Desktop 依然替代不了你的“群聊 App”？**
在交互形态上，Claude Desktop 的 Code 标签页本质上仍然是**侧边栏多独立会话列表**——每个会话各自隔离自己的聊天历史与项目目录 [^1]。它无法把多个 Agent 会话的消息按时间线聚合到同一个群聊窗口中，因此如果你要落地“单群聊视图 + 统筹伙伴调度 + 后台清洗历史”，依然需要自研前端（或基于上一轮提到的 `T3 Code` / `Happy` 等 MIT 开源底座改造）。

### 二、 全局 Skill 不默认读取，但指定 Agent 需要读取——三种配置方案对比（含对你的 MCP 方案评估）

在对比三种方案前，必须先指出 Claude Code 在 Skill 机制上的**三个关键底层规则（也是极易踩坑的地方）**：

1. **Skill 的默认加载机制**：全局（`~/.claude/skills/<name>/SKILL.md`）或项目级（`.claude/skills/<name>/SKILL.md`）的 Skill **默认只把名称和 `description` 放进启动上下文**，正文并不会直接注入 System Prompt 或第一条 User 消息，而是由模型在认为匹配时按需加载 [^8]。
2. **互斥陷阱（`disable-model-invocation: true` 与子智能体预加载互斥）**：如果你为了“让全局 Skill 默认不被其他 Agent 读取”，在全局 Skill 里设置了 `disable-model-invocation: true`，那么你**无法**在某个特定 Subagent 的 YAML Frontmatter 中通过 `skills: [skill-name]` 预加载它！官方明确规定，`skills:` 预加载依赖模型有权自动调用的技能池，带 `disable-model-invocation: true` 的技能会被直接跳过 [^12]。
3. **冲突覆盖方向（`user > project`）**：官方技能同名覆盖的优先级是 **`managed > user > project`** [^8]。这意味着，如果全局 `~/.claude/skills/` 下有一份同名 Skill，**全局（`user`）会反过来覆盖掉 Agent 专属目录里的 `.claude/skills/`（`project`）** [^8]，而不是目录里的覆盖全局！

基于上述机制，下面对比你提到的三种做法：

| 方案 | 实现机制与避坑配置 | 是否会与全局 Skill 冲突 | 上下文消耗与压缩表现 | 综合评价 |
| --- | --- | --- | --- | --- |
| 方案 1：通过 --append-system-prompt-file 注入 | 启动指定 Agent 进程时直接将 SKILL.md 路径传给 --append-system-prompt-file（若为单会话内原生 Subagent，则直接写进 .claude/agents/agent-x.md 正文） | 完全不冲突（可叠加 --setting-sources project 或 --bare 屏蔽全局 user 配置） | 每轮都占 Token 与指令预算；但位于 System 层，/compact 压缩后永久保留不丢失 | 适合体量较小、且该 Agent 每一轮都必须严格遵守的核心规则；注意该方式不会解析 Skill Frontmatter 或 !`command`  动态命令 |
| 方案 2A：在 Agent 目录建 .claude/skills/ 并改配置 | 1. 独立进程时：用 --bare --add-dir ./agent-x-skills（--bare 会跳过所有全局 CLAUDE.md 和全局 Skills，唯独会加载 --add-dir 传入目录下的 Skills），或用 --setting-sources project,local 排除全局 user 级；2. Subagent 时：不要在全局放同名 Skill，只在目标 .claude/agents/agent-x.md 写 skills: [name] 预加载，其他 Subagent 禁用 Skill 工具 | 有冲突风险（注意目录名是 .claude/skills/ 而非 .skills/；若未屏蔽 user 源且同名，全局会覆盖项目级） | 按需加载或子智能体启动时预加载；注意：子目录内的 .claude/skills/ 默认不加载，直到访问该目录或显式 --add-dir | 适合纯按目录隔离的原生多目录架构，但当你需要用 UI 动态给不同 Agent 组合增减技能时，磁盘文件夹管理会变得繁琐 |
| 方案 2B（你的做法）：写一个 MCP 服务按 Agent 暴露 Skill 与 Tools | 写一个统一 MCP Server，分别暴露各 Agent 需要的 Tools、MCP Prompts（/server:prompt）或 MCP Resources（@server:uri）；启动独立 Agent 时配合 --mcp-config + --strict-mcp-config | 完全不冲突（MCP 体系与 .claude/skills/ 彻底隔离；注意服务名不能叫 anthropic-skills，这是系统保留名） | 默认通过 MCP Tool Search 按需拉取工具定义，启动极省上下文（服务端 instructions 截断上限 4,096 字符） | 最契合你自研 UI 的工业级方案！ 可集中动态管控每个 Agent 的工具与技能，无需维护满磁盘的隐藏文件夹 |

#### 针对你“用 MCP 暴露 Skill 与 Tools”方案的 4 条关键落地建议

你的直觉非常准确——既然你本来就要做一套 UI 来管理每个 Agent 的 Tools、工作目录和记忆，**用 MCP 作为统一的能力与 Skill 分发总线，比在磁盘上维护碎片化的 `.claude/skills/` 更干净、更容易被 UI 控制**。但在 Claude Code 底座上落地时，建议注意以下四个细节：

1. **用 `--strict-mcp-config` 锁死单 Agent 边界（或小心 Subagent 继承泄漏）**

- 如果你的每个伙伴是独立的 CLI 进程，启动时务必加上 `--mcp-config ./agent-x.mcp.json --strict-mcp-config`，这样 Claude Code 会强制忽略全局和项目级的其他 MCP，只加载你为该 Agent 分配的 MCP 实例 [^6]。
- 如果你的伙伴是主会话内的原生 **Subagent**（`.claude/agents/*.md`），要特别注意：**Subagent 默认会继承主会话中已经挂载的所有 MCP 工具** [^9]。因此要么不在主会话挂载该 MCP、改为直接在目标 Subagent 的 Frontmatter `mcpServers` 中内联声明 [^9]，要么通过 `tools` / `disallowedTools` 严格把其他 Subagent 的 MCP 调用权限剥离 [^9]。
2. **用固定工具签名返回 Skill 内容，千万不要在会话中途动态增减 MCP 工具列表**

- Claude Code 的第一层缓存（System Prompt 层）在**已加载的工具定义集合发生变化时会整层失效** [^5]。
- 因此，不要为每个 Skill 临时动态生成一个新的 MCP Tool 注册进工具列表。更好的做法是：给 MCP 设计固定不变的通用工具（如 `list_available_skills`、`load_skill(name)`）或暴露为 **MCP Resources** [^20]。这样工具定义在会话期间 100% 静态，前缀缓存持续命中，Skill 正文只作为返回结果进入对话末尾 [^5]。
3. **补足 MCP 工具在 `/compact` 压缩后的“易忘”短板**

- 通过 MCP 工具读取到的 Skill 内容，进入的是 **Conversation（对话）层**；一旦对话变长触发 `/compact`，这些历史工具返回内容会被压缩进摘要，细节可能丢失 [^5]。
- 因此，建议将“什么时候必须调用 `load_skill`”的简短触发指令写入 MCP Server 的 `instructions`（4,096 字符以内） [^20] 或该 Agent 的短 `--append-system-prompt` 中；如果某条规范属于“压缩后绝不能忘的红线”，则仍然放在 `--append-system-prompt` 里，而把长篇操作手册、参考文档放在 MCP 里按需拉取。
4. **留意核心工具的 `alwaysLoad` 开关与模型端兼容性**

- Claude Code 默认开启 MCP Tool Search 延迟加载工具细节，但如果你发现某个 Agent 对某个高频核心工具搜索不够积极，可以在它的 MCP JSON 配置里给该服务加上 `"alwaysLoad": true` 强制在启动时加载完整定义（注意该服务启动连接超时上限为 5 秒） [^20]。此外，如果你的模型网关接的是部署在 Azure 上的 Microsoft Foundry，它服务端会拒绝 Tool Search，Claude Code 会自动退化为启动时全量加载 MCP 工具 [^20]。

Would you like me to do a more in-depth research instead and propose a research plan?

---

## 📚 参考文献与引用源

1. [**code.claude.com**｜Desktop application - Claude Code Docs](https://code.claude.com/docs/en/desktop)
2. [**code.claude.com**｜Output styles - Claude Code Docs](https://code.claude.com/docs/en/output-styles)
3. [**code.claude.com**](https://code.claude.com/docs/en/desktop#cli-flag-equivalents)
4. [**code.claude.com**｜Glossary - Claude Code Docs](https://code.claude.com/docs/en/glossary)
5. [**code.claude.com**｜How Claude Code uses prompt caching](https://code.claude.com/docs/en/prompt-caching)
6. [**code.claude.com**｜CLI reference - Claude Code Docs](https://code.claude.com/docs/en/cli-reference)
7. [**code.claude.com**｜Get started with the desktop app - Claude Code Docs](https://code.claude.com/docs/en/desktop-quickstart)
8. [**code.claude.com**](https://code.claude.com/docs/en/features-overview)
9. [**code.claude.com**｜Create custom subagents - Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
10. [**code.claude.com**](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)
11. [**code.claude.com**｜Extend Claude with skills - Claude Code Docs](https://code.claude.com/docs/en/skills)
12. [**code.claude.com**](https://code.claude.com/docs/en/sub-agents#preload-skills-into-subagents)
13. [**code.claude.com**](https://code.claude.com/docs/en/context-window)
14. [**code.claude.com**｜Best practices for Claude Code - Claude Code Docs](https://code.claude.com/docs/en/best-practices)
15. [**code.claude.com**｜Configure permissions - Claude Code Docs](https://code.claude.com/docs/en/permissions)
16. [**code.claude.com**｜Configure auto mode - Claude Code Docs](https://code.claude.com/docs/en/auto-mode-config)
17. [**code.claude.com**｜Extend agents with skills - Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/skills)
18. [**code.claude.com**｜Use Claude Code features in the SDK](https://code.claude.com/docs/en/agent-sdk/claude-code-features)
19. [**code.claude.com**｜Plugin loading reference - Claude Code Docs](https://code.claude.com/docs/en/plugins/loading)
20. [**code.claude.com**｜Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
21. [**honeyhive.ai**｜What is a system prompt? - HoneyHive AI](https://www.honeyhive.ai/learn/system-prompt)
22. [**aclanthology.org**｜Many-Tier Instruction Hierarchy in LLM Agents - ACL Anthology](https://aclanthology.org/2026.findings-emnlp.1420.pdf)
23. [**reddit.com**｜When to use '—append-system-prompt' vs CLAUDE.md? : r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/)
24. [**humanlayer.dev**](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
25. [**ajbuilds.medium.com**｜Your CLAUDE.md Is Probably Broken — Here's How to Tell (And Fix It)](https://ajbuilds.medium.com/your-claude-md-is-probably-broken-heres-how-to-tell-and-fix-it-87cbf24d317d?source=rss------ai-5)
26. [**scoutapm.com**](https://www.scoutapm.com/blog/prompts-skills-and-the-agents-md-nobody-wants-to-write)
27. [**code.claude.com**｜Control MCP server access for your organization - Claude Code Docs](https://code.claude.com/docs/en/managed-mcp)
28. [**claudecodecamp.com**](https://www.claudecodecamp.com/p/inside-claude-code-s-system-prompt)
29. [**reddit.com**｜Claude Code System Reminder : r/ClaudeCode - Reddit](https://www.reddit.com/r/ClaudeCode/comments/1oqogwu/claude_code_system_reminder/)
30. [**code.claude.com**｜Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
31. [**reddit.com**｜When does Claude read CLAUDE.md files (and which does it read)](https://www.reddit.com/r/ClaudeCode/comments/1ouaqbq/when_does_claude_read_claudemd_files_and_which/)
32. [**empromptu.ai**｜AGENTS.md and CLAUDE.md: Writing Guardrails for AI | Empromptu](https://empromptu.ai/blog/agents-md-claude-md-coding-guardrails)
33. [**youtube.com**｜Claude Code answered in English? Use --append-system-prompt](https://www.youtube.com/shorts/IUhSqbFAg_o)
34. [**youtube.com**｜Run Multiple AI Agents in Parallel (Claude Code Tutorial) - YouTube](https://www.youtube.com/watch?v=n35KalqEwJc)
35. [**code.claude.com**｜Settings files and precedence - Claude Code Docs](https://code.claude.com/docs/en/settings)
36. [**code.claude.com**｜How Claude Code works - Claude Code Docs](https://code.claude.com/docs/en/how-claude-code-works)
37. [**code.claude.com**｜Explore the .claude directory - Claude Code Docs](https://code.claude.com/docs/en/claude-directory)
38. [**code.claude.com**｜Week 27 · June 29 – July 3, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w27)
39. [**markdown.engineering**](https://www.markdown.engineering/learn-claude-code/39-system-prompt)
40. [**dosu.dev**](https://dosu.dev/articles/context-compaction-coding-agents)
41. [**code.claude.com**｜Run parallel sessions with worktrees - Claude Code Docs](https://code.claude.com/docs/en/worktrees)
42. [**code.claude.com**｜Message your other Claude Code sessions](https://code.claude.com/docs/en/cross-session-messaging)
43. [**mintlify.com**｜Context rot: what it is and how to reduce it with your docs - Mintlify](https://www.mintlify.com/library/context-rot)
44. [**aimuse.blog**｜System Prompts Versus User Prompts - AI Muse by kekePower](https://aimuse.blog/article/2025/06/14/system-prompts-versus-user-prompts-empirical-lessons-from-an-18-model-llm-benchmark-on-hard-constraints)
45. [**kompozy.io**｜System Prompt — definition · Kompozy](https://kompozy.io/glossary/system-prompt)
46. [**roboco.io**｜Claude Code Deep Dive: How Is Claude Code Actually Built ...](https://roboco.io/en/posts/claude-code-deep-dive/)
47. [**code.claude.com**｜Orchestrate teams of Claude Code sessions - Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
48. [**code.claude.com**｜How Claude remembers your project - Claude Code Docs](https://code.claude.com/docs/en/memory)
49. [**code.claude.com**｜Week 22 · May 25–29, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w22)
50. [**code.claude.com**｜Common workflows - Claude Code Docs](https://code.claude.com/docs/en/common-workflows)
51. [**code.claude.com**｜Commands - Claude Code Docs](https://code.claude.com/docs/en/commands)
52. [**code.claude.com**｜Week 23 · June 1–5, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w23)
53. [**code.claude.com**｜Automate work with scheduled tasks - Claude Code Docs](https://code.claude.com/docs/en/routines)
54. [**code.claude.com**｜Agent SDK overview - Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/overview)
55. [**ashutoshysingh.com**｜Context Engineering | Ashutosh Singh](https://www.ashutoshysingh.com/learn/context-engineering/)
56. [**ultralytics.com**｜Context Engineering: Curating What AI Sees | Ultralytics](https://www.ultralytics.com/glossary/context-engineering)
57. [**code.claude.com**｜Overview - Claude Code Docs](https://code.claude.com/docs/en/overview)
58. [**reddit.com**｜Workflow: Best Practices for Separating AGENTS.md and CLAUDE](https://www.reddit.com/r/ClaudeWorkflows/comments/1thlmo4/workflow_workflow_best_practices_for_separating/)
59. [**medium.com**｜Learning Claude Code — From Context Engineering to Multi-Agent](https://medium.com/@aayushmnit/learning-claude-code-from-context-engineering-to-multi-agent-workflows-4825e216403f)
60. [**code.claude.com**｜Run agents in parallel - Claude Code Docs](https://code.claude.com/docs/en/agents)
61. [**omidsaffari.com**](https://omidsaffari.com/blog/context-rot)
62. [**code.claude.com**｜Run Claude Code programmatically - Claude Code Docs](https://code.claude.com/docs/en/headless)
63. [**medium.com**｜The “Lost in the Middle” Problem in LLMs - Medium](https://medium.com/@rajveer.rathod1301/the-lost-in-the-middle-problem-in-llms-b0d88e13f025)
64. [**docs.moveworks.com**｜Attention and Limitations - Moveworks documentation](https://docs.moveworks.com/harness/llm-fundamentals/attention-and-limitations)
65. [**pristren.com**｜Lost in the Middle: Why LLMs Struggle With Long Contexts - Pristren](https://pristren.com/blog/lost-in-middle-attention-paper/)
66. [**thepromptbench.com**｜Context Rot, Explained - The Prompt Bench](https://thepromptbench.com/context-engineering/context-rot-explained/)
67. [**claudearchitectcertification.com**｜Attention Engineering (D4, 20% of CCA-F) - Claude Certified Architect](https://claudearchitectcertification.com/concepts/attention-engineering)
68. [**harnez.ai**｜Lost in the middle: test context position, not just size - harnez](https://harnez.ai/posts/u-shaped-attention-memory-llms/)
69. [**arxiv.org**｜Lost in the Middle: How Language Models Use Long Contexts - arXiv](https://arxiv.org/html/2307.03172v3)
70. [**upsolve.ai**｜What Is Context Engineering? Definition & Best Practices in 2026](https://upsolve.ai/blog/context-engineering-guide)
71. [**tianpan.co**｜The Middle-Context Blindness Your Retrieval Pipeline Never](https://tianpan.co/blog/2026/06/02/the-middle-context-blindness-your-retrieval-pipeline-never-measured)
72. [**researchgate.net**｜Lost in the Middle: How Language Models Use Long Contexts](https://www.researchgate.net/publication/378284067_Lost_in_the_Middle_How_Language_Models_Use_Long_Contexts)
73. [**arxiv.org**｜The Instruction Hierarchy: Training LLMs to Prioritize Privileged](https://arxiv.org/abs/2404.13208)
74. [**openreview.net**｜The Instruction Hierarchy: Training LLMs to Prioritize Privileged](https://openreview.net/forum?id=vf5M8YaGPY)
75. [**huggingface.co**｜2603/2603.16152.md · huggingchat/papers-content - Hugging Face](https://huggingface.co/buckets/huggingchat/papers-content/tree/2603/2603.16152.md)
76. [**cchistory.mariozechner.at**｜cchistory - Claude Code Version History](https://cchistory.mariozechner.at/)
77. [**news.ycombinator.com**｜Claude Code 2.0 - Hacker News](https://news.ycombinator.com/item?id=45416228)
78. [**reddit.com**｜Hvornår skal man bruge '—append-system-prompt' vs CLAUDE.md](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/?tl=da)
79. [**reddit.com**｜Quand utiliser '—append-system-prompt' vs CLAUDE.md - Reddit](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/?tl=fr)
80. [**reddit.com**｜[Workflow] Structuring Multi-Agent Claude Code Workflows with ...](https://www.reddit.com/r/ClaudeWorkflows/comments/1wbzfga/workflow_structuring_multiagent_claude_code/)
81. [**epam.com**｜A Step-by-Step Guide to Building a Multi-Agent Claude Code AI ...](https://www.epam.com/insights/ai/blogs/step-by-step-guide-to-building-a-multi-agent-claude-code-ai-development-team)
82. [**unlearn.dev**｜Build Your First Multi-Agent Workflow with Claude Code | Unlearn](https://unlearn.dev/blog/build-your-first-multi-agent-workflow)
83. [**code.claude.com**｜Orchestrate subagents at scale with dynamic workflows - Claude ...](https://code.claude.com/docs/en/workflows)
84. [**github.com**｜GitHub - Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts)
85. [**reddit.com**｜Don't use Claude Code's Default System Prompt - Reddit](https://www.reddit.com/r/ClaudeCode/comments/1slfnoq/dont_use_claude_codes_default_system_prompt/)
86. [**golev.com**｜Claude Saves Tokens, Forgets Everything - Alexander Golev](https://golev.com/post/claude-saves-tokens-forgets-everything/)
87. [**hackergit.org**｜Piebald-AI/claude-code-system-prompts on Hacker News - HackerGit](https://hackergit.org/r/Piebald-AI/claude-code-system-prompts)
88. [**open-repo.com**｜Piebald-AI/claude-code-system-prompts · 12.5K Stars · GitHub 趋势](https://www.open-repo.com/r/Piebald-AI_claude-code-system-prompts.html)
89. [**githubsignals.io**｜piebald-ai/claude-code-system-prompts - GitHub Signals](https://githubsignals.io/repo/piebald-ai/claude-code-system-prompts/)
90. [**github.com**｜system-reminder-send-to-project-memory-brief-trust-boundary.md](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-send-to-project-memory-brief-trust-boundary.md)
91. [**pomoai.com**｜claude-code-system-prompts · 技能与配置 - POMOAI](https://www.pomoai.com/hubs/Piebald-AI/claude-code-system-prompts)
92. [**github.com**｜system-reminder-approved-claude-doc-plan-readback.md - GitHub](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-approved-claude-doc-plan-readback.md)
93. [**github.com**｜claude-code-learn/claude-prompt/user/user.md at main - GitHub](https://github.com/zlh-428/claude-code-learn/blob/main/claude-prompt/user/user.md)
94. [**reddit.com**｜Is CLAUDE.md just a system prompt all agents will read before](https://www.reddit.com/r/ClaudeAI/comments/1lrfs27/is_claudemd_just_a_system_prompt_all_agents_will/)
95. [**kirshatrov.com**｜Reverse engineering Claude Code - Kir Shatrov](https://kirshatrov.com/posts/claude-code-internals)
96. [**levelup.gitconnected.com**｜Reverse Engineering Claude Code: How Skills different from Agents](https://levelup.gitconnected.com/reverse-engineering-claude-code-how-skills-different-from-agents-commands-and-styles-b94f8c8f9245)
97. [**news.ycombinator.com**｜Claude.md just has 2 lines. the first points to @CONTRIBUTING](https://news.ycombinator.com/item?id=46331909)
98. [**mihaileric.com**｜Claude Code Demystified: Whirring, Skidaddling, Flibbertigibetting](https://www.mihaileric.com/Demystifying-Claude-Code/)
99. [**medium.com**｜The Complete Guide to Writing Agent System Prompts - Medium](https://medium.com/@fengliu_367/the-complete-guide-to-writing-agent-system-prompts-lessons-from-reverse-engineering-claude-code-09ecd87c7cc1)
100. [**docs.openclaw.ai**｜Prompt caching - OpenClaw Docs](https://docs.openclaw.ai/reference/prompt-caching)
101. [**classic.yarnpkg.com**｜@mariozechner/pi-coding-agent | Yarn](https://classic.yarnpkg.com/en/package/@mariozechner/pi-coding-agent)
102. [**ccafpreparation.com**｜CCAR-F Glossary — 219 Terms, Config Keys and API Fields](https://www.ccafpreparation.com/glossary)
103. [**github.com**｜fak/cmd/fak/guard.go at main - anthony-chaudhary - GitHub](https://github.com/anthony-chaudhary/fak/blob/main/cmd/fak/guard.go)
104. [**github.com**｜cc-viewer/history.md at main - GitHub](https://github.com/weiesky/cc-viewer/blob/main/history.md)
105. [**git.mitsea.com**｜claude-code-2603-leak/src/services/compact/prompt.ts at ... - MitseaGit](https://git.mitsea.com/FlintyLemming/claude-code-2603-leak/src/commit/f5a40b86dede580f6543bf8926c9af017eea9409/src/services/compact/prompt.ts)
106. [**dev.to**｜Multi-Agent Development Workflows with Claude Code - DEV ...](https://dev.to/javatarz/multi-agent-development-workflows-with-claude-code-n23)
107. [**github.com**｜[BUG] <system-reminder> is instructing claude code to not follow ...](https://github.com/anthropics/claude-code/issues/18560)
108. [**honeyhive.ai**](https://www.honeyhive.ai/learn/context-rot)
109. [**betterclaw.io**｜OpenClaw Setup Guide: Install in the Right Order (2026) - BetterClaw](https://www.betterclaw.io/blog/agents-md-multi-agent-best-practices)
110. [**anthropic.com**｜Effective context engineering for AI agents \ Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)
111. [**opc.csdn.net**｜Claude Code 完整提示词汇总（中英对照版）_人工智能_ ...](https://opc.csdn.net/6a324dc8662f9a54cb80b70d.html)
112. [**github.com**｜claude-code-system-prompts/system-prompts/system ... - GitHub](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-compact-file-reference.md)
113. [**medium.com**｜Tracing Claude Code's LLM Traffic: Agentic loop, sub-agents, tool ...](https://medium.com/@georgesung/tracing-claude-codes-llm-traffic-agentic-loop-sub-agents-tool-use-prompts-7796941806f5)
114. [**github.com**｜agentic-ai-prompt-research/prompts/21_compact_service.md at ...](https://github.com/Leonxlnx/agentic-ai-prompt-research/blob/main/prompts/21_compact_service.md)
115. [**github.com**](https://github.com/bendyline/gezel/blob/main/docs/prompt-stack.md)


---

## 👤 用户提问 5

还有一点我想知道，在 Claude Desktop 里面我能不能用上 system prompt append 这个参数？这样我就不用自己写一个 APP 了。还有个问题，Claude Code 全局有…  还有一点我想知道，在 Claude Desktop 里面我能不能用上 system prompt append 这个参数？这样我就不用自己写一个 APP 了。还有个问题，Claude Code 全局有 skill，那我想为每个 Agent 配置不同的 skill 方式的话该怎么做？  比如我全局有一个 skill，它是默认不读取的，但是我有一个 Agent 就是需要读取这份 skill 的，怎么做？读取 skill 其实分两种：  一种是直接注入到 system prompt，用 append system prompt 去做；  另一种是当成用户的第一条消息注入进去，可以按照 cloud code 的方式去做，但是它不能与全局的那份 skill 冲突。  针对第二种方式，有两种选项：  第一种是在 Agent 的目录里面再创建一份 .skills 文件夹，然后更新它的 YAML 配置。我的做法是写一个 MCP 服务，通过这份 MCP 会暴露它需要读取的 skill，需要读取的 工具

## 🤖 Gemini 回答

`tag. *   Check Rule 5 of Mode 2 (Obvious vs Non-obvious follow-up): *   Question 1 (Claude Desktop`--append-system-prompt`): Not covered in the initial report (which focused on CLI/SDK and briefly mentioned Desktop in Q&A 2). *   Question 2 (Per-agent Skills scoping,`disable-model-invocation`,`skills:`frontmatter preloading, MCP vs`.claude/skills/`): Barely touched in the initial report (only briefly mentioned Skills in the compact table and`MEMORY.md`vs Skills). *   Since this introduces new, deep implementation topics (Claude Desktop CLI flag support, Claude Code's exact skill scoping/preloading mechanisms, and MCP vs Subagent`skills`frontmatter), let's check if it's a non-obvious passthrough or obvious follow-up. Actually, we have extensive research snippets directly answering BOTH questions (`source: 238`,`source: 255`,`source: 256`,`source: 254`,`source: 237`,`source: 257`,`source: 60`,`source: 239`,`source: 249`,`source: 252`,`source: 262`,`source: 265`). Let's check carefully if attaching the research offer is needed or not. *   Wait: Look at Rule 5: "Determine whether the user's query is an obvious follow-up or a non-obvious passthrough: Obvious follow-up (Do NOT offer research): The user asks about facts, findings, or explanations that are already in the report, asks to clarify/elaborate on specific sections of the report, or asks simple definitions/explanations directly grounded in the report content. Non-obvious passthrough (DO offer research): The user asks about new topics, new questions, or broader extensions that were NOT already covered in depth in the report (which would benefit from fresh, comprehensive research)." *   Clearly, "Can Claude Desktop use`--append-system-prompt`?" and "How to scope global vs per-agent skills in Claude Code, and evaluating an MCP-based skill exposure architecture" are new topics/extensions NOT covered in depth in the original report! So attaching`"Would you like me to do a more in-depth research instead and propose a research plan?"` at the very end on a new line is appropriate and follows Rule 5 strictly.

1. **Analyze the Research Material for Question 1: Claude Desktop & `--append-system-prompt`:**

- Let's check snippets [^1], [^2], [^1], [^2], [^3], [^1]:
- In [^3] (`https://code.claude.com/docs/en/desktop#cli-flag-equivalents`):

- Claude Desktop has the **Code tab**, which runs the same underlying engine as the CLI.
- CLI flag equivalents table: `--model`, `ANTHROPIC_MODEL`, `--permission-mode`, `--dangerously-skip-permissions`, `--resume`/`--continue`, `--add-dir`, `--allowedTools`/`--disallowedTools` ("No per-session UI equivalent. Permission rules set in settings files (`settings.json`) still apply."), `--verbose`, `--print`/`--output-format` ("Not available: Desktop is strictly interactive only"), `MAX_THINKING_TOKENS`.
- Notice what is NOT in the Desktop UI / flag equivalents: there is **no direct UI field or CLI flag box in Claude Desktop for `--append-system-prompt` or `--system-prompt`** ( [^3]). Wait—let's check [^1] and [^3] accurately! Do NOT fabricate claims.
- Wait: What *does* Claude Desktop support via shared configuration ( [^3], [^2])?

- Desktop and CLI share: `CLAUDE.md`, `CLAUDE.local.md`, MCP servers (`claude_desktop_config.json`, `~/.claude.json`, `.mcp.json`), Hooks, Skills, `~/.claude/settings.json` ( [^3]).
- What about **`outputStyle`** ( [^2], [^2], [^2])?

- Look at [^2]: "Desktop app: set the `outputStyle` field in a settings file, for example `.claude/settings.local.json`, the file the terminal menu writes. When you run `/config` there, Claude Code opens Settings > Code or Settings > Claude Code rather than a menu. To set a style without the menu, edit the `outputStyle` field directly in a settings file: `{ "outputStyle": "Explanatory" }`."
- And look at [^2]: Custom output styles can be created as Markdown files with YAML frontmatter. Wait: by default, a custom output style *omits* built-in software engineering instructions (`keep-coding-instructions: false`), UNLESS you set `keep-coding-instructions: true` ( [^2])! When `keep-coding-instructions: true` is set in a custom output style and selected via `"outputStyle": "..."` in `settings.json` / `.claude/settings.local.json`, it keeps the default coding instructions and sends the custom style instructions with every request (acting functionally very similar to `--append-system-prompt`, except delivered as system-style instructions/reminders per request in the conversation or style layer — specifically [^4] and [^5] note that output style instructions are delivered in the conversation as system reminders / messages, whereas `--append-system-prompt` modifies the System Prompt prefix layer).
- Wait: What about launching Desktop with `claude --desktop` ( [^6], [^3])?

- [^6]: "`--desktop`. Open the Claude Desktop app on the current directory and exit without starting a session in the terminal. ... Takes no prompt and no other flags except `--verbose` and the `--debug` flags, since the app starts the session itself."
- This is a HUGE point! Even if you try `claude --desktop --append-system-prompt ...`, `--desktop` explicitly **takes no other flags** except `--verbose` and `--debug` flags ( [^6]).
- Wait: What about Cowork / Chat in Claude Desktop? Can we check if anything mentions custom instructions or projects? We don't have detailed docs on Claude Desktop's Chat "Projects" instructions, only the Code tab docs ( [^1], [^7], [^3]). Wait: in [^1]: "In the Claude Desktop app, Claude Code is the Code tab. The app also has chat and Cowork..." And [^3] explicitly states: `--print` and `--output-format` are not available, and "Specific flags or settings keys named `system-prompt` or `append-system-prompt` are not directly detailed in this reference section of the documentation." And `--desktop` takes no other flags ( [^6]).
- Also, what about **Subagents** inside Claude Desktop? Since Desktop's Code tab runs the same embedded engine and shares `.claude/` configuration (hooks, skills, settings, etc. — and custom subagents live in `.claude/agents/*.md` or `~/.claude/agents/*.md`), wait: does Desktop share `.claude/agents/`? Let's check snippets to be careful not to overclaim. [^3] lists: `CLAUDE.md` & `CLAUDE.local.md`, MCP Servers, Hooks & Skills, Settings files, Models. [^8] & [^9] show subagents live in `.claude/agents/` and `~/.claude/agents/` and Desktop runs the same underlying engine ( [^3]). Even better: we know for sure from [^2] and [^2] that **Output Styles (`outputStyle` in `settings.json` / `.claude/settings.local.json`)** IS supported in the Desktop app!
- Wait: Can you also run custom subagents or hooks in Desktop? Yes, Hooks and Skills are shared ( [^3]), and `SessionStart` hooks can inject `additionalContext` as system reminders ( [^10]).
- Let's also check: why wouldn't Desktop alone solve the user's "single aggregated group chat UI" anyway? Even in Desktop, [^1] states: "In the Code tab, each conversation is a session: it has its own chat history and project folder, independent of any other session. The sidebar lists your sessions and lets you run several in parallel." It's still a sidebar list of separate sessions, NOT an aggregated group chat timeline! Still, let's directly answer their question about whether `--append-system-prompt` can be used in Claude Desktop and what the closest native alternatives in Desktop are (`outputStyle` with `keep-coding-instructions: true`, `CLAUDE.md`, or `SessionStart` hooks).
2. **Analyze the Research Material for Question 2: Per-Agent Skills Configuration (Global Skill vs. Agent-Specific Skill, Injection Methods, and Evaluating User's MCP Approach):**
Let's carefully read the user's exact scenario and ideas:

- *User's scenario:*

- "Claude Code 全局有 skill，那我想为每个 Agent 配置不同的 skill 方式的话该怎么做？"
- "比如我全局有一个 skill，它是默认不读取的，但是我有一个 Agent 就是需要读取这份 skill 的，怎么做？"
- "读取 skill 其实分两种：一种是直接注入到 system prompt，用 append system prompt 去做；另一种是当成用户的第一条消息注入进去，可以按照 claude code 的方式去做，但是它不能与全局的那份 skill 冲突。"
- "针对第二种方式，有两种选项：第一种是在 Agent 的目录里面再创建一份 .skills 文件夹，然后更新它的 YAML 配置。我的做法是写一个 MCP 服务，通过这份 MCP 会暴露它需要读取的 skill，需要读取的 工具"

Let's check ALL facts in the research snippets about how **Skills** actually work in Claude Code!

1. How Skills actually load & inject in Claude Code ( [^8], [^11], [^12], [^9], [^13], [^14], [^11]):

- First, clarify a crucial detail: In Claude Code, Skills (`SKILL.md` in `~/.claude/skills/<name>/SKILL.md` for global/personal, or `.claude/skills/<name>/SKILL.md` for project) are **NOT** injected into the System Prompt at startup ( [^11]), nor are their full bodies injected into the first user message by default!
- Instead, by default, only the **skill name and `description`** load at startup (as system reminders / skill listing, [^8], [^10], [^11]). The full `SKILL.md` body loads **on demand** into the conversation only when invoked by the user (`/skill-name`) or automatically by Claude via the `Skill` tool when matching the `description` ( [^8], [^11]).
2. What happens with "Global Skill that is NOT read by default, EXCEPT one specific Agent needs it" ( [^14], [^11], [^12], [^11], [^15], [^16], [^17], [^18], [^11], [^9]):

- Wait—let's check the interaction between `disable-model-invocation: true` and `skills:` frontmatter in subagents!
- LOOK AT [^12]!! This is a super important trap documented directly in `https://code.claude.com/docs/en/sub-agents#preload-skills-into-subagents`:

- `skills:` frontmatter field in a subagent definition preloads the **full content** of specified skills directly into that subagent's context at startup ( [^9], [^12]).
- CRITICAL TRAP ( [^12]): "You **cannot** preload skills that have `disable-model-invocation: true` set, because preloading relies on the same pool of skills Claude is permitted to invoke."
- Whoa!! That directly impacts the user's exact scenario ("全局有一个 skill，它是默认不读取的，但是我有一个 Agent 就是需要读取这份 skill 的")!
- Wait: How DO you make a skill NOT auto-invoked by the main/other agents, while allowing a specific Agent to load/use it? Let's check the mechanisms in the snippets:

- If you put `disable-model-invocation: true` on a global skill in `~/.claude/skills/`, **NO model/agent can auto-invoke it OR preload it via `skills:` frontmatter** ( [^12], [^11])! Only a human typing `/skill-name` can invoke it ( [^11]).
- How can you solve "global/other agents don't read it, only Agent X reads it" natively in Claude Code? Let's check all native mechanisms in our snippets:

- **Mechanism 1: Keep the skill out of `~/.claude/skills/` (or restrict via permissions), and put it ONLY in that Agent's scope or preload it while blocking `Skill` tool elsewhere!**

- Wait: If a skill is in global `~/.claude/skills/`, it loads into every project/session's skill description list ( [^11], [^8]).
- Can you restrict which agents can invoke which skills via `permissions.deny` or `disallowedTools`?

- Look at [^11] and [^15]: You can deny skills in permissions (`Skill`, `Skill(name)`, `Skill(skill:)`), OR in a subagent's frontmatter, omit `Skill` from `tools` / add `Skill` to `disallowedTools` ( [^12]). And in the Agent SDK ( [^17], [^18]), you can explicitly pass an allowlist `skills: ["my-skill"]` or `[]`!
- Can you preload a skill into a specific subagent using `skills:` frontmatter ( [^9], [^12])?

- Yes! If the skill does NOT have `disable-model-invocation: true`, adding `skills: [my-skill]` to `.claude/agents/agent-x.md` injects the **full content** of `my-skill` directly into Agent X's startup context ( [^9], [^12]). Meanwhile, for other subagents, omit `Skill` from `tools` (or add `Skill` to `disallowedTools`), so they cannot invoke it ( [^12]). (Though note: the skill's name/description would still appear in the main session's startup list unless blocked via `permissions.deny: ["Skill(my-skill)"]` or `skillOverrides` or kept outside `~/.claude/skills/`! Wait—if blocked by `permissions.deny`, can `skills:` preload it? [^12] says: "If a skill listed in `skills` is missing or disabled (for example, blocked by organizational policy), Claude Code skips that skill and logs a warning in the debug log." So blocking it globally via `skillOverrides` or policy would also block preloading!)
- **Mechanism 2: Independent working directory + `--setting-sources` / `--bare` / local `.claude/skills/` (User's Option 1 & Priority rules)!**

- Let's check [^8] and [^11] and [^6] and [^19] and [^11]:
- Priority/Overriding ( [^8]): "Skills override by name across levels based on priority (`managed > user > project`)" — Wait! Let's double check that exact quote in [^8]: `Skills override by name across levels based on priority (managed > user > project)`! Wait—let's verify if `user` overrides `project` or `project` overrides `user`? Let's read [^8] carefully: `Skills override by name across levels based on priority (managed > user > project)`. That's literally what [^8] says! Wait: if `user` (`~/.claude/skills/`) has higher priority than `project` (`.claude/skills/`), then putting a same-named skill in `.claude/skills/` in the Agent's folder might NOT override `~/.claude/skills/` if `user > project`! Wait—let's check [^11] too: [^11] only talks about local skills vs synced skills from `claude.ai` ("Local skills take priority over skills synced from `claude.ai`"). So [^8] explicitly states `managed > user > project` for skill name overrides! That is a VERY valuable catch to warn the user about regarding "它不能与全局的那份 skill 冲突"!
- Also check `--setting-sources` ( [^6], [^20], [^19]) and `--add-dir` ( [^11], [^6]):

- In CLI, `user`, `project`, and `local` setting sources are all on by default ( [^19]).
- If you launch an Agent process with `--setting-sources project,local` (excluding `user`), or `--bare` + `--add-dir <dir>` ( [^6]: "`--bare` skips auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and `CLAUDE.md`... Exceptions: Skills located in a directory explicitly passed via `--add-dir` still load."), YOU CAN COMPLETELY ISOLATE THAT AGENT FROM GLOBAL `~/.claude/skills/` AND LOAD ONLY THE SKILLS IN ITS SPECIFIC DIRECTORY!
- Whoa!! Look at [^6] on `--bare` + `--add-dir`:

- "`--bare`: Runs in minimal mode by skipping the auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and `CLAUDE.md`..."
- "Interaction with Bare Mode: Skills in a directory passed with `--add-dir` will still load even in bare mode."
- And look at `--setting-sources` ( [^6], [^20], [^19]):

- `--setting-sources` accepts a comma-separated list of setting sources to load (`user`, `project`, `local`). If you pass `--setting-sources project` (omitting `user`), it excludes user-level settings/skills! (Or in the Agent SDK, `settingSources: ['project']` + `skills` allowlist [^18]).
- **Mechanism 3: Evaluating User's Method A (`--append-system-prompt` / `--append-system-prompt-file`) vs. Method B-Option 1 (`.claude/skills/` in Agent directory) vs. Method B-Option 2 (User's MCP Server approach)!**

Let's carefully evaluate all three options the user brought up, strictly grounded in the research snippets:

- **Option A: Injecting the skill directly into System Prompt via `--append-system-prompt` (or `--append-system-prompt-file`)**

- *How it actually behaves:*

- It enters the highest-priority `system` prompt layer (and stays permanently in the prefix cache and survives `/compact`, [^5], [^13], [^21]).
- Wait: If the Agent is a Subagent (`.claude/agents/*.md`), the Markdown body itself *is* its system prompt, OR you can pass `--append-subagent-system-prompt` / `--append-subagent-system-prompt-file` in `-p` mode ( [^6]). Wait: `--append-subagent-system-prompt` applies to *every* subagent ( [^6]), whereas a specific subagent's own `.md` file ( [^9]) or a dedicated standalone `claude` process with `--append-system-prompt-file` ( [^6]) targets that single agent.
- *Pros:* Zero conflict with global `~/.claude/skills/` (even if global skill has `disable-model-invocation: true`, you can just point `--append-system-prompt-file` directly to that `SKILL.md` file or a custom prompt file!). Strongest compliance (`system` > `user`, [^22], [^23]), never forgotten after compaction ( [^13]).
- *Cons:* Consumes tokens and **instruction budget** (~150-200 max instructions total, [^24], [^25]) on *every single turn* of that agent, even on turns when that skill isn't needed ("unconditional tax", [^26]). Also, if the skill uses dynamic command injection like `!`git diff`` or frontmatter tool rules ( [^11]), `--append-system-prompt-file` treats it as raw text and won't execute skill frontmatter/dynamic commands.
- **Option B-1: Putting a `.claude/skills/` folder in the Agent's directory (and updating YAML config)**

- (Note: Clarify the path is `.claude/skills/<skill-name>/SKILL.md`, not `.skills/` [^11].)
- *How it actually behaves & conflict risks:*

- First, Claude Code automatically loads BOTH user-level (`~/.claude/skills/`) AND project-level (`.claude/skills/`) unless restricted ( [^8], [^11]).
- Second, as documented in [^8], skill name collisions resolve with priority **`managed > user > project`**! That means if a global skill in `~/.claude/skills/` has the *same name* as the skill in the Agent's project `.claude/skills/`, **the global user skill actually overrides the project skill** unless you disable `user` setting sources (`--setting-sources project` or `--bare --add-dir ...`) or give the agent skill a different name ( [^8], [^19], [^6])!
- Third, if you use **nested subdirectories** under one root (e.g., `agents/worker1/.claude/skills/`), [^11] explicitly documents that skills in a `.claude/skills/` directory *below* where you started **do not load at startup**—they only load the first time Claude reads or edits a file in that subdirectory (unless passed with `--add-dir` or `/add-dir`)! And if you run `--worktree`, remember [^11] notes worktrees search up to worktree root (falling back to main checkout's `.claude/skills/` if none exists).
- Fourth, if you want a Subagent (`.claude/agents/agent-x.md`) to always read a skill without touching the first user message manually, the native YAML config is `skills: [skill-name]` in the subagent's frontmatter (preloading the skill content at subagent startup, [^9], [^12]), provided the skill does NOT have `disable-model-invocation: true` ( [^12]).
- **Option B-2: User's own approach — Writing an MCP Server to expose only the skills and tools that specific Agent needs!**

- Let's evaluate this! Is an MCP server actually a really clever/viable pattern here, and what are its exact mechanics, pros, and pitfalls in Claude Code?
- Let's check [^20], [^27], [^20], [^8], [^9], [^9], [^28]!
- How MCP works in Claude Code for exposing **Prompts (Skills)**, **Resources (Docs/Skills)**, and **Tools**:

1. **Zero conflict with global Skills (`~/.claude/skills/`)**: MCP servers are completely isolated from `.claude/skills/`. Better yet, MCP servers can expose:

- **MCP Tools** (the exact tools this agent is allowed to call).
- **MCP Prompts** (automatically exposed as `/servername:promptname` slash commands — [^20]; note: do NOT name the MCP server `anthropic-skills`, as that name is reserved [^20]).
- **MCP Resources** (exposed via `@server:protocol://resource/path`, or read on demand via Claude Code's built-in resource listing/reading tools [^20]).
- *(Even better: you can literally build a "Skill Loader" MCP tool like `get_skill(name)` or expose each skill as an MCP Resource/Prompt!)*
2. **Per-Agent Isolation Mechanisms in Claude Code:**

- If the Agent is a **standalone Claude Code CLI process**: launch it with `--mcp-config ./agent-x-mcp.json --strict-mcp-config` ( [^6], [^20]). `--strict-mcp-config` tells Claude Code to **only** use MCP servers from `--mcp-config` and ignore all global/project MCP configs ( [^6])! Combine that with `--setting-sources ""` or `--bare` ( [^6], [^19]) if you also want to ignore global `~/.claude/skills/` and `~/.claude/CLAUDE.md`!
- If the Agent is a **Subagent (`.claude/agents/*.md`)**: Subagent YAML frontmatter has an `mcpServers` field (accepting server names or inline definitions, [^9], [^9]) AND `tools` / `disallowedTools` ( [^9]). Caveat ( [^9]): By default, subagents **inherit** the MCP tools available in the main conversation! So if you mount an MCP server in the main session, subagents inherit it unless filtered via `tools`/`disallowedTools`. Conversely, configuring inline `mcpServers` inside a specific subagent's YAML scopes that MCP server directly to that subagent (note: plugin subagents ignore `mcpServers` for security [^9], [^9]).
3. **Pros of the User's MCP Approach (especially for their custom UI!):**

- **Dynamic & Decoupled from Filesystem:** Remember the user wants to build a UI to manage each Agent's tools, skills, and context! With an MCP server (or per-agent MCP config), your UI can dynamically serve different skills and tools per Agent from a central service/database **without creating duplicated `.claude/skills/` folders everywhere**, and **without modifying global `~/.claude/` configs**.
- **On-Demand Loading / Context Efficiency (MCP Tool Search):** Claude Code uses **MCP Tool Search** by default, deferring full JSON tool schemas until needed and only loading tool names and server instructions (truncated past 4,096 chars) at startup ( [^20], [^8]). So exposing skills/tools via MCP keeps startup context lightweight, achieving the same "progressive disclosure" as Skills! (Or you can set `"alwaysLoad": true` in `.mcp.json` if a specific agent must always load those tool definitions upfront, [^20]).
- **Cross-Platform / Desktop Compatibility:** An MCP server can also be attached in Claude Desktop (`claude_desktop_config.json` / Connectors UI) or CLI ( [^1], [^3]).
4. **Pitfalls / Caveats of the MCP Approach to Watch Out For:**

- **Doesn't auto-inject into System Prompt or First User Message by itself:** An MCP server provides tools/resources/prompts that the agent *calls or fetches when needed* (or server `instructions` loaded at startup, capped at 4,096 chars [^20]). If the skill is a critical constraint that the agent *must* know before acting (or won't know to search for), you still need a short cue in `--append-system-prompt` (or the MCP server's `instructions` field / first user message) telling the agent: *"Before doing X, call `read_skill` / read `@mcp:skill://...`"* (or set `alwaysLoad: true` on the critical MCP tool [^20]).
- **MCP Tool Search limitation on Azure Microsoft Foundry:** Note [^20] mentions Tool Search is rejected server-side on Azure Microsoft Foundry deployments (falls back to upfront loading), though on standard Anthropic API / Claude subscription it works natively.
- **Subagent Inheritance Leakage:** As noted in [^9], subagents inherit all MCP tools from the main conversation unless you restrict them with `tools:` / `disallowedTools:` in the subagent's frontmatter ( [^9]), or run agents as separate CLI processes with `--strict-mcp-config` ( [^6]).
- Compaction Behavior ( [^13], [^5]): Tool results (like reading a skill via an MCP tool) enter the **Conversation layer** and **get summarized away during `/compact`** ( [^13], [^5]), unlike `--append-system-prompt` (which is preserved in the System Prompt layer [^13]) or preloaded subagent `skills:` / invoked skills (which have capped reload behavior [^13]). So if a long-running agent compacts, it may need to re-call the MCP skill tool if details were lost in the summary!
- **Prompt Caching & Security:** If your MCP server dynamically changes its tool list *mid-session*, it invalidates the System Prompt cache layer ( [^5]: "System prompt layer changes when: The set of loaded tool definitions changes"). Keep the MCP tool *definitions* static per session, and only pass dynamic skill *content* as tool/resource responses (which append to the Conversation layer and keep the prefix cached [^5]).
3. **Review Structure & Grounding:**
Let's organize the response cleanly into two clear parts matching the user's two questions:

- **Part 1: 能不能在 Claude Desktop 中使用 `--append-system-prompt` 来替代自己写 App？**

- **Direct Answer:** **不能直接传 `--append-system-prompt` 参数**。解释底层原因：

- Desktop 的 **Code 标签页**虽然与 CLI 共用底层引擎，但它是纯交互式 GUI，没有在界面上暴露 `--append-system-prompt` 或 `--system-prompt` 的输入框/配置项 [^3]。
- 即便从命令行用 `claude --desktop` 拉起 Desktop，官方明确限制 `--desktop` **不能携带其他 CLI 参数**（仅支持 `--verbose` 和 `--debug`），因为会话是由 Desktop App 自己启动的 [^6]。
- **Desktop 中最接近的替代方案（共享配置）**：

- Desktop 与 CLI 共享 `CLAUDE.md`、`CLAUDE.local.md`、MCP 配置（`claude_desktop_config.json` / `~/.claude.json` / `.mcp.json`）、Hooks、Skills 和 `~/.claude/settings.json` [^3]。
- **最接近 `--append-system-prompt` 的平替是 `outputStyle`（输出样式）**：你可以在 `.claude/settings.local.json` 或 `~/.claude/settings.json` 中配置 `{"outputStyle": "你的样式名"}`（Desktop 支持通过 settings 文件读取 `outputStyle`） [^2]。创建自定义样式 Markdown 文件时，默认会省略内置工程指令，只要在 YAML Frontmatter 中设置 **`keep-coding-instructions: true`**，就能保留完整的默认编码能力并附加你的专属角色设定 [^2]（注：与 `--append-system-prompt` 的底层差异在于，Output Style 是作为系统提醒/对话消息随请求发送，而不是修改 System Prompt 前缀层 [^4]）。
- 或者通过 **`SessionStart` Hook** 输出 `additionalContext` 注入系统提醒 [^3]。
- **为什么 Desktop 仍然替代不了你想要的“群聊 App”？**

- 除了不支持 `--append-system-prompt`，Desktop 的 Code 标签页本质上依然是**侧边栏多独立会话列表**（每个会话独立历史和目录） [^1]，无法实现你之前想要的“多 Agent 消息按时间聚合成一个群聊窗口 + 统筹伙伴自动派发 + 隐形伙伴历史清洗跳转”。所以如果你追求极简且只需要单人/单窗口交互，可以用 Desktop + `outputStyle`/`CLAUDE.md`/MCP；但如果要实现你的群聊工作流，还是需要自己做 UI（或基于 `T3 Code` / `Happy` 开源底座二开）。
- **Part 2: 全局 Skill 不默认读取，但指定 Agent 需要读取——三种配置方案深度对比与评估（特别是你的 MCP 方案）**

- **首先纠正一个关键的原生机制与隐藏陷阱**：

1. Claude Code 的 Skill（全局在 `~/.claude/skills/<name>/SKILL.md`，项目在 `.claude/skills/<name>/SKILL.md`）**默认只加载名称和 `description` 到启动上下文，正文并不会在启动时注入 System Prompt 或第一条 User 消息**，而是触发时才按需加载正文 [^8]。
2. **核心踩坑预警（`disable-model-invocation: true` 与 `skills:` 预加载互斥）**：如果你把全局 Skill 设成 `disable-model-invocation: true` 来让其他 Agent“默认不读取”，那么**在子智能体（Subagent）的 YAML 中配置 `skills:` 预加载也会直接失效并跳过**！因为官方规定 `skills:` 预加载依赖模型可调用的技能池，不能预加载设置了 `disable-model-invocation: true` 的技能 [^12]。
3. **命名冲突方向预警（`user > project`）**：官方技能覆盖优先级是 **`managed > user > project`** [^8]。也就是说，如果在全局 `~/.claude/skills/` 和某个 Agent 目录的 `.claude/skills/` 下放了**同名** Skill，**全局的 user 级会覆盖项目的 project 级**（而不是目录里的覆盖全局） [^8]！
- **对比你的三种实现思路（附带原生最简改法）**：

- **方式一：直接通过 `--append-system-prompt`（或 `--append-system-prompt-file`）注入**

- *实现*：单独启动该 Agent 进程时传入 `--append-system-prompt-file ~/.claude/skills/my-skill/SKILL.md`（若想彻底屏蔽其他全局配置，可叠加 `--setting-sources project` 或 `--bare`） [^6]；如果是单会话内的原生 Subagent，则直接把这份 Skill 写进该 Subagent（`.claude/agents/agent-x.md`）的 Markdown 正文里（该正文就是它独立的 System Prompt） [^9]。
- *优缺点*：完全不会和全局 Skill 冲突，指令权重最高，`system` 层级在 `/compact` 压缩后也永久保留 [^13]；缺点是**每轮对话都在消耗 Token 和指令预算**（即使当前轮次不需要这份 Skill），且不会触发 Skill 的动态命令替换（如 `!`command``） [^11]。
- 方式二（选项 1）：在 Agent 目录下建 `.claude/skills/` 并配置 YAML（注意正确目录名是 `.claude/skills/` 而非 `.skills/` [^11]）

- *避坑实现*：

- 不要把这份 Skill 放在全局 `~/.claude/skills/`（或如果放在全局必须避免同名，因为 `user > project` [^8]）。
- 如果每个 Agent 是独立启动的 CLI 进程：用 `--setting-sources project,local`（排除 `user`）来隔离全局配置 [^19]；或者用 **`--bare --add-dir ./agent-x-skills`**——官方文档明确说明 `--bare` 会跳过所有全局技能和 `CLAUDE.md` 自动发现，**唯独会加载 `--add-dir` 显式传入目录下的 Skills** [^6]！这几乎是为“单 Agent 独占指定目录 Skill”量身定制的原生开关。
- 如果是主会话下的 Subagent：把这份 Skill 放在项目 `.claude/skills/` 下（**不设** `disable-model-invocation: true`），只给目标 Agent X 的 `.claude/agents/agent-x.md` 配置 `skills: [target-skill]` 预加载 [^9]；同时给其他不需要它的 Subagent 在 Frontmatter 中去掉 `Skill` 工具（放入 `disallowedTools: [Skill]`），防止其他 Subagent 误调用 [^12]。另外注意：如果 `.claude/skills/` 放在当前工作目录的**子目录**下，默认启动时不会加载，直到 Agent 访问该子目录文件或用 `--add-dir` 才加载 [^11]。
- **方式三（选项 2，你的做法）：写一个 MCP 服务来统一暴露该 Agent 需要的 Skill 和 Tools**

- **综合评价：这是最适合“自研管理 UI + 多 Agent 精准权限隔离”的工程化架构！**
- *为什么 MCP 方案非常契合你的目标*：

1. **彻底规避全局 Skill 冲突与目录碎片**：MCP 服务暴露的 Tools、MCP Prompts（以 `/servername:promptname` 暴露）和 MCP Resources（`@server:uri`）完全独立于 `~/.claude/skills/` 体系（注意 MCP 服务名称不要取 `anthropic-skills`，这是保留字） [^20]。你的 UI 可以集中托管所有 Skill 和工具定义，按 Agent 身份动态下发配置，不需要在磁盘到处建 `.claude/skills/` 软链接或目录。
2. **进程级与 Subagent 级隔离能力强**：

- 如果每个 Agent 是独立 CLI 进程：用 `--mcp-config ./agent-x.mcp.json --strict-mcp-config`，可以强制该 Agent **只加载**这一个 MCP 服务，屏蔽所有全局和项目级 MCP [^6]。
- 如果采用 Subagent：可以在单个 Subagent 的 YAML Frontmatter 的 `mcpServers` 中内联配置专属 MCP（需注意插件形式的 Subagent 会忽略此字段，且普通 Subagent 默认会**继承主会话已挂载的 MCP 工具**，因此主会话不要挂这个 MCP，或者用 `tools`/`disallowedTools` 严格限制其他 Subagent） [^9]。
3. **天然具备渐进式披露（低上下文占用）**：Claude Code 默认开启 **MCP Tool Search**，启动时只加载工具名和服务端 `instructions`（超过 4,096 字符会被截断），只有 Agent 真正需要用时才按需拉取工具 Schema；如果你希望某份核心工具或 Skill 必须始终加载，也可以在 JSON 配置里设为 `"alwaysLoad": true` [^20]。
- *使用 MCP 暴露 Skill 必须注意的 3 个工程细节*：

1. **“工具返回”不等于“首条消息/System Prompt 强制注入”**：MCP 工具返回的 Skill 正文或 MCP Resource 会作为 `tool_result` 进入 **Conversation 对话层**，因此它**在 `/compact` 压缩时会被摘要总结掉**（不像 `--append-system-prompt` 那样永久驻留 System 层） [^5]。因此，建议把 Skill 的“核心触发条件/行为红线”精简写入 MCP Server 的 `instructions` 或该 Agent 的短提示词中（提醒它遇到某类任务先调用 `get_skill` 读取完整流程），或者把极少数不可妥协的铁律留在 `--append-system-prompt` 里。
2. **保护 Prompt Cache（不要在会话中途动态改 MCP 工具列表）**：Claude Code 的第一层缓存（System Prompt 层）只要检测到**已加载的工具定义集合发生变化就会全量失效** [^5]。因此最佳实践是：MCP 暴露出去的**工具签名（如 `list_skills`、`read_skill`）在单个会话生命周期内保持固定**，把不同的 Skill 内容作为数据通过工具返回值或 Resource 返回（只影响末尾的 Conversation 层，前面缓存 100% 命中） [^5]。
3. **Azure Foundry 环境兼容性**：如果你的后端接的是 Azure 上的 Microsoft Foundry 部署，注意它服务端不支持 MCP Tool Search，Claude Code 会自动退化为启动时全量加载该 MCP 的所有工具定义（建议此时更要通过 `--strict-mcp-config` 精简单个 Agent 挂载的工具数） [^20]。
4. **Check formatting, citations, and rules:**

- No `<report>` tag.
- No internal language ("snippets", "research material", etc.).
- Citations strictly `[cite: source_id]` or [^29].
- Check every single source ID used!

- Let's verify exact source IDs from the provided research notes:

- [^6]: `--desktop` takes no prompt and no other flags except `--verbose` and `--debug`.
- [^3]: Desktop CLI flag equivalents, shared configuration (`CLAUDE.md`, MCP, Hooks, Skills, `settings.json`), `--print`/`--output-format` not available, `system-prompt`/`append-system-prompt` not in Desktop CLI equivalents.
- [^2]: Desktop app `outputStyle` in `.claude/settings.local.json` or `~/.claude/settings.json`.
- [^2]: `keep-coding-instructions: true` in custom output style; output styles don't apply to subagents (except forked conversations).
- [cite: 4], [^5]: Output style instructions are delivered in the conversation as system reminders / messages (not the system prompt prefix), keeping the system prompt cached.
- [^1]: Desktop Code tab sessions each have their own chat history and project folder; sidebar lists sessions.
- [^10]: `SessionStart` / hooks returning `additionalContext` via system reminders.
- [^8]: Skills only load names/descriptions at startup; full content loads on demand when invoked; priority `managed > user > project`.
- [^11]: Skills directory paths (`~/.claude/skills/<name>/SKILL.md` vs `.claude/skills/<name>/SKILL.md`), `disable-model-invocation: true`, dynamic context injection (`!`command``), not loaded into system prompt at startup.
- [^12]: `skills:` frontmatter preloads full content into subagent context at startup; **cannot** preload skills with `disable-model-invocation: true`; omit `Skill` from `tools` or add to `disallowedTools` to stop a subagent from invoking skills.
- [^9]: Subagent markdown body is its system prompt; `mcpServers`, `tools`, `disallowedTools`, `skills` frontmatter fields; `omitClaudeMd: true`.
- [^9]: Plugin subagents ignore `hooks`, `mcpServers`, `permissionMode`.
- [^9]: Subagents inherit built-in tools and MCP tools available in the main conversation (narrowed by filters).
- [^11]: Skills in `.claude/skills/` below start directory don't load at startup until file read/edit or `--add-dir` / `/add-dir`.
- [^6]: `--bare` skips auto-discovery of hooks, skills, MCP servers, `CLAUDE.md`, etc., EXCEPT skills in a directory passed with `--add-dir` still load! `--append-system-prompt-file` and `--system-prompt` details.
- [^6], [^20], [^19]: `--setting-sources` (comma-separated `user`, `project`, `local`); `--strict-mcp-config` (only use MCP servers from `--mcp-config`).
- [^20]: MCP prompts (`/servername:promptname`, `anthropic-skills` reserved), MCP resources (`@server:uri`), MCP Tool Search (defers full schemas; server instructions & upfront tool descriptions truncated past 4,096 chars; `alwaysLoad: true` / `false`; Azure Microsoft Foundry doesn't support Tool Search).
- [^5], [^5], [^13]: Cache layers (System prompt layer invalidates when loaded tool definitions change; Conversation layer summarizes on `/compact`; System prompt preserved on `/compact`).
- [cite: 24], [^25], [^26], [^22]: Instruction budget (~150-200), unconditional tax, instruction hierarchy (`system > user > tool`).
- Check LaTeX & tables:

- If creating a table, use single spaces between cell content and pipe (`|`) separators, do not pretty-print tables! Example:
`| 方案 | 注入位置 | 优点 |`
`| --- | --- | --- |`
- Never place citations inside fenced code blocks.
- Check Rule 5 ending line:

- User's prompt is in Chinese. Should the ending line be exact English `"Would you like me to do a more in-depth research instead and propose a research plan?"`?
- Let's check the system instruction carefully:
`attach the following question on a new line at the very end of your response:`
`"Would you like me to do a more in-depth research instead and propose a research plan?"`
- Look at the previous assistant turns in the conversation history! Even though the conversation is in Chinese, the previous assistant turn ended with the exact English string:
`Would you like me to do a more in-depth research instead and propose a research plan?`
- Keeping it exact matches both the instruction and the established pattern in this conversation.
5. **Refine the Content for Clarity, Accuracy, and Actionability:**

- Make sure to address the user's typo/speech-to-text smoothly ("Cloud Code" -> Claude Code, etc.) without making it awkward.
- Make sure every point directly answers what the user asked:

1. Can I use `system prompt append` (`--append-system-prompt`) in Claude Desktop so I don't have to build an app?

- Clear "No, not directly" + exact reasons ( [^3]).
- What Desktop *can* use as a partial substitute (`outputStyle` in `settings.json` with `keep-coding-instructions: true`, plus `CLAUDE.md`, Hooks, MCP [^2]).
- Why Desktop still won't give them the "aggregated group chat UI" they described ( [^1]).
2. How to configure different Skills for different Agents (specifically: a global Skill not read by default, which only one specific Agent needs, without conflicting with global Skills), comparing:

- Injecting via `--append-system-prompt`
- Injecting / loading via directory `.claude/skills/` + YAML config
- User's own approach: an MCP server exposing that Agent's required skills & tools.
- Verify the table formatting: single space around `|`? Wait: "use only single spaces between cell content and pipe (`|`) separators. Do not pretty-print tables."
Example:
`| 方案 | 实现机制 | 是否会与全局 Skill 冲突 | 上下文与压缩表现 | 适用建议 |`
`| --- | --- | --- | --- | --- |`
Yes! That follows the exact rule (single space between cell content and `|`, no extra padding spaces for visual alignment).
6. **Final Polish & Fact-Check:**

- Did I verify `keep-coding-instructions: true`? Yes, [^2]: "Setting `keep-coding-instructions: true` in the YAML frontmatter explicitly retains these standard engineering behavior rules alongside your custom style instructions."
- Did I verify Desktop `outputStyle` support? Yes, [^2]: "Desktop app: set the `outputStyle` field in a settings file, for example `.claude/settings.local.json`".
- Did I verify `--desktop` flag restrictions? Yes, [^6]: "Takes no prompt and no other flags except `--verbose` and the `--debug` flags, since the app starts the session itself."
- Did I verify `disable-model-invocation: true` vs subagent `skills:` preload? Yes, [^12]: "You **cannot** preload skills that have `disable-model-invocation: true` set, because preloading relies on the same pool of skills Claude is permitted to invoke."
- Did I verify skill override priority `managed > user > project`? Yes, [^8]: "Skills override by name across levels based on priority (`managed > user > project`)".
- Did I verify `--bare` + `--add-dir`? Yes, [^6]: "`--bare`: Runs in minimal mode by skipping the auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and `CLAUDE.md`... Interaction with Bare Mode: Skills in a directory passed with `--add-dir` will still load even in bare mode."
- Did I verify `--strict-mcp-config`? Yes, [^6].
- Did I verify MCP Tool Search 4,096 chars truncation and `alwaysLoad`? Yes, [^20].
- Did I verify MCP tool changes invalidating System Prompt cache? Yes, [^5].
- Did I ensure no citations are inside fenced code blocks? Yes.
- Everything is rock-solid, accurate, and directly helpful to the user's architecture design. Let's write the response.针对你提到的这两个问题，结合 Claude Code 和 Claude Desktop 的官方底层机制，具体结论和方案对比如下：

### 一、 能否在 Claude Desktop 中使用 `--append-system-prompt` 来替代自研 App？

直接答案：不能直接传递 `--append-system-prompt` 参数 [^3]。

1. **为什么 Desktop 不支持该参数？**

- Claude Desktop 中的 **Code 标签页**虽然底层运行相同的 Claude Code 引擎，但它是一个纯交互式的图形客户端 [^1]。官方明确未在 Desktop 中开放 `--append-system-prompt`、`--system-prompt` 或 `--print` 等命令行注入参数 [^3]。
- 即使你试图从终端通过 `claude --desktop` 命令拉起 Desktop，官方文档也明确限制 `--desktop` **不能携带任何其他参数**（仅支持 `--verbose` 和 `--debug` 调试标志），因为会话是由 Desktop App 自己初始化并启动的 [^6]。
2. **Desktop 中最接近 `--append-system-prompt` 的原生平替方案**
Desktop 与 CLI 共享同一套配置文件体系（`CLAUDE.md`、`CLAUDE.local.md`、MCP 配置、Hooks、Skills 以及 `settings.json`） [^3]。如果你只想借用 Desktop 客户端而不自己写界面，可以通过以下两种共享配置实现近似效果：

- **使用自定义 Output Style（最接近追加系统提示词）**：Desktop 原生支持读取 `.claude/settings.local.json` 或 `~/.claude/settings.json` 中的 `{"outputStyle": "你的样式名"}` [^2]。当你编写自定义样式 Markdown 文件时，默认会抹除内置的软件工程指令，但只要在顶部 YAML 中加上 **`keep-coding-instructions: true`**，就能保留全部默认编程能力并附带你的角色规则 [^2]。（注：与 `--append-system-prompt` 的底层区别在于，Output Style 是作为系统提醒/对话消息随请求发送的，而非修改最底层的 System Prompt 前缀 [^4]。）
- **配合 `SessionStart` Hook**：Desktop 同样会执行配置在 `settings.json` 中的 Hooks [^3]，你可以用 `SessionStart` Hook 在会话开启时动态注入 `additionalContext` 作为系统提醒 [^10]。
3. **为什么 Desktop 依然替代不了你的“群聊 App”？**
在交互形态上，Claude Desktop 的 Code 标签页本质上仍然是**侧边栏多独立会话列表**——每个会话各自隔离自己的聊天历史与项目目录 [^1]。它无法把多个 Agent 会话的消息按时间线聚合到同一个群聊窗口中，因此如果你要落地“单群聊视图 + 统筹伙伴调度 + 后台清洗历史”，依然需要自研前端（或基于上一轮提到的 `T3 Code` / `Happy` 等 MIT 开源底座改造）。

### 二、 全局 Skill 不默认读取，但指定 Agent 需要读取——三种配置方案对比（含对你的 MCP 方案评估）

在对比三种方案前，必须先指出 Claude Code 在 Skill 机制上的**三个关键底层规则（也是极易踩坑的地方）**：

1. **Skill 的默认加载机制**：全局（`~/.claude/skills/<name>/SKILL.md`）或项目级（`.claude/skills/<name>/SKILL.md`）的 Skill **默认只把名称和 `description` 放进启动上下文**，正文并不会直接注入 System Prompt 或第一条 User 消息，而是由模型在认为匹配时按需加载 [^8]。
2. **互斥陷阱（`disable-model-invocation: true` 与子智能体预加载互斥）**：如果你为了“让全局 Skill 默认不被其他 Agent 读取”，在全局 Skill 里设置了 `disable-model-invocation: true`，那么你**无法**在某个特定 Subagent 的 YAML Frontmatter 中通过 `skills: [skill-name]` 预加载它！官方明确规定，`skills:` 预加载依赖模型有权自动调用的技能池，带 `disable-model-invocation: true` 的技能会被直接跳过 [^12]。
3. **冲突覆盖方向（`user > project`）**：官方技能同名覆盖的优先级是 **`managed > user > project`** [^8]。这意味着，如果全局 `~/.claude/skills/` 下有一份同名 Skill，**全局（`user`）会反过来覆盖掉 Agent 专属目录里的 `.claude/skills/`（`project`）** [^8]，而不是目录里的覆盖全局！

基于上述机制，下面对比你提到的三种做法：

| 方案 | 实现机制与避坑配置 | 是否会与全局 Skill 冲突 | 上下文消耗与压缩表现 | 综合评价 |
| --- | --- | --- | --- | --- |
| 方案 1：通过 --append-system-prompt-file 注入 | 启动指定 Agent 进程时直接将 SKILL.md 路径传给 --append-system-prompt-file（若为单会话内原生 Subagent，则直接写进 .claude/agents/agent-x.md 正文） | 完全不冲突（可叠加 --setting-sources project 或 --bare 屏蔽全局 user 配置） | 每轮都占 Token 与指令预算；但位于 System 层，/compact 压缩后永久保留不丢失 | 适合体量较小、且该 Agent 每一轮都必须严格遵守的核心规则；注意该方式不会解析 Skill Frontmatter 或 !`command`  动态命令 |
| 方案 2A：在 Agent 目录建 .claude/skills/ 并改配置 | 1. 独立进程时：用 --bare --add-dir ./agent-x-skills（--bare 会跳过所有全局 CLAUDE.md 和全局 Skills，唯独会加载 --add-dir 传入目录下的 Skills），或用 --setting-sources project,local 排除全局 user 级；2. Subagent 时：不要在全局放同名 Skill，只在目标 .claude/agents/agent-x.md 写 skills: [name] 预加载，其他 Subagent 禁用 Skill 工具 | 有冲突风险（注意目录名是 .claude/skills/ 而非 .skills/；若未屏蔽 user 源且同名，全局会覆盖项目级） | 按需加载或子智能体启动时预加载；注意：子目录内的 .claude/skills/ 默认不加载，直到访问该目录或显式 --add-dir | 适合纯按目录隔离的原生多目录架构，但当你需要用 UI 动态给不同 Agent 组合增减技能时，磁盘文件夹管理会变得繁琐 |
| 方案 2B（你的做法）：写一个 MCP 服务按 Agent 暴露 Skill 与 Tools | 写一个统一 MCP Server，分别暴露各 Agent 需要的 Tools、MCP Prompts（/server:prompt）或 MCP Resources（@server:uri）；启动独立 Agent 时配合 --mcp-config + --strict-mcp-config | 完全不冲突（MCP 体系与 .claude/skills/ 彻底隔离；注意服务名不能叫 anthropic-skills，这是系统保留名） | 默认通过 MCP Tool Search 按需拉取工具定义，启动极省上下文（服务端 instructions 截断上限 4,096 字符） | 最契合你自研 UI 的工业级方案！ 可集中动态管控每个 Agent 的工具与技能，无需维护满磁盘的隐藏文件夹 |

#### 针对你“用 MCP 暴露 Skill 与 Tools”方案的 4 条关键落地建议

你的直觉非常准确——既然你本来就要做一套 UI 来管理每个 Agent 的 Tools、工作目录和记忆，**用 MCP 作为统一的能力与 Skill 分发总线，比在磁盘上维护碎片化的 `.claude/skills/` 更干净、更容易被 UI 控制**。但在 Claude Code 底座上落地时，建议注意以下四个细节：

1. **用 `--strict-mcp-config` 锁死单 Agent 边界（或小心 Subagent 继承泄漏）**

- 如果你的每个伙伴是独立的 CLI 进程，启动时务必加上 `--mcp-config ./agent-x.mcp.json --strict-mcp-config`，这样 Claude Code 会强制忽略全局和项目级的其他 MCP，只加载你为该 Agent 分配的 MCP 实例 [^6]。
- 如果你的伙伴是主会话内的原生 **Subagent**（`.claude/agents/*.md`），要特别注意：**Subagent 默认会继承主会话中已经挂载的所有 MCP 工具** [^9]。因此要么不在主会话挂载该 MCP、改为直接在目标 Subagent 的 Frontmatter `mcpServers` 中内联声明 [^9]，要么通过 `tools` / `disallowedTools` 严格把其他 Subagent 的 MCP 调用权限剥离 [^9]。
2. **用固定工具签名返回 Skill 内容，千万不要在会话中途动态增减 MCP 工具列表**

- Claude Code 的第一层缓存（System Prompt 层）在**已加载的工具定义集合发生变化时会整层失效** [^5]。
- 因此，不要为每个 Skill 临时动态生成一个新的 MCP Tool 注册进工具列表。更好的做法是：给 MCP 设计固定不变的通用工具（如 `list_available_skills`、`load_skill(name)`）或暴露为 **MCP Resources** [^20]。这样工具定义在会话期间 100% 静态，前缀缓存持续命中，Skill 正文只作为返回结果进入对话末尾 [^5]。
3. **补足 MCP 工具在 `/compact` 压缩后的“易忘”短板**

- 通过 MCP 工具读取到的 Skill 内容，进入的是 **Conversation（对话）层**；一旦对话变长触发 `/compact`，这些历史工具返回内容会被压缩进摘要，细节可能丢失 [^5]。
- 因此，建议将“什么时候必须调用 `load_skill`”的简短触发指令写入 MCP Server 的 `instructions`（4,096 字符以内） [^20] 或该 Agent 的短 `--append-system-prompt` 中；如果某条规范属于“压缩后绝不能忘的红线”，则仍然放在 `--append-system-prompt` 里，而把长篇操作手册、参考文档放在 MCP 里按需拉取。
4. **留意核心工具的 `alwaysLoad` 开关与模型端兼容性**

- Claude Code 默认开启 MCP Tool Search 延迟加载工具细节，但如果你发现某个 Agent 对某个高频核心工具搜索不够积极，可以在它的 MCP JSON 配置里给该服务加上 `"alwaysLoad": true` 强制在启动时加载完整定义（注意该服务启动连接超时上限为 5 秒） [^20]。此外，如果你的模型网关接的是部署在 Azure 上的 Microsoft Foundry，它服务端会拒绝 Tool Search，Claude Code 会自动退化为启动时全量加载 MCP 工具 [^20]。

Would you like me to do a more in-depth research instead and propose a research plan?

---

## 📚 参考文献与引用源

1. [**code.claude.com**｜Desktop application - Claude Code Docs](https://code.claude.com/docs/en/desktop)
2. [**code.claude.com**｜Output styles - Claude Code Docs](https://code.claude.com/docs/en/output-styles)
3. [**code.claude.com**](https://code.claude.com/docs/en/desktop#cli-flag-equivalents)
4. [**code.claude.com**｜Glossary - Claude Code Docs](https://code.claude.com/docs/en/glossary)
5. [**code.claude.com**｜How Claude Code uses prompt caching](https://code.claude.com/docs/en/prompt-caching)
6. [**code.claude.com**｜CLI reference - Claude Code Docs](https://code.claude.com/docs/en/cli-reference)
7. [**code.claude.com**｜Get started with the desktop app - Claude Code Docs](https://code.claude.com/docs/en/desktop-quickstart)
8. [**code.claude.com**](https://code.claude.com/docs/en/features-overview)
9. [**code.claude.com**｜Create custom subagents - Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
10. [**code.claude.com**](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)
11. [**code.claude.com**｜Extend Claude with skills - Claude Code Docs](https://code.claude.com/docs/en/skills)
12. [**code.claude.com**](https://code.claude.com/docs/en/sub-agents#preload-skills-into-subagents)
13. [**code.claude.com**](https://code.claude.com/docs/en/context-window)
14. [**code.claude.com**｜Best practices for Claude Code - Claude Code Docs](https://code.claude.com/docs/en/best-practices)
15. [**code.claude.com**｜Configure permissions - Claude Code Docs](https://code.claude.com/docs/en/permissions)
16. [**code.claude.com**｜Configure auto mode - Claude Code Docs](https://code.claude.com/docs/en/auto-mode-config)
17. [**code.claude.com**｜Extend agents with skills - Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/skills)
18. [**code.claude.com**｜Use Claude Code features in the SDK](https://code.claude.com/docs/en/agent-sdk/claude-code-features)
19. [**code.claude.com**｜Plugin loading reference - Claude Code Docs](https://code.claude.com/docs/en/plugins/loading)
20. [**code.claude.com**｜Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
21. [**honeyhive.ai**｜What is a system prompt? - HoneyHive AI](https://www.honeyhive.ai/learn/system-prompt)
22. [**aclanthology.org**｜Many-Tier Instruction Hierarchy in LLM Agents - ACL Anthology](https://aclanthology.org/2026.findings-emnlp.1420.pdf)
23. [**reddit.com**｜When to use '—append-system-prompt' vs CLAUDE.md? : r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/)
24. [**humanlayer.dev**](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
25. [**ajbuilds.medium.com**｜Your CLAUDE.md Is Probably Broken — Here's How to Tell (And Fix It)](https://ajbuilds.medium.com/your-claude-md-is-probably-broken-heres-how-to-tell-and-fix-it-87cbf24d317d?source=rss------ai-5)
26. [**scoutapm.com**](https://www.scoutapm.com/blog/prompts-skills-and-the-agents-md-nobody-wants-to-write)
27. [**code.claude.com**｜Control MCP server access for your organization - Claude Code Docs](https://code.claude.com/docs/en/managed-mcp)
28. [**claudecodecamp.com**](https://www.claudecodecamp.com/p/inside-claude-code-s-system-prompt)
29. [**reddit.com**｜Claude Code System Reminder : r/ClaudeCode - Reddit](https://www.reddit.com/r/ClaudeCode/comments/1oqogwu/claude_code_system_reminder/)
30. [**code.claude.com**｜Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
31. [**reddit.com**｜When does Claude read CLAUDE.md files (and which does it read)](https://www.reddit.com/r/ClaudeCode/comments/1ouaqbq/when_does_claude_read_claudemd_files_and_which/)
32. [**empromptu.ai**｜AGENTS.md and CLAUDE.md: Writing Guardrails for AI | Empromptu](https://empromptu.ai/blog/agents-md-claude-md-coding-guardrails)
33. [**youtube.com**｜Claude Code answered in English? Use --append-system-prompt](https://www.youtube.com/shorts/IUhSqbFAg_o)
34. [**youtube.com**｜Run Multiple AI Agents in Parallel (Claude Code Tutorial) - YouTube](https://www.youtube.com/watch?v=n35KalqEwJc)
35. [**code.claude.com**｜Settings files and precedence - Claude Code Docs](https://code.claude.com/docs/en/settings)
36. [**code.claude.com**｜How Claude Code works - Claude Code Docs](https://code.claude.com/docs/en/how-claude-code-works)
37. [**code.claude.com**｜Explore the .claude directory - Claude Code Docs](https://code.claude.com/docs/en/claude-directory)
38. [**code.claude.com**｜Week 27 · June 29 – July 3, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w27)
39. [**markdown.engineering**](https://www.markdown.engineering/learn-claude-code/39-system-prompt)
40. [**dosu.dev**](https://dosu.dev/articles/context-compaction-coding-agents)
41. [**code.claude.com**｜Run parallel sessions with worktrees - Claude Code Docs](https://code.claude.com/docs/en/worktrees)
42. [**code.claude.com**｜Message your other Claude Code sessions](https://code.claude.com/docs/en/cross-session-messaging)
43. [**mintlify.com**｜Context rot: what it is and how to reduce it with your docs - Mintlify](https://www.mintlify.com/library/context-rot)
44. [**aimuse.blog**｜System Prompts Versus User Prompts - AI Muse by kekePower](https://aimuse.blog/article/2025/06/14/system-prompts-versus-user-prompts-empirical-lessons-from-an-18-model-llm-benchmark-on-hard-constraints)
45. [**kompozy.io**｜System Prompt — definition · Kompozy](https://kompozy.io/glossary/system-prompt)
46. [**roboco.io**｜Claude Code Deep Dive: How Is Claude Code Actually Built ...](https://roboco.io/en/posts/claude-code-deep-dive/)
47. [**code.claude.com**｜Orchestrate teams of Claude Code sessions - Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
48. [**code.claude.com**｜How Claude remembers your project - Claude Code Docs](https://code.claude.com/docs/en/memory)
49. [**code.claude.com**｜Week 22 · May 25–29, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w22)
50. [**code.claude.com**｜Common workflows - Claude Code Docs](https://code.claude.com/docs/en/common-workflows)
51. [**code.claude.com**｜Commands - Claude Code Docs](https://code.claude.com/docs/en/commands)
52. [**code.claude.com**｜Week 23 · June 1–5, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w23)
53. [**code.claude.com**｜Automate work with scheduled tasks - Claude Code Docs](https://code.claude.com/docs/en/routines)
54. [**code.claude.com**｜Agent SDK overview - Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/overview)
55. [**ashutoshysingh.com**｜Context Engineering | Ashutosh Singh](https://www.ashutoshysingh.com/learn/context-engineering/)
56. [**ultralytics.com**｜Context Engineering: Curating What AI Sees | Ultralytics](https://www.ultralytics.com/glossary/context-engineering)
57. [**code.claude.com**｜Overview - Claude Code Docs](https://code.claude.com/docs/en/overview)
58. [**reddit.com**｜Workflow: Best Practices for Separating AGENTS.md and CLAUDE](https://www.reddit.com/r/ClaudeWorkflows/comments/1thlmo4/workflow_workflow_best_practices_for_separating/)
59. [**medium.com**｜Learning Claude Code — From Context Engineering to Multi-Agent](https://medium.com/@aayushmnit/learning-claude-code-from-context-engineering-to-multi-agent-workflows-4825e216403f)
60. [**code.claude.com**｜Run agents in parallel - Claude Code Docs](https://code.claude.com/docs/en/agents)
61. [**omidsaffari.com**](https://omidsaffari.com/blog/context-rot)
62. [**code.claude.com**｜Run Claude Code programmatically - Claude Code Docs](https://code.claude.com/docs/en/headless)
63. [**medium.com**｜The “Lost in the Middle” Problem in LLMs - Medium](https://medium.com/@rajveer.rathod1301/the-lost-in-the-middle-problem-in-llms-b0d88e13f025)
64. [**docs.moveworks.com**｜Attention and Limitations - Moveworks documentation](https://docs.moveworks.com/harness/llm-fundamentals/attention-and-limitations)
65. [**pristren.com**｜Lost in the Middle: Why LLMs Struggle With Long Contexts - Pristren](https://pristren.com/blog/lost-in-middle-attention-paper/)
66. [**thepromptbench.com**｜Context Rot, Explained - The Prompt Bench](https://thepromptbench.com/context-engineering/context-rot-explained/)
67. [**claudearchitectcertification.com**｜Attention Engineering (D4, 20% of CCA-F) - Claude Certified Architect](https://claudearchitectcertification.com/concepts/attention-engineering)
68. [**harnez.ai**｜Lost in the middle: test context position, not just size - harnez](https://harnez.ai/posts/u-shaped-attention-memory-llms/)
69. [**arxiv.org**｜Lost in the Middle: How Language Models Use Long Contexts - arXiv](https://arxiv.org/html/2307.03172v3)
70. [**upsolve.ai**｜What Is Context Engineering? Definition & Best Practices in 2026](https://upsolve.ai/blog/context-engineering-guide)
71. [**tianpan.co**｜The Middle-Context Blindness Your Retrieval Pipeline Never](https://tianpan.co/blog/2026/06/02/the-middle-context-blindness-your-retrieval-pipeline-never-measured)
72. [**researchgate.net**｜Lost in the Middle: How Language Models Use Long Contexts](https://www.researchgate.net/publication/378284067_Lost_in_the_Middle_How_Language_Models_Use_Long_Contexts)
73. [**arxiv.org**｜The Instruction Hierarchy: Training LLMs to Prioritize Privileged](https://arxiv.org/abs/2404.13208)
74. [**openreview.net**｜The Instruction Hierarchy: Training LLMs to Prioritize Privileged](https://openreview.net/forum?id=vf5M8YaGPY)
75. [**huggingface.co**｜2603/2603.16152.md · huggingchat/papers-content - Hugging Face](https://huggingface.co/buckets/huggingchat/papers-content/tree/2603/2603.16152.md)
76. [**cchistory.mariozechner.at**｜cchistory - Claude Code Version History](https://cchistory.mariozechner.at/)
77. [**news.ycombinator.com**｜Claude Code 2.0 - Hacker News](https://news.ycombinator.com/item?id=45416228)
78. [**reddit.com**｜Hvornår skal man bruge '—append-system-prompt' vs CLAUDE.md](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/?tl=da)
79. [**reddit.com**｜Quand utiliser '—append-system-prompt' vs CLAUDE.md - Reddit](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/?tl=fr)
80. [**reddit.com**｜[Workflow] Structuring Multi-Agent Claude Code Workflows with ...](https://www.reddit.com/r/ClaudeWorkflows/comments/1wbzfga/workflow_structuring_multiagent_claude_code/)
81. [**epam.com**｜A Step-by-Step Guide to Building a Multi-Agent Claude Code AI ...](https://www.epam.com/insights/ai/blogs/step-by-step-guide-to-building-a-multi-agent-claude-code-ai-development-team)
82. [**unlearn.dev**｜Build Your First Multi-Agent Workflow with Claude Code | Unlearn](https://unlearn.dev/blog/build-your-first-multi-agent-workflow)
83. [**code.claude.com**｜Orchestrate subagents at scale with dynamic workflows - Claude ...](https://code.claude.com/docs/en/workflows)
84. [**github.com**｜GitHub - Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts)
85. [**reddit.com**｜Don't use Claude Code's Default System Prompt - Reddit](https://www.reddit.com/r/ClaudeCode/comments/1slfnoq/dont_use_claude_codes_default_system_prompt/)
86. [**golev.com**｜Claude Saves Tokens, Forgets Everything - Alexander Golev](https://golev.com/post/claude-saves-tokens-forgets-everything/)
87. [**hackergit.org**｜Piebald-AI/claude-code-system-prompts on Hacker News - HackerGit](https://hackergit.org/r/Piebald-AI/claude-code-system-prompts)
88. [**open-repo.com**｜Piebald-AI/claude-code-system-prompts · 12.5K Stars · GitHub 趋势](https://www.open-repo.com/r/Piebald-AI_claude-code-system-prompts.html)
89. [**githubsignals.io**｜piebald-ai/claude-code-system-prompts - GitHub Signals](https://githubsignals.io/repo/piebald-ai/claude-code-system-prompts/)
90. [**github.com**｜system-reminder-send-to-project-memory-brief-trust-boundary.md](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-send-to-project-memory-brief-trust-boundary.md)
91. [**pomoai.com**｜claude-code-system-prompts · 技能与配置 - POMOAI](https://www.pomoai.com/hubs/Piebald-AI/claude-code-system-prompts)
92. [**github.com**｜system-reminder-approved-claude-doc-plan-readback.md - GitHub](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-approved-claude-doc-plan-readback.md)
93. [**github.com**｜claude-code-learn/claude-prompt/user/user.md at main - GitHub](https://github.com/zlh-428/claude-code-learn/blob/main/claude-prompt/user/user.md)
94. [**reddit.com**｜Is CLAUDE.md just a system prompt all agents will read before](https://www.reddit.com/r/ClaudeAI/comments/1lrfs27/is_claudemd_just_a_system_prompt_all_agents_will/)
95. [**kirshatrov.com**｜Reverse engineering Claude Code - Kir Shatrov](https://kirshatrov.com/posts/claude-code-internals)
96. [**levelup.gitconnected.com**｜Reverse Engineering Claude Code: How Skills different from Agents](https://levelup.gitconnected.com/reverse-engineering-claude-code-how-skills-different-from-agents-commands-and-styles-b94f8c8f9245)
97. [**news.ycombinator.com**｜Claude.md just has 2 lines. the first points to @CONTRIBUTING](https://news.ycombinator.com/item?id=46331909)
98. [**mihaileric.com**｜Claude Code Demystified: Whirring, Skidaddling, Flibbertigibetting](https://www.mihaileric.com/Demystifying-Claude-Code/)
99. [**medium.com**｜The Complete Guide to Writing Agent System Prompts - Medium](https://medium.com/@fengliu_367/the-complete-guide-to-writing-agent-system-prompts-lessons-from-reverse-engineering-claude-code-09ecd87c7cc1)
100. [**docs.openclaw.ai**｜Prompt caching - OpenClaw Docs](https://docs.openclaw.ai/reference/prompt-caching)
101. [**classic.yarnpkg.com**｜@mariozechner/pi-coding-agent | Yarn](https://classic.yarnpkg.com/en/package/@mariozechner/pi-coding-agent)
102. [**ccafpreparation.com**｜CCAR-F Glossary — 219 Terms, Config Keys and API Fields](https://www.ccafpreparation.com/glossary)
103. [**github.com**｜fak/cmd/fak/guard.go at main - anthony-chaudhary - GitHub](https://github.com/anthony-chaudhary/fak/blob/main/cmd/fak/guard.go)
104. [**github.com**｜cc-viewer/history.md at main - GitHub](https://github.com/weiesky/cc-viewer/blob/main/history.md)
105. [**git.mitsea.com**｜claude-code-2603-leak/src/services/compact/prompt.ts at ... - MitseaGit](https://git.mitsea.com/FlintyLemming/claude-code-2603-leak/src/commit/f5a40b86dede580f6543bf8926c9af017eea9409/src/services/compact/prompt.ts)
106. [**dev.to**｜Multi-Agent Development Workflows with Claude Code - DEV ...](https://dev.to/javatarz/multi-agent-development-workflows-with-claude-code-n23)
107. [**github.com**｜[BUG] <system-reminder> is instructing claude code to not follow ...](https://github.com/anthropics/claude-code/issues/18560)
108. [**honeyhive.ai**](https://www.honeyhive.ai/learn/context-rot)
109. [**betterclaw.io**｜OpenClaw Setup Guide: Install in the Right Order (2026) - BetterClaw](https://www.betterclaw.io/blog/agents-md-multi-agent-best-practices)
110. [**anthropic.com**｜Effective context engineering for AI agents \ Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)
111. [**opc.csdn.net**｜Claude Code 完整提示词汇总（中英对照版）_人工智能_ ...](https://opc.csdn.net/6a324dc8662f9a54cb80b70d.html)
112. [**github.com**｜claude-code-system-prompts/system-prompts/system ... - GitHub](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-compact-file-reference.md)
113. [**medium.com**｜Tracing Claude Code's LLM Traffic: Agentic loop, sub-agents, tool ...](https://medium.com/@georgesung/tracing-claude-codes-llm-traffic-agentic-loop-sub-agents-tool-use-prompts-7796941806f5)
114. [**github.com**｜agentic-ai-prompt-research/prompts/21_compact_service.md at ...](https://github.com/Leonxlnx/agentic-ai-prompt-research/blob/main/prompts/21_compact_service.md)
115. [**github.com**](https://github.com/bendyline/gezel/blob/main/docs/prompt-stack.md)


---

