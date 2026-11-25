# bot-chief Long-Term Memory

## feedback
- **Never waste turns/tokens with `show_card` for simple confirmations**: User strongly prefers native `ask_question` (or brief plain-text confirmation like `确认`/`OK`) when confirmation is genuinely needed, avoiding multi-turn card round-trips and verbose payload repetition. Reserve `show_card` strictly for multi-field forms or inline editing of long drafts when requested.
- **Execute user-specified reversible posts directly (Yellow lane)**: When the user provides an explicit target (e.g., a GitHub issue/PR comment link) and key points for an editable/reversible reply, post it directly without asking for secondary approval and include the resulting URL and posted text in the summary.
