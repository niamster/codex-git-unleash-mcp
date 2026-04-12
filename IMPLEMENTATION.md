# Implementation Plan

## Purpose

This document translates [SPEC.md](./SPEC.md) into a concrete implementation approach.

The goal is to build a local MCP server that exposes a narrow, structured set of Git and GitHub operations that Codex can call without repeated shell approval prompts, while keeping the trust boundary explicit and small.

When repo-local policy is used, the trust anchor should be the trusted base branch of the current repository instance rather than the mutable working-tree copy of the file. In a fork, that means the fork's own base branch.

## Chosen Defaults

These choices are intentionally opinionated so implementation can start without reopening the same design questions.

- language: TypeScript
- runtime: Node.js
- MCP integration: TypeScript MCP server using a standard stdio transport
- GitHub integration: use `gh` CLI first rather than direct API calls
- config format: YAML
- config location for initial version: local config file provided at server startup
- optional repo-local policy file: `.git-unleash.yaml` at repository root
- `git_status` authorization: repository allowlist required, branch match not required
- empty commits: denied
- PR creation mode: draft only
- branch regex behavior: full-match against the current branch name

These defaults can be revised later, but they should be treated as the implementation baseline.

## High-Level Architecture

The server should be a single local process with a small number of internal modules:

- config loader
- path and repository authorization
- branch authorization
- command runner
- MCP tool handlers
- error mapping and response shaping

The server should not implement generic command dispatch. Every tool should map to one specific handler with a fixed validation and execution flow.

## Proposed Project Layout

Suggested initial structure:

```text
src/
  index.ts
  server.ts
  config.ts
  errors.ts
  auth/
    repoAuth.ts
    branchAuth.ts
    pathValidation.ts
  exec/
    run.ts
    git.ts
    gh.ts
  tools/
    gitRepoPolicy.ts
    gitStatus.ts
    gitAdd.ts
    gitCommit.ts
    gitFetch.ts
    gitWorktreeAdd.ts
    gitPush.ts
    gitBranchCreateAndSwitch.ts
    gitBranchSwitch.ts
    ghPrCreateDraft.ts
  types/
    config.ts
    tools.ts
tests/
  config.test.ts
  repoAuth.test.ts
  branchAuth.test.ts
  pathValidation.test.ts
  gitRepoPolicy.test.ts
  gitArgs.test.ts
  ghArgs.test.ts
  integration/
    gitStatus.test.ts
    gitAdd.test.ts
    gitCommit.test.ts
    gitPush.test.ts
    ghPrCreateDraft.test.ts
```

This is a recommendation, not a strict requirement, but the separation of concerns should remain even if filenames change.

## Server Startup

Startup responsibilities:

- read config path from CLI argument or environment variable
- load and validate YAML config
- canonicalize configured repository paths
- compile branch regexes at startup
- fail fast on invalid configuration
- register MCP tools and descriptions

The server should not start in a partially valid state.

## Configuration Model

Initial YAML schema:

```yaml
repositories:
  - path: /absolute/path/to/repo
    allowed_branch_patterns:
      - "^user/.*$"
      - "^feature/[a-z0-9._-]+$"
    feature_branch_pattern: "user/<feature-name>"
    default_remote: origin
    allow_draft_prs: true
```

Recommended TypeScript shape:

The internal TypeScript types can evolve with the codebase. The important design point is that configuration captures repository policy, not arbitrary command input.

Validation rules:

- `path` must be absolute
- configured repository paths must resolve to canonical real paths
- duplicate canonical repository paths are rejected
- each regex must compile successfully
- `allow_draft_prs` defaults to `true`

## Authorization Flow

Each tool should follow the same top-level policy order:

1. Parse and validate tool input shape.
2. Resolve the requested repository path.
3. Canonicalize or otherwise normalize the repository path and match it to a configured repository according to the active repository-authorization model.
4. Verify the repository looks like a Git repository.
5. If the tool is read-only and policy-oriented, return the configured repository policy.
6. If the tool mutates content history or remote state, read the current branch and validate it against full-match branch regexes when applicable.
7. If the tool creates a new branch, validate the requested branch name against full-match branch regexes before creating it.
8. Run tool-specific validation.
9. Execute the fixed command or API call.
10. Return structured output or structured failure.

This shared order matters because it keeps error behavior predictable.

## Repository Authorization

Repository authorization should operate on normalized repository identity, with canonical real paths as the initial implementation strategy.

Implementation requirements:

