import os
import re
import json

base_dir = "/Users/xr/.gemini/antigravity/scratch/claude-code-mod/piebald-claude-code-system-prompts/system-prompts"
out_json_path = "/Users/xr/.gemini/antigravity/scratch/claude-code-mod/claude_code_all_prompts_for_gemini4.json"
out_summary_md_path = "/Users/xr/.gemini/antigravity/scratch/claude-code-mod/PROMPTS_CATALOG_FOR_GEMINI4.md"

def parse_prompt_file(filepath):
    filename = os.path.basename(filepath)
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    # Parse metadata comment
    meta = {
        "id": filename.replace(".md", ""),
        "filename": filename,
        "name": "",
        "description": "",
        "ccVersion": "",
        "variables": [],
        "category": "",
        "subcategory": "",
        "body": ""
    }

    # Determine category
    parts = filename.replace(".md", "").split("-")
    cat = parts[0]
    subcat = parts[1] if len(parts) > 1 else "general"
    meta["category"] = cat
    meta["subcategory"] = subcat

    # Extract comment metadata <!-- ... -->
    m = re.search(r"<!--\s*(.*?)\s*-->", content, re.DOTALL)
    if m:
        comment_block = m.group(1)
        for line in comment_block.split("\n"):
            line = line.strip()
            if line.startswith("name:"):
                meta["name"] = line.split(":", 1)[1].strip().strip('"\'')
            elif line.startswith("description:"):
                meta["description"] = line.split(":", 1)[1].strip().strip('"\'')
            elif line.startswith("ccVersion:"):
                meta["ccVersion"] = line.split(":", 1)[1].strip().strip('"\'')
        
        # Variables
        var_match = re.search(r"variables:\s*\n((?:\s*-\s*.*?\n)+)", comment_block)
        if var_match:
            vars_lines = var_match.group(1).strip().split("\n")
            meta["variables"] = [v.strip().lstrip("-").strip().strip('"\'') for v in vars_lines if v.strip()]

        body = content[m.end():].strip()
    else:
        body = content.strip()

    meta["body"] = body
    meta["token_estimate"] = len(body) // 4  # rough token estimate
    return meta

all_prompts = []
files = sorted([f for f in os.listdir(base_dir) if f.endswith(".md")])

print(f"Scanning {len(files)} prompt files...")
category_counts = {}

for f in files:
    fp = os.path.join(base_dir, f)
    parsed = parse_prompt_file(fp)
    all_prompts.append(parsed)
    cat = parsed["category"]
    category_counts[cat] = category_counts.get(cat, 0) + 1

output_data = {
    "version": "Claude Code v2.1.326",
    "total_prompts": len(all_prompts),
    "category_distribution": category_counts,
    "description": "Claude Code 全量 System Prompts、Tool Descriptions、Agent Prompts、Reminders 与拼装语句总库，专门组织供 Gemini 4 进行专业润色与语义升级",
    "assembly_architecture": {
        "runtime_pipeline": "6-layer runtime: Static Section Cache (Pre-Dynamic Boundary) -> Dynamic Sections -> Effective System Prompt Priority Resolver -> Runtime Context (CLAUDE.md / gitStatus) -> Addendums -> Specialized Protocols (Compact, Memory)",
        "priority_order": "0. Override -> 1. Coordinator -> 2. Agent -> 3. Custom -> 4. Default -> AppendSystemPrompt (always added at end)",
        "cache_boundary": "__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__ splits cross-org global cached prefix from session-variant dynamic suffix"
    },
    "prompts": all_prompts
}

with open(out_json_path, "w", encoding="utf-8") as fp:
    json.dump(output_data, fp, ensure_ascii=False, indent=2)

print(f"Successfully generated {out_json_path} ({len(all_prompts)} prompts)")
print("Category breakdown:")
for k, v in sorted(category_counts.items()):
    print(f"  - {k:20s}: {v}")
