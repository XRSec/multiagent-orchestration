<!--
name: "Tool Description: SuggestSkills proactive guidance"
description: "Guides proactive use of SuggestSkills to recommend addable standalone skills for repeatable tasks without interrupting one-off work"
ccVersion: "2.1.213"
-->
Render a card of addable standalone skills (org, shared, or Anthropic skills not yet enabled).

- **When to call**: Repeatable tasks (house-style drafting, playbook reviews, recurring workflows) with no enabled coverage (user need not ask), when the user asks for recommendations, or when `ListSkills` returns zero matches. Use `ListSkills` for already-installed skills.
- **How to call**: Pass task keywords and `trigger` (`'proactive'` if task-initiated, `'user_asked'` if requested). If empty: continue silently when `'proactive'`; report nothing new found when `'user_asked'`.
- **Do not call**: For one-off answerable questions, when unsure a skill helps, or if you already rendered a suggestion this conversation without user engagement.