- resolve user-provided repository path to an absolute path
- canonicalize via realpath before comparison
- compare only against configured allowlisted repositories
- reject any path that does not map to an allowed repository under the chosen authorization strategy

This prevents path aliasing and symlink escapes from widening access.

## Branch Authorization

Branch authorization applies to content-mutating tools in the initial version.

Implementation requirements:

- determine the current branch using a fixed Git command
- reject detached HEAD for mutating operations
- evaluate the current branch name against compiled regexes
- require at least one full-match success

Implementation note:

Even if regexes are already written with `^...$`, the code should still use full-match semantics rather than substring-style matching.

For branch-creation tools, validate the requested new branch name against the same full-match policy before creating and switching to it. This keeps branch creation aligned with the later mutation rules instead of letting an invalid branch name survive until `git_add`, `git_commit`, or `git_push`.

## Path Validation For `git_add`

`git_add` needs stricter path handling than the other tools.

Validation rules:

- input should be a list of repository-relative file paths
- reject absolute paths
- reject empty paths
- reject `..` traversal
- normalize each path before use
- resolve each path against the repository root
- reject any resolved path outside the repository root

Initial implementation should avoid advanced Git pathspec support. Use plain file paths only.

This keeps `git_add` predictable and avoids accidental staging expansion.

## Command Execution Model

All Git and GitHub execution should use fixed argv arrays with direct process spawning.

Requirements:

- never use `sh -c`
- never accept free-form extra arguments from tool input
- set the working directory to the allowed repository
- capture stdout and stderr
- map non-zero exits into structured MCP errors

The command runner should be generic enough to reuse, but narrow enough that call sites remain explicit.

## Git Command Builders

Git behavior should be centralized in helper functions that build fixed argv arrays.

Examples:

- `gitStatusArgs()`
- `gitAddArgs(paths)`
- `gitCommitArgs(message)`
- `gitPushArgs(remote, branch)`
- `gitFetchBranchArgs(remote, branch)`
- `gitCreateBranchArgs(newBranch, startPoint)`
- `gitSwitchBranchArgs(branch)`

The tool handlers should not assemble ad hoc command arrays inline. This reduces drift and makes argument-level testing easier.

## GitHub Command Builders

The initial version should use `gh` for PR creation because it reuses the user’s existing auth and avoids extra API client work.

Example builder:

- `ghPrCreateDraftArgs(base, title, body)`

Constraints:

- always include `--draft`
- do not allow arbitrary extra flags
- validate title and body before invoking `gh`

## Tool Contracts

### `git_status`

Validation:

- repository path is required
- repository must be allowlisted

Execution:

- run a fixed Git status command in the repository

Output guidance:

- return normalized repository status information
- include the current branch when it can be determined
- include enough raw status detail for MCP consumers to understand the working tree state

### `git_add`

Validation:

- repository path is required
- repository must be allowlisted
- current branch must be authorized
- each path must pass repository-relative path validation
- empty path list is rejected

Execution:

- run a fixed `git add` command for the validated paths

Output guidance:

- return the validated paths that were staged

### `git_commit`

Validation:

- repository path is required
- repository must be allowlisted
- current branch must be authorized
- message must be non-empty after trimming
- no amend behavior
- empty commits denied

Execution:

- run a fixed commit command with the message passed as a normal argument, not shell-interpolated text

Output guidance:

- after commit succeeds, return the created commit OID and summary via a fixed follow-up Git read

### `git_fetch`

Validation:

- repository path is required
- repository must be allowlisted
- if a branch is provided, it must be a plain validated branch name
- if no branch is provided, use a constrained default-resolution strategy rather than arbitrary caller-controlled input

Execution:

- fetch a single branch from the resolved remote
- do not allow arbitrary fetch flags or refspecs

Output guidance:

- return the resolved remote and the fetched branch

### `git_push`

Validation:

- repository path is required
- repository must be allowlisted
- current branch must be authorized
- detached HEAD is rejected

Execution:

- push only the current branch
- resolve the remote from configuration or constrained runtime defaults
- do not allow arbitrary refspecs

Output guidance:

- return the resolved remote and branch
- push the current branch to the same-named remote branch only in the initial version

### `git_worktree_add`

Validation:

- repository path is required
- repository must be allowlisted
- `path` must be a non-empty absolute path outside the repository root
- `new_branch` must be non-empty after trimming
- `new_branch` must match at least one configured allowed branch pattern
- `new_branch` must not already exist locally
- resolve the remote by preferring configured `default_remote`, then the current branch remote, then `origin`
- if `branch` is provided, treat it as the upstream base branch name
- otherwise resolve the base branch from remote HEAD first, with GitHub default-branch lookup as a fallback

