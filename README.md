# codex-git-unleash-mcp

Local MCP server for a narrow set of Git operations that Codex can call without repeated shell approval prompts.

Current tool surface:

- `git_status`
- `git_add`
- `git_commit`
- `git_push`

Not implemented yet:

- `git_push`
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
      - "^main$"
    default_remote: origin
    default_pr_base: main
    allow_draft_prs: true
```

Notes:

- `path` must be an absolute path or start with `~/`
- branch patterns are full-match regexes against the current branch name
- `git_add` and `git_commit` require the current branch to match one of the configured patterns
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
- `git_push` to push the current branch to the configured default remote

Current behavior:

- `git_add` rejects absolute paths and repository-escaping paths like `../x`
- `git_commit` rejects empty commit messages
- `git_commit` rejects empty commits
- `git_push` only pushes `HEAD` to `refs/heads/<current-branch>` on the configured default remote
- `git_push` does not allow arbitrary refspecs or force-like behavior
- mutating tools reject detached HEAD

## Example Config For This Repo

If you want to allow mutation on `main` in this repository:

```yaml
repositories:
  - path: ~/projects/codex-git-unleash-mcp
    allowed_branch_patterns:
      - "^main$"
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
- there is no GitHub PR support yet
- the current setup assumes local `git` is available
