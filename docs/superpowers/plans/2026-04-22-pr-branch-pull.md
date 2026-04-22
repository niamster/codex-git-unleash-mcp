# PR Branch Pull Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a constrained MCP tool that lets Codex pull updates from the current branch's remote PR branch.

**Architecture:** Reuse the existing branch authorization, remote resolution, fetch, merge, dirty-worktree, and merge-abort patterns from `git_sync_base`. The new tool fetches only the current branch from the resolved remote and merges only that remote-tracking ref.

**Tech Stack:** TypeScript, MCP SDK, Vitest, Git CLI wrappers.

---

### Task 1: Failing Coverage

**Files:**
- Create: `tests/gitPullCurrentBranch.test.ts`
- Modify: `tests/server.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for successful remote branch pull, dirty worktree rejection, conflict abort, server tool registration, and tool annotations.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/gitPullCurrentBranch.test.ts tests/server.test.ts`

Expected: FAIL because `src/tools/gitPullCurrentBranch.ts` and server registration do not exist yet.

### Task 2: Tool Implementation

**Files:**
- Create: `src/tools/gitPullCurrentBranch.ts`
- Modify: `src/errors.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Implement the tool**

Add `gitPullCurrentBranch(repo)` with this flow: require allowed current branch, require clean worktree, resolve remote, fetch current branch, merge `refs/remotes/<remote>/<branch>`, abort on conflict, and return `{ branch, remote, remoteRef }`.

- [ ] **Step 2: Register the tool**

Expose `git_pull_current_branch` in `getRegisteredToolNames()` and `createServer()` with a destructive closed-world annotation.

- [ ] **Step 3: Verify green**

Run: `npm test -- tests/gitPullCurrentBranch.test.ts tests/server.test.ts`

Expected: PASS.

### Task 3: Docs and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `SPEC.md`
- Modify: `IMPLEMENTATION.md`

- [ ] **Step 1: Document the tool surface**

Add `git_pull_current_branch` wherever the current tool list and remote/default behavior are documented.

- [ ] **Step 2: Run full verification**

Run: `npm test`, `npm run typecheck`, and `npm run build`.

Expected: all commands pass.
