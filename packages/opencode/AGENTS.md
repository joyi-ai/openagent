# AGENTS.md

Scope: core server and business logic.

## Task-Specific Docs
- ../../agent-docs/opencode.md
- ../../agent-docs/workflows.md
- ../../agent-docs/code-style.md
- ../../agent-docs/testing.md

## Verification Loops
- `bun run typecheck`
- `bun test` (run from this directory; use WSL on Windows)

## Gotchas (keep updated)
- Changing server endpoints in `src/server/server.ts` requires SDK regeneration.
