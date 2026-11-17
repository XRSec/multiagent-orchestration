<!--
name: "Tool Description: LSP"
description: "LSP code-intelligence operations for definitions, references, symbols, implementations, hover info, and call hierarchies"
ccVersion: "2.1.162"
-->
Interact with Language Server Protocol (LSP) servers for code intelligence.

| Operation | Purpose |
| :--- | :--- |
| `goToDefinition` | Find where a symbol is defined |
| `findReferences` | Find all references to a symbol |
| `hover` | Get documentation and type info for a symbol |
| `documentSymbol` | List all symbols (functions, classes, variables) in a document |
| `workspaceSymbol` | Search symbols matching a query across the workspace |
| `goToImplementation` | Find implementations of an interface or abstract method |
| `prepareCallHierarchy` | Get call hierarchy item at a position (functions/methods) |
| `incomingCalls` | Find functions/methods calling the function at a position |
| `outgoingCalls` | Find functions/methods called by the function at a position |

Required parameters (all operations):
- `filePath`: Target file path
- `line`: 1-based line number
- `character`: 1-based character offset
- `query` (`workspaceSymbol` only): Symbol name or partial name; always provide a non-empty value (most servers return nothing for empty queries).

Note: An LSP server must be configured for the file type; otherwise an error is returned.
