# AGENTS.md

Scope: shared SolidJS app components.

## Task-Specific Docs
- ../../agent-docs/frontend.md
- ../../agent-docs/workflows.md
- ../../agent-docs/code-style.md
- ../../agent-docs/testing.md

## Verification Loops
- UI smoke checks via Playwright MCP server (app already running at
  http://localhost:3000).
- `bun turbo typecheck`

## Gotchas (keep updated)
- Use the Playwright MCP server for UI debugging; the app is already running at
  http://localhost:3000.
- Never restart the app or server process while using that MCP server.