Execution:

- fetch the upstream base branch from the detected remote
- create a linked worktree at the validated absolute path
- create and check out the new local branch there from `refs/remotes/<remote>/<base>`

Output guidance:

- return the created branch, resolved remote, resolved base branch, and resolved worktree path

### `git_branch_create_and_switch`

Validation:

- repository path is required
- repository must be allowlisted
- worktree must be clean
- `new_branch` must be non-empty after trimming
- `new_branch` must match at least one configured allowed branch pattern
- `new_branch` must not already exist
- resolve the remote by preferring configured `default_remote`, then the current branch remote, then `origin`
- if `branch` is provided, treat it as the upstream base branch name
- otherwise resolve the base branch from remote HEAD first, with GitHub default-branch lookup as a fallback

Execution:

- fetch the upstream base branch from the detected remote
- create a new local branch from `refs/remotes/<remote>/<base>`
- switch to the new branch after creating it

Output guidance:

- return the created branch, resolved remote, and resolved base branch

### `git_branch_switch`

Validation:

- repository path is required
- repository must be allowlisted
- worktree must be clean
- `branch` must be non-empty after trimming
- `branch` must already exist locally
- no arbitrary ref checkout or detached checkout

Execution:

- switch to the explicit local branch

Output guidance:

- return the branch that was switched to

### `gh_pr_create_draft`

Validation:

- repository path is required
- repository must be allowlisted
- current branch must be authorized
- draft PRs must be enabled for the repository
- title must be non-empty after trimming
- body may be empty if `gh` supports that cleanly in the chosen invocation shape
- base may be provided explicitly, otherwise infer it at runtime from remote HEAD with GitHub default-branch fallback

Execution:

- create a draft PR for the current branch using `gh`
- use the explicit `base` input when provided, otherwise use the inferred default base

Output guidance:

- parse the resulting PR URL from `gh` output and return it with the resolved base and head branch

## Error Model

Define explicit internal error types and map them to user-facing MCP failures.

Suggested internal categories:

- `ConfigError`
- `RepoNotAllowedError`
- `BranchNotAllowedError`
- `PathValidationError`
- `UnsupportedOperationError`
- `CommandExecutionError`
- `AuthenticationError`

Error responses should be short, specific, and policy-oriented.

Examples:

- repository `/x/y` is not allowlisted
- branch `main` does not match allowed patterns for this repository
- path `../secret` escapes the repository root
- force-like push behavior is not supported
- GitHub authentication is missing or invalid

## Describe Support

Tool descriptions should be generated from code, not duplicated manually in multiple places.

Each tool description should mention:

- required inputs
- whether it mutates repository state
- that repository allowlisting applies
- that mutating tools require the current branch to match configured full-match regexes
- any important constraints such as draft-only PRs or no force push

If practical, include the authorized repository paths in server-level description output. If that is too noisy, include a summary and rely on validation errors for exact denials.

## Logging

The initial version should keep logging minimal and safe.

Recommended behavior:

- log tool name, repository path, and high-level outcome
- avoid logging PR body contents or full commit messages unless debug logging is explicitly enabled
- never log secrets or auth tokens

## Testing Strategy

Testing should be split into three layers.

### Unit tests

Cover:

- config parsing and defaults
- regex compilation
- repository canonicalization
- full-match branch authorization
- path validation
- command argument construction

### Integration tests with temporary repositories

Cover:

- allowlisted repo accepted
- non-allowlisted repo denied
- allowed branch accepted
- disallowed branch denied
- detached HEAD denied for mutating tools
- `git_add` path escaping denied
- successful add and commit
- empty commit denied
- successful linked worktree creation from fetched upstream base
- successful branch creation and switch from fetched upstream base
- duplicate branch creation denied
- clean-worktree branch switch succeeds
- dirty-worktree branch switch is denied

### Integration tests for GitHub-facing behavior

Prefer mocking `gh` invocation in most tests.

Cover:

- draft PR command shape
- base branch inference
- remote inference
- authentication failure mapping

Live GitHub integration tests can be deferred until later.

### Completed Core Workflow

- config loading and authorization
- `git_repo_policy`
- `git_status`
- `git_add`
- `git_commit`
- `git_fetch`
- `git_worktree_add`
- `git_push`
- `git_branch_create_and_switch`
- `git_branch_switch`
- `gh_pr_create_draft`

The core constrained Git/GitHub workflow is now implemented end-to-end.
