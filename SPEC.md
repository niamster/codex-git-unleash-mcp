# Git/GitHub Approval MCP Server

## Goal

Build an MCP server that exposes a small, structured, security-constrained set of Git and GitHub operations for use by Codex.

The server exists to reduce or eliminate repeated interactive approval prompts for an approved subset of operations that would otherwise:

- touch protected `.git` metadata such as index or commit state
- access `github.com` for push or GitHub API actions

The server should let Codex use these operations through MCP tools rather than direct shell execution, while preserving clear safety boundaries.

## Non-goals

This server is not intended to be:

- a general-purpose shell wrapper
- an arbitrary `git` or `gh` command proxy
- a way to bypass Codex security controls for unapproved operations
- a replacement for normal repository authorization or GitHub authentication

## Intended Use

Codex should call a fixed set of MCP tools with structured inputs. The server should validate those inputs, verify repository and branch policy, and then execute only the specific internal Git or GitHub action required for that tool.

The server should not accept raw command strings, arbitrary argument arrays, or shell fragments.

## Core Design Principle

The server should expose a fixed, structured set of repository and GitHub workflow operations.

It should not expose raw command execution, generic `git` passthrough, or generic `gh` passthrough. Exact tool names and shapes are an implementation detail and may evolve, but the server must remain narrow, explicit, and policy-driven.

## Repository Authorization Model

The server must be configurable with an allowlist of repositories.

Each allowed repository must define:

- repository path
- list of allowed branch patterns

Repository authorization rules:

- the requested repository must resolve to an allowlisted repository
- symlink or path-traversal tricks must not allow escaping the configured repository
- operations must execute only inside an allowed repository

Initial implementations may enforce this by canonicalizing paths and requiring an exact match to a configured repository root, but the safety requirement is repository scoping, not a particular path-matching strategy.

## Branch Authorization Model

Each allowed repository must define a list of regex patterns for allowed branches.

Branch matching rules:

- patterns are matched against the full current branch name
- implementations should enforce full-match semantics rather than substring matching
- the current branch must match at least one configured pattern before any mutating operation is allowed

At minimum, mutating operations include:

- `git_add`
- `git_commit`
- `git_push`
- `gh_pr_create_draft`

Branch-workflow exception:

- `git_branch_create_and_switch` and `git_branch_switch` may be allowed without current-branch pattern checks as long as they preserve the clean-worktree and constrained-ref safety rules
- `git_branch_create_and_switch` must still validate the requested `new_branch` name against the configured allowed branch patterns before creating and switching to it

Read-only operations such as `git_repo_policy` and `git_status` may still require repository allowlisting, but do not necessarily need branch checks unless implementation simplicity makes a uniform check preferable.

## Safety Constraints

The MCP server should explicitly allow a narrow safe subset and reject everything else.

### Must allow

The approved tool surface may perform operations that:

- read and update protected `.git` metadata as needed for staging, committing, and pushing
- access `github.com` as needed for push and GitHub API operations

This is the core reason the server exists.

### Must deny

The server must reject any attempt to perform operations outside the fixed tool surface or outside policy. Examples include:

- arbitrary shell execution
- arbitrary `git` passthrough
- arbitrary `gh` passthrough
- checkout, switch, reset, rebase, cherry-pick, merge, stash, tag deletion, branch deletion outside the constrained supported branch-switch tool
- `git commit --amend`
- empty commits unless explicitly designed and approved later
- force push
- delete push
- push with arbitrary refspecs
- changing remotes
- branch creation from arbitrary refs
- `git config` writes
- operations against repositories not in the allowlist
- operations on branches that do not match the configured full-match branch patterns

If a requested behavior is not explicitly supported, the default result should be denial.

## Allowed Operation Categories

The server may expose structured tools for operations such as:

- repository inspection and policy inspection
- constrained staging and commit creation
- constrained branch creation and branch switching
- constrained remote synchronization
- constrained GitHub pull request creation

Each supported operation must be explicitly designed and validated. New operations should be added only when they fit the same narrow policy boundary.

## Execution Model

The server should execute fixed internal commands or API calls for each tool.

Implementation expectations:

- do not use shell interpolation such as `sh -c`
- build fixed argv arrays for `git` and `gh` invocations
- validate all structured inputs before execution
- keep command construction narrow and deterministic

For GitHub operations, either `gh` or direct GitHub API calls are acceptable if the behavior remains structured and constrained.

## Configuration

The server should load a configuration file that defines repository policy.

Initial configuration should include, per repository:

- repository path
- allowed branch patterns

Optional configuration that may be useful:

- default remote name
- whether draft PR creation is enabled

The initial branch and PR behavior should prefer runtime inference with a narrow fallback order:

- use `default_remote` only as an override when present
- otherwise use the current branch remote when available, then `origin`
- infer the base branch from remote HEAD first
- fall back to GitHub default-branch detection when remote HEAD is unavailable

Example shape:

```yaml
repositories:
  - path: /absolute/path/to/repo
    allowed_branch_patterns:
      - "^user/.*$"
      - "^feature/[a-z0-9._-]+$"
    allow_draft_prs: true
```

## Describe Support

The server should support MCP server and tool description cleanly enough that Codex can understand:

- what tools exist
- what each tool does
- what repositories and branches are authorized
- that the server is intentionally approved to perform a narrow set of protected `.git` and GitHub operations
- what safety limits apply

Tool descriptions should make the constraints obvious so the model can choose valid calls without trial and error.

## Failure Behavior

Failures should be explicit and easy to reason about.

Examples:

- repository not allowlisted
- branch not authorized
- path escapes repository
- unsupported operation
- force-like or amend-like behavior requested
- branch creation from arbitrary refs is not supported
- dirty-worktree branch switching is not supported
- GitHub authentication missing
- push rejected by remote

The server should prefer clear denials over implicit fallback behavior.

## Reference

OpenAI Codex protected-path behavior:

https://developers.openai.com/codex/agent-approvals-security#protected-paths-in-writable-roots
