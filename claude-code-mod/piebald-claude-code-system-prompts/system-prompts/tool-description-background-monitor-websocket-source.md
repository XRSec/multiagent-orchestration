<!--
name: "Tool Description: Background monitor WebSocket source"
description: "WebSocket (ws) source for Monitor: streams incoming text frames as notification events without a shell"
ccVersion: "2.1.195"
-->

**`ws` source**: Open a WebSocket and stream each incoming text frame as an event (no shell or polling):

```js
Monitor({
  ws: {url: 'wss://events.example.com/stream', protocols: ['v1']},
  description: 'deploy events',
})
```

- **Frames**: One text frame = one notification (multiline stays one event). Binary frames report as `[binary frame, N bytes]`.
- **Lifecycle & limits**: Socket close ends the watch (close code surfaced; errors surfaced before close). Same rate limiting as bash — subscribe to filtered feeds to avoid suppression/termination.
- **When to use**: Prefer `ws` over `command: 'websocat wss://…'` (avoids extra process and line-buffering issues). Use bash only when shell tools must transform/filter frames before emitting events.
