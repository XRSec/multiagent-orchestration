<!--
name: "Skill: /code-review efficiency dimension"
description: "Identifies wasted computation, repeated I/O, sequentialized independent work, and scope-retaining closures with cheaper alternatives"
ccVersion: "2.1.173"
-->
### Efficiency

Flag wasted work introduced by the diff—redundant computation, repeated I/O, serialized independent ops, hot-path/startup blocking, and long-lived closure objects that pin large enclosing scopes in memory (prefer classes/structs copying only needed fields)—and state the cheaper alternative.
