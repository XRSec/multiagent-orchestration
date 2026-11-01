# Machine Action Protocol (MAP) Specification

The Machine Action Protocol (MAP) defines deterministic JSON envelopes emitted by subagents during headless CLI execution.

## 1. Delimiter Syntax

Every MAP packet must be encapsulated between exact comment tags on separate lines:

```text
<!-- CINDY_MAP:BEGIN -->
{
  ...
}
<!-- CINDY_MAP:END -->
```

## 2. JSON Schema Definition

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MachineActionProtocolPacket",
  "type": "object",
  "required": ["version", "action", "sender", "target", "task_id", "payload"],
  "properties": {
    "version": {
      "type": "string",
      "enum": ["1.0.0"]
    },
    "action": {
      "type": "string",
      "enum": ["RELAY", "DISPATCH", "P2P_QUERY", "MENTION_ASSIGN", "COMPLETE"]
    },
    "sender": {
      "type": "string"
    },
    "target": {
      "type": "string"
    },
    "task_id": {
      "type": "string"
    },
    "payload": {
      "type": "object",
      "required": ["summary"],
      "properties": {
        "summary": { "type": "string" },
        "artifacts": {
          "type": "array",
          "items": { "type": "string" }
        },
        "next_instructions": { "type": "string" },
        "subtasks": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["target", "instruction"],
            "properties": {
              "target": { "type": "string" },
              "instruction": { "type": "string" },
              "timeout_sec": { "type": "integer", "default": 120 }
            }
          }
        },
        "p2p_query": { "type": "string" }
      }
    }
  }
}
```

## 3. Parsing and Recovery Algorithm

1. Host parser searches `stdout` for regex `/<!-- CINDY_MAP:BEGIN -->([\s\S]*?)<!-- CINDY_MAP:END -->/`.
2. If matched:
   - Extract captured group 1.
   - Run `JSON.parse()`.
   - Validate against Schema.
   - Strip the delimiter block from user-facing group transcripts.
3. If no match is found:
   - Default action evaluates to `COMPLETE` with raw text output attributed directly to the emitting agent.
