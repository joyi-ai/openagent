# AGENTS.md

Brief, repo-wide guidance for Codex. Keep this file short and defer details to
./agent-docs.

## Task-Specific Docs
- ./agent-docs/workflows.md - build/dev/test commands and verification loops
- ./agent-docs/architecture.md - repo layout and key components
- ./agent-docs/code-style.md - TypeScript/Bun conventions
- ./agent-docs/testing.md - test patterns and fixtures
- ./agent-docs/frontend.md - UI/SolidJS guidance
- ./agent-docs/opencode.md - server/tooling specifics

## Verification Loops
- `bun turbo typecheck`
- `cd packages/opencode && bun test` (run tests in WSL on Windows)
- `bun run tauri dev` (desktop UI)
- `./script/generate.ts` after server API changes

## Gotchas (keep updated)
- Windows path issues: run `bun test` from WSL/Linux.
- Changing server endpoints in `packages/opencode/src/server/server.ts` requires
  SDK regeneration.

## Global Instructions
- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.
- Default branch is `main`.
