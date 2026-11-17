<!--
name: "Skill: Update config all settings index"
description: "Appends top-level settings.json key index and instructs reading schema/<key>.json before writing unfamiliar keys"
ccVersion: "2.1.326"
variables:
  - "OBJECT_GLOBAL"
  - "SETTINGS_SCHEMA"
  - "SETTING_KEY"
  - "SETTING_SCHEMA"
  - "SETTING_DESCRIPTION"
  - "TRUNCATE_TEXT_FN"
  - "MAX_SETTING_DESCRIPTION_LENGTH"
-->
## All Settings

Top-level `settings.json` keys with description previews. Before writing any key whose exact shape is not shown above, `Read` `schema/<key>.json` in this skill's base directory (e.g., `schema/sandbox.json`) for the full description and JSON schema; read only needed keys. The directory does not survive resume: if `Read` fails, reload this skill.

${OBJECT_GLOBAL.entries(SETTINGS_SCHEMA.properties??{}).map(([SETTING_KEY,SETTING_SCHEMA])=>{let SETTING_DESCRIPTION=typeof SETTING_SCHEMA==="object"?SETTING_SCHEMA.description??OBJECT_GLOBAL.keys(SETTING_SCHEMA.properties??{}).join(", "):"";return`- ${SETTING_KEY}: ${TRUNCATE_TEXT_FN(SETTING_DESCRIPTION,MAX_SETTING_DESCRIPTION_LENGTH)}`}).join(`
`)}