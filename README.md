# codex-git-unleash-mcp

Local MCP server for a narrow, policy-constrained set of Git and GitHub operations that Codex can call without repeated sandbox approval prompts.

It exists to handle a small approved workflow through MCP tools: inspect repository state, stage and commit changes, fetch and push the current branch, create or switch local branches in a constrained way, and open draft pull requests.

This is especially useful with OpenAI Codex sandbox, where protected-path behavior still applies to paths such as `.git`. In practice, shell Git operations that write repository metadata can still be blocked or require approval, while direct GitHub network mutations may still be allowed or approval-gated depending on runtime policy.

See OpenAI Codex docs: [Protected paths in writable roots](https://developers.openai.com/codex/agent-approvals-security#protected-paths-in-writable-roots).

For the suggested repository workflow used in this repo (and in general), see [AGENTS.md](./AGENTS.md).

Current tool surface:

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

The server is intentionally not a generic `git` or `gh` proxy. Inputs are structured, commands are fixed, and unsupported operations are denied by default.

## Prerequisites

- Node.js
- npm
- `git`
- `gh`

## Install

From this repository:

```bash
npm install
```

## Configure

Use a config file at `~/.config/codex-git-unleash-mcp.yaml`.

Example:

```yaml
defaults:
  allowed_branch_patterns:
    - "^main$"
  feature_branch_pattern: "user/<feature-name>"
  allow_draft_prs: true
  branching_policy: worktree

always_allowed_branch_patterns:
  - "^user/.*$"

repositories:
  - path: ~/projects/codex-git-unleash-mcp
    default_remote: origin
  - path: ~/projects/another-repo
    branching_policy: current_branch
    allowed_branch_patterns:
      - "^feature/[a-z0-9._-]+$"
    feature_branch_pattern: "feature/<feature-name>"
    allow_draft_prs: false
```

Notes:

- `path` must be an absolute path or start with `~/`
- top-level `defaults` are optional and may define `allowed_branch_patterns`, `feature_branch_pattern`, `default_remote`, `allow_draft_prs`, and `branching_policy`
- top-level `always_allowed_branch_patterns` are optional and are appended to every repository's effective branch policy
- repository values override top-level defaults field-by-field
- `defaults.allowed_branch_patterns` are inherited or overridden, while `always_allowed_branch_patterns` are always added
- `feature_branch_pattern` is an optional suggested naming template for new feature branches; it is advisory metadata and does not grant permission to use a branch name that fails `allowed_branch_patterns`
- `branching_policy` is optional and enforced for branch-setup tools; supported values are `worktree`, `branch`, and `current_branch`
- `worktree` means the preferred setup flow is `git_worktree_add`
- `branch` means the preferred setup flow is `git_branch_create_and_switch`
- `current_branch` means do not create a new worktree or feature branch; work directly on the current allowed branch
- branch patterns are full-match regexes against the current branch name
- each repository must end up with at least one effective allowed branch pattern, either from the repo entry, inherited `defaults`, or `always_allowed_branch_patterns`
- `git_repo_policy` returns the configured branch patterns and related repository defaults for an allowlisted repository, including `feature_branch_pattern` and `branching_policy` when configured
- `git_add`, `git_commit`, `git_push`, and `gh_pr_create_draft` require the current branch to match one of the configured patterns
- `git_fetch` only requires the repository to be allowlisted, fetches from the resolved remote, and uses an explicit branch when provided or the detected base branch otherwise
- `git_worktree_add` requires an explicit absolute target path outside the repository root, validates the requested new branch name against `allowed_branch_patterns`, creates a linked worktree from an explicit or detected upstream base branch, and is only allowed when `branching_policy` is unset or `worktree`
- `git_branch_create_and_switch` and `git_branch_switch` require a clean worktree
- `git_branch_create_and_switch` also requires the requested new branch name to match `allowed_branch_patterns`, and is only allowed when `branching_policy` is unset or `branch`
- remote resolution prefers configured `default_remote` when present and valid, then the current branch's remote, then `origin`
- branch creation and PR base resolution prefer the remote HEAD branch and fall back to GitHub default-branch detection when needed
- `git_status` only requires the repository to be allowlisted

## Workflow Summary

The intended happy path is:

1. Call `git_repo_policy` or `git_status` to inspect the allowlisted repository.
2. Before creating a branch, use `git_repo_policy` to confirm the configured `allowed_branch_patterns`, then choose a new branch name that matches that policy.
3. Call `git_branch_create_and_switch` to branch from an explicit or detected upstream base when you need a new local branch in the current worktree.
4. Call `git_worktree_add` when you need a separate linked worktree on a new allowed branch at an explicit absolute path outside the repository root.
5. Call `git_add` with explicit repository-relative paths.
6. Call `git_commit` with a normal commit message.
7. Call `git_push` to push the current branch to the resolved remote.
8. Call `gh_pr_create_draft` to open a draft PR against an explicit base or the detected default base branch.

Each step stays inside a fixed policy boundary. There is no arbitrary checkout, no arbitrary push refspec, no amend flow, and no non-draft PR creation.

## Run Locally

Start the server over stdio with the config path as the first argument:

```bash
npm run dev -- ~/.config/codex-git-unleash-mcp.yaml
```

You can also provide the config path through `GIT_UNLEASH_MCP_CONFIG`:

```bash
GIT_UNLEASH_MCP_CONFIG=~/.config/codex-git-unleash-mcp.yaml npm run dev
```

## Build

```bash
npm run build
```

## Test

```bash
npm run typecheck
npm test
```

## Register In Codex

Register the MCP server with the wrapper script:

```bash
codex mcp add git_unleash -- ~/projects/codex-git-unleash-mcp/scripts/run-mcp.sh ~/.config/codex-git-unleash-mcp.yaml
```

Then verify:

```bash
codex mcp list
```

### The Purpose of the Wrapper Script

The wrapper is there so the MCP server can inherit or reconstruct the SSH agent socket when Git operations need it.

This matters in two common cases:

- `git_commit` when Git is configured for SSH-based commit signing
- `git_fetch` and `git_push` when the repository remote uses SSH authentication

If your shell already has a working `SSH_AUTH_SOCK`, start Codex from that shell so the MCP server inherits it.

If Codex does not inherit the socket automatically, set one of these before starting Codex:

```bash
export GIT_UNLEASH_SSH_AUTH_SOCK="$SSH_AUTH_SOCK"
```

or:

```bash
export SSH_AUTH_SOCK=/path/to/ssh-agent.sock
```

On macOS, the wrapper will also try `launchctl getenv SSH_AUTH_SOCK` before failing.

## What Codex Can Do Through This MCP Server

Once registered, Codex should be able to use:

- `git_repo_policy` to inspect the configured path, canonical path, allowed branch patterns, suggested feature-branch pattern, default remote, and draft-PR setting for an allowlisted repository
- `git_status` for an allowlisted repository
- `git_add` for repository-relative paths inside an allowlisted repository; it rejects absolute paths and repository-escaping paths like `../x`
- `git_commit` with a normal commit message on an allowed branch; it rejects empty commit messages and empty commits
- `git_fetch` to fetch a plain branch name from the detected remote; it does not allow arbitrary fetch arguments or refspecs and uses an explicit branch when provided or the detected base branch otherwise
- `git_worktree_add` to create a linked worktree for a new allowed branch at an explicit absolute path outside the repository root; it fetches the explicit or detected base branch first and does not allow arbitrary refs
- `git_branch_create_and_switch` to create a local branch from an explicit or detected upstream base and switch to it; it rejects requested branch names that do not match the configured allowed branch patterns
- `git_branch_switch` to switch to an existing local branch when the worktree is clean; it does not create branches or allow detached checkouts
- `git_push` to push the current branch to the detected remote; it only pushes `HEAD` to `refs/heads/<current-branch>` and does not allow arbitrary refspecs or force-like behavior
- `gh_pr_create_draft` to create a draft PR for the current branch using an explicit base or the detected default branch; it is draft-only and requires a non-empty title

Mutating tools reject detached HEAD.

## Remote And Base Resolution

Some operations resolve defaults at runtime instead of requiring everything to be pinned in config.

- `git_fetch`, `git_push`, `git_worktree_add`, `git_branch_create_and_switch`, and `gh_pr_create_draft` resolve the remote by preferring configured `default_remote`, then the current branch remote, then `origin`
- `git_fetch`, `git_worktree_add`, `git_branch_create_and_switch`, and `gh_pr_create_draft` accept an explicit branch or base input
- `git_fetch`, `git_worktree_add`, `git_branch_create_and_switch`, and `gh_pr_create_draft` resolve their default branch or base by preferring the remote HEAD branch and falling back to the GitHub repository default branch when no explicit input is provided

This keeps the tools constrained while still working across repositories that use different default branches or remotes.

## Example Config For This Repo

If you want to branch from `main` but only allow mutations on personal feature branches:

```yaml
defaults:
  allowed_branch_patterns:
    - "^main$"

always_allowed_branch_patterns:
  - "^user/.*$"

repositories:
  - path: ~/projects/codex-git-unleash-mcp
  - path: ~/projects/codex-git-unleash-mcp-enterprise
    allowed_branch_patterns:
      - "^feature/[a-z0-9._-]+$"
```

If you want some repositories to stay on their base branch instead of creating a worktree or feature branch:

```yaml
repositories:
  - path: ~/projects/dm-cv-on-steroids
    branching_policy: current_branch
    allowed_branch_patterns:
      - "^main$"
  - path: ~/dot.files
    branching_policy: current_branch
    allowed_branch_patterns:
      - "^main$"
```
```
