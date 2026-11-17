<!--
name: "Tool Description: Skill-scoped git push refusal"
description: "Explains that an active skill rejects dangerous or bypassing git push forms, permits a plain push to the configured remote, and forbids evasion or silent substitution"
ccVersion: "2.1.319"
variables:
  - "ACTIVE_SKILL_REFUSAL_SUBJECT"
  - "EXPLICITLY_REQUESTED_REFUSED_FORM_GUIDANCE"
-->
${ACTIVE_SKILL_REFUSAL_SUBJECT} refuses `git push` forms that force, delete, mirror, or prune refs, set push options, skip the pre-push hook, or name a receive-pack (tokens starting `--force`, ` -f`, ` +`, `--de`, ` -d`, ` :`, `--m`, `--pru`, `--pu`, ` -o`, `--no-veri`, `--rece`, `--e`). Plain branch pushes to the configured remote are allowed.

Because matching runs on command text, ref names containing these fragments also trigger refusal; inform the user rather than rewriting the command to bypass the check. ${EXPLICITLY_REQUESTED_REFUSED_FORM_GUIDANCE}
