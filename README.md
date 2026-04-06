# codex-git-unleash-mcp

Local MCP server for a narrow set of Git operations that Codex can call without repeated shell approval prompts.

Current tool surface:

- `git_status`
- `git_add`
- `git_commit`
- `git_fetch`
- `git_push`
- `git_branch_create_and_switch`
- `git_branch_switch`
- `gh_pr_create_draft`

## Prerequisites

- Node.js
- npm
- `git`

## Install

From this repository:

```bash
npm install
```

## Configure

Use a config file at `~/.config/codex-git-unleash-mcp.yaml`.

Example:

```yaml
repositories:
  - path: ~/projects/codex-git-unleash-mcp
    allowed_branch_patterns:
      - "^dm/.*$"
      - "^feature/[a-z0-9._-]+$"
    allow_draft_prs: true
```

Notes:

- `path` must be an absolute path or start with `~/`
- branch patterns are full-match regexes against the current branch name
- `git_add`, `git_commit`, `git_push`, and `gh_pr_create_draft` require the current branch to match one of the configured patterns
- `git_fetch` only requires the repository to be allowlisted and fetches from the resolved remote
- `git_branch_create_and_switch` and `git_branch_switch` require a clean worktree but do not require the current branch to match `allowed_branch_patterns`
- branch creation and PR base detection use runtime inference rather than `default_pr_base`
- remote selection defaults to the current branch's remote when available, then `origin`, unless `default_remote` is explicitly configured
- `git_status` only requires the repository to be allowlisted

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

Use the wrapper script so the MCP server can inherit or reconstruct the SSH agent socket needed for SSH-signed commits:

```bash
codex mcp add git_unleash -- ~/projects/codex-git-unleash-mcp/scripts/run-mcp.sh ~/.config/codex-git-unleash-mcp.yaml
```

Then verify:

```bash
codex mcp list
```

If your shell already has a working `SSH_AUTH_SOCK`, start Codex from that shell so the MCP server inherits it.

If Codex does not inherit the socket automatically, set one of these before starting Codex:

```bash
export GIT_UNLEASH_SSH_AUTH_SOCK="$SSH_AUTH_SOCK"
```

or:

```bash
export SSH_AUTH_SOCK=/path/to/ssh-agent.sock
```

The wrapper will also try `launchctl getenv SSH_AUTH_SOCK` on macOS before failing.

## What Codex Can Do Through This MCP Server

Once registered, Codex should be able to use:

- `git_status` for an allowlisted repository
- `git_add` for repository-relative paths inside an allowlisted repository
- `git_commit` with a normal commit message on an allowed branch
- `git_fetch` to fetch a plain branch name from the detected remote, defaulting to `main`
- `git_branch_create_and_switch` to create a local branch from an explicit or detected upstream base and switch to it
- `git_branch_switch` to switch to an existing local branch when the worktree is clean
- `git_push` to push the current branch to the detected remote
- `gh_pr_create_draft` to create a draft PR for the current branch using an explicit base or the detected default branch

Current behavior:

- `git_add` rejects absolute paths and repository-escaping paths like `../x`
- `git_commit` rejects empty commit messages
- `git_commit` rejects empty commits
- `git_branch_create_and_switch` detects the remote at runtime, uses the explicit base branch when provided or detects one otherwise, fetches that base, creates the local branch, and switches to it
- `git_branch_switch` only switches to an explicit existing local branch and rejects dirty worktrees
- `git_fetch` only fetches `git fetch <resolved-remote> <branch>` and defaults the branch to `main`
- `git_push` only pushes `HEAD` to `refs/heads/<current-branch>` on the resolved remote
- `git_push` does not allow arbitrary refspecs or force-like behavior
- `gh_pr_create_draft` is draft-only and uses either the explicit `base` input or the detected default branch
- mutating tools reject detached HEAD

## Example Config For This Repo

If you want to branch from `main` but only allow mutations on personal feature branches:

```yaml
repositories:
  - path: ~/projects/codex-git-unleash-mcp
    allowed_branch_patterns:
      - "^dm/.*$"
      - "^feature/[a-z0-9._-]+$"
```

If you want to allow only personal feature branches:

```yaml
repositories:
  - path: ~/projects/codex-git-unleash-mcp
    allowed_branch_patterns:
      - "^dm/.*$"
      - "^feature/[a-z0-9._-]+$"
```

## Current Limitations

- output is returned as JSON text content rather than richer structured MCP content
- the current setup assumes local `git` is available
