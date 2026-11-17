<!--
name: "Skill: Claude API deprecated or retired models notice"
description: "Lists deprecated or retired Claude API models detected in the project and defines single-mention disclosure rules"
ccVersion: "2.1.321"
variables:
  - "RETIRING_MODELS"
  - "RETIRING_MODEL_ENTRY"
  - "DETECTED_MODEL_FAMILIES"
  - "FORMATTED_RETIREMENT_DATE"
  - "RETIREMENT_DATE_FORMATTER"
  - "DATE_CLASS"
  - "MODEL_ID"
  - "TODAY_ISO_DATE"
  - "CURRENT_MODEL_FAMILY_LABELS"
  - "SKILL_MODEL_VARS"
  - "SHOULD_SUGGEST_MIGRATE_COMMAND"
-->
## Deprecated or Retired Models in This Project

Detected deprecated or retired Claude API models in project files:

${RETIRING_MODELS.filter((RETIRING_MODEL_ENTRY)=>DETECTED_MODEL_FAMILIES.includes(RETIRING_MODEL_ENTRY.family)).map((RETIRING_MODEL_ENTRY)=>{let FORMATTED_RETIREMENT_DATE=RETIREMENT_DATE_FORMATTER.format(new DATE_CLASS(`${RETIRING_MODEL_ENTRY.date}T00:00:00Z`));return`- ${RETIRING_MODEL_ENTRY.name} (${RETIRING_MODEL_ENTRY.ids.map((MODEL_ID)=>``${MODEL_ID}``).join(", ")}): ${RETIRING_MODEL_ENTRY.status==="deprecated"&&TODAY_ISO_DATE<=RETIRING_MODEL_ENTRY.date?`deprecated; it retires on ${FORMATTED_RETIREMENT_DATE}`:`retired on ${FORMATTED_RETIREMENT_DATE}, so Claude API requests to it fail`}. Current ${CURRENT_MODEL_FAMILY_LABELS[RETIRING_MODEL_ENTRY.current]} model: `${SKILL_MODEL_VARS[RETIRING_MODEL_ENTRY.current]}`.`}).join(`
`)}

<deprecation_disclosure_rule>
- **When to Mention**: On first read, write, or execution of code calling one of these models, notify the user **once** in a concise note covering status, date, current replacement model${SHOULD_SUGGEST_MIGRATE_COMMAND?", and `/claude-api migrate`":""} (dates apply to first-party Claude API; Bedrock/Vertex maintain separate schedules). Ignore occurrences in docs, changelogs, tests, or third-party code.
- **Mutation Boundary**: Leave existing model IDs in user code untouched unless asked to migrate or fix errors they cause; always use current models in newly authored code.
</deprecation_disclosure_rule>
