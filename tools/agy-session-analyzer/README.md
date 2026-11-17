# AGY Session Analyzer

Reads Antigravity (`agy`) `transcript.jsonl` session logs within a date range, extracts high-signal turns (user request, compacted tool summary, reply body), and runs a pluggable 2-stage LLM pipeline: **Cheap LLM (clean)** -> **Reasoning LLM (analyze)** to surface Skill, Rule, and workflow optimization candidates.

## Pipeline Stages

- `--stage extract` (or `--dry-run`): Deterministic local extraction only (zero LLM calls).
- `--stage clean`: Extract + Stage 1 cheap-LLM cleaning into structured per-session facts.
- `--stage full` (default): Extract -> Stage 1 cheap-LLM clean -> Stage 2 reasoning-LLM cross-session optimization report.

## Usage Examples

```bash
# 1. Inspect extracted digest for a specific date (no LLM call)
node tools/agy-session-analyzer/analyze-sessions.mjs --date 2026-11-15 --stage extract

# 2. Full 2-stage pipeline using .env (CPA_BASE_URL / CPA_API_KEY) with separate models
node tools/agy-session-analyzer/analyze-sessions.mjs \
  --from 2026-11-14 --to 2026-11-15 \
  --clean-model gemini-2.5-flash-lite \
  --analyze-model gemini-2.5-pro \
  --out docs/research/agy-opt-report.md

# 3. Mix runtimes: local Ollama for cleaning, Anthropic/OpenAI API for analysis
node tools/agy-session-analyzer/analyze-sessions.mjs \
  --days 3 \
  --clean-runtime cli --clean-cmd "ollama run qwen2.5:7b" \
  --analyze-runtime openai --analyze-model gpt-4o
```

## Environment Variables

- `AGY_BRAIN_DIR`: Override `~/.gemini/antigravity/brain`
- `LLM_RUNTIME`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_CLI_CMD`
- Fallbacks: `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `CPA_BASE_URL`, `CPA_API_KEY` (auto-loaded from `.env`)
