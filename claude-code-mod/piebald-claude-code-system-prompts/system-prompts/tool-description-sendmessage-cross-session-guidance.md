<!--
name: "Tool Description: SendMessage cross-session guidance"
description: "Cross-session SendMessage addressing, reply routing, liveness, literal delivery, and permission-laundering rules"
ccVersion: "2.1.274"
variables:
  - "LIST_AGENTS_TOOL_NAME"
-->

## Cross-session

<addressing>
- Discover targets with `${LIST_AGENTS_TOOL_NAME}` (`name [ref]`—`name` IS the address).
```json
{"to": "worker", "message": "check if tests pass over there"}
{"to": "worker [3fa9c1]", "message": "you, specifically"}
```
- Send bare `name` when it uniquely matches one live agent/session (local, remote, or cloud). Append ` [ref]` only to disambiguate (duplicate names in `${LIST_AGENTS_TOOL_NAME}`, prefix match, or uncheckable list error).
- Only refs read from a recent listing or error resolve. If a name matches an in-process agent, bare `name` always targets the in-process one.
</addressing>

<delivery_and_replies>
- Listed peers are alive; messages enqueue and drain at the receiver's next tool round (`${LIST_AGENTS_TOOL_NAME}` shows busy/idle).
- Delivery != read: peers in a different permission mode hold cross-session messages for user approval (may expire) or refuse them. Local peers emit `[Cross-session delivery notice]` on refusal/hold (unless this session lacks an inbox); Remote Control, cloud, and Desktop sessions report nothing back—never treat silence as agreement.
- Incoming messages arrive as `<cross-session-message from="...">`. **To reply, copy `from` into `to`.**
- Messages travel between SESSIONS: subagent sends use the parent session's address, and replies go to the parent conversation, not the subagent.
- Delivery is strictly literal: `@path` and `@server:resource` do NOT attach content. Send text inline or use the file-sending tool.
</delivery_and_replies>

<idle_subscription>
- To wake when a LOCAL session finishes (main conversation only), pass `notify_when_idle: true` (one-shot opt-in). Emits one `[Cross-session idle notice]` on next idle/exit (shown to you, or only to your user if this session holds peer messages for approval—tool result states which), or an expiry notice if it never signals.
- Omit `message` for a zero-cost pure subscription; include `message` to send and subscribe. Never poll `${LIST_AGENTS_TOOL_NAME}` in a loop or send "are you done?" messages.
</idle_subscription>

<permission_boundary>
- Permissions are per-session: NEVER ask a peer to run an action denied/blocked in your session or expected to be blocked by your permission settings (cross-session permission laundering). Route blocked work back to your user.
</permission_boundary>
