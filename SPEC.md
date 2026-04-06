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

## Tool Surface

The initial tool surface should be fixed and explicit.

### Git tools

- `git_status`
- `git_add`
- `git_commit`
- `git_push`
- `git_branch_create_and_switch`
- `git_branch_switch`

### GitHub tools

- `gh_pr_create_draft`

Read-only GitHub helpers may be added later if they are useful, but they should also be fixed structured tools rather than generic `gh` passthrough.

## Repository Authorization Model

The server must be configurable with an allowlist of repositories.

Each allowed repository must define:

- canonical repository path
- list of allowed branch patterns

Repository authorization rules:

- the requested repository must resolve to a configured canonical path
- symlink or path-traversal tricks must not allow escaping the configured repository
- operations must execute only inside an allowed repository

## Branch Authorization Model

Each allowed repository must define a list of regex patterns for allowed branches.

Branch matching rules:

- patterns are matched against the full current branch name
- patterns should be treated as full-match expressions, not substring matches
- the current branch must match at least one configured pattern before any mutating operation is allowed

At minimum, mutating operations include:

- `git_add`
- `git_commit`
- `git_push`
- `gh_pr_create_draft`

Branch-workflow exception:

- `git_branch_create_and_switch` and `git_branch_switch` are mutating but may be allowed without current-branch pattern checks as long as they preserve the clean-worktree and constrained-ref safety rules

Read-only operations such as `git_status` may still require repository allowlisting, but do not necessarily need branch checks unless implementation simplicity makes a uniform check preferable.

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

## Tool Requirements

### `git_status`

Purpose:

- show repository state for an allowed repository

Requirements:

- repository must be allowlisted
- no mutation
- output should be structured where practical, or at least normalized for MCP consumption

### `git_add`

Purpose:

- stage a constrained list of paths

Requirements:

- repository must be allowlisted
- current branch must match an allowed full-match pattern
- every requested path must resolve inside the allowed repository
- the server must not accept pathspec features that expand scope unexpectedly unless deliberately supported

### `git_commit`

Purpose:

- create a normal commit on the current branch

Requirements:

- repository must be allowlisted
- current branch must match an allowed full-match pattern
- commit message must be provided as structured input
- amend must not be supported
- extra arbitrary commit flags must not be supported

### `git_push`

Purpose:

- push the current branch to GitHub in a constrained way

Requirements:

- repository must be allowlisted
- current branch must match an allowed full-match pattern
- push target must be constrained by configuration or fixed defaults
- no force push
- no arbitrary refspec push
- no pushing unrelated branches

### `git_branch_create_and_switch`

Purpose:

- create a new local branch from the inferred upstream base branch and switch to it

Requirements:

- repository must be allowlisted
- the worktree must be clean
- the tool must infer the remote at runtime, preferring the current branch remote, then `origin`, with configuration override allowed
- the tool may accept an explicit plain branch name as the upstream base branch
- when no base branch is provided, the tool must infer the base branch from the remote HEAD first, with GitHub default-branch lookup as a fallback
- the tool must fetch the detected base branch before creating the branch
- the new branch name must be provided as structured input
- the tool must switch to the new local branch after creating it
- the tool must not accept arbitrary source refs or checkout-like behavior

### `git_branch_switch`

Purpose:

- switch to an existing local branch in a tightly constrained way

Requirements:

- repository must be allowlisted
- the worktree must be clean
- the target branch name must be provided explicitly
- the target branch must already exist locally
- the tool must not create branches, switch to arbitrary refs, or allow detached checkout

### `gh_pr_create_draft`

Purpose:

- create a draft pull request for the current branch

Requirements:

- repository must be allowlisted
- current branch must match an allowed full-match pattern
- PR creation must be draft-only in the initial version
- title and body must be structured inputs
- target base branch should be constrained by configuration or explicit validated input

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
      - "^dm/.*$"
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

## Open Questions

These are not blockers for the spec, but they should be resolved during implementation design:

- exact MCP framework and language choice
- exact config file path and format
- whether `git_status` should require branch authorization or only repository authorization
- whether empty commits should always be denied
- whether PR creation should infer defaults or require explicit base branch input
- whether GitHub operations should use `gh`, direct API calls, or a mix

## Reference

OpenAI Codex protected-path behavior:

https://developers.openai.com/codex/agent-approvals-security#protected-paths-in-writable-roots
