---
doc_id: DOCS_PASEO_INDEX
status: CURRENT
name: paseo-index
version: 1.2.0
last_verified: 2026-11-18
language: en-US
description: Branch index for Paseo plugin specs: bots configuration, storage topology, teamwork seats, session blackboards, fallback models, workflow DAG engine, and routing. Routes only.
type: DOCS_BRANCH_INDEX
parent_node: ../INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [docs/INDEX.md, docs/README.md, docs/_conventions.md]
---

# [0] ROOT: PASEO SPECIFICATIONS BRANCH INDEX

## [1] ROUTES: CURRENT TRUTH AND RUNTIME
- [1.1] [configuration-and-storage](paseo-bots-configuration-and-storage.md) :: [LOAD_IF: Paseo plugin settings, bots.json version 4 envelope, symlink/junction topology, 11 bots roster, 5 teams, agy-agents sync, or propose_changes client quirk]
- [1.2] [fallback-models](same-provider-fallback-models.md) :: [LOAD_IF: same-provider fallback models, FallbackModelSchema, isFallbackEligibleError, resolveCandidateModels, runWithModelFallback, startBotChat retry, or UI model settings]
- [1.3] [partner-settings-ui](paseo-bots-partner-settings-ui.md) :: [LOAD_IF: PartnerSettingsModal two-row selector, BotPanel embedded mode, or TeamMap onOpenBot landing state]
- [1.4] [workflow-engine-and-routing](paseo-bots-workflow-engine-and-routing.md) :: [LOAD_IF: workflow engine, run_workflow tool, WorkflowDefinition, validateWorkflowDAG, subagent routing, resolveStepEngine, task_brief, SESSION_BOARD, TASK_MANIFEST, worker_handoff, repair_brief, bots.workflows.runs, WorkflowsScreen live monitor, or assertNotGlobalUserConfig]
- [1.5] [teamwork-workspace-and-session-architecture](paseo-bots-teamwork-workspace-and-session-architecture.md) :: [LOAD_IF: teamwork agent seats, session blackboard, DM vs teamwork cwd, targetProjectDirs, dynamic session prompt assembly, resolveSessionRole, syncSeatSkills, or file-backed workflow handoffs]

## [2] ROUTES: HISTORICAL AND INTEGRATION EVIDENCE
- [2.1] [legacy-sdk-integration](../architecture/paseo-architecture-and-claude-agent-sdk-integration.md) :: [LOAD_IF: legacy reference for Paseo frontend-backend decoupling and Claude Agent SDK integration]
