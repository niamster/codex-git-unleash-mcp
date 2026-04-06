# Implementation State

## Current Branch

- `main`

## Recent Commits

- `6ef21de` `impacted system: git-mcp document setup and MCP launcher`
- `3850bab` `impacted system: git-mcp add MCP launcher for SSH signing`
- `3b2fe2c` `impacted system: git-mcp expand home paths in config`

## Current Working Tree

Uncommitted changes:

- modified: [IMPL-STATE.md](/Users/dm/projects/codex-git-unleash-mcp/IMPL-STATE.md)
- modified: [src/exec/git.ts](/Users/dm/projects/codex-git-unleash-mcp/src/exec/git.ts)
- modified: [src/server.ts](/Users/dm/projects/codex-git-unleash-mcp/src/server.ts)
- added: [src/tools/gitPush.ts](/Users/dm/projects/codex-git-unleash-mcp/src/tools/gitPush.ts)
- modified: [tests/gitArgs.test.ts](/Users/dm/projects/codex-git-unleash-mcp/tests/gitArgs.test.ts)
- added: [tests/gitPush.test.ts](/Users/dm/projects/codex-git-unleash-mcp/tests/gitPush.test.ts)
- modified: [tests/helpers.ts](/Users/dm/projects/codex-git-unleash-mcp/tests/helpers.ts)
- modified: [README.md](/Users/dm/projects/codex-git-unleash-mcp/README.md)

Intended split:

1. commit `git_push` implementation and tests
2. commit the refreshed docs and implementation state

Suggested commit messages:

- `git-mcp: add git push tool`
- `git-mcp: refresh docs and implementation state`

## What The Uncommitted Changes Do

### `IMPL-STATE.md`

- refreshes the checkpoint after `git_push` implementation work
- records the current verification state and tool surface
- captures the next likely slice after `git_push`

### `src/exec/git.ts`

- adds a constrained `git push` argv builder
- adds a fixed helper for pushing the current branch to the configured remote

### `src/server.ts`

- registers the new MCP tool `git_push`
- keeps branch authorization in the same shared flow used by other mutating tools

### `src/tools/gitPush.ts`

- adds the tool-level push handler
- restricts pushes to the configured default remote and the current branch

### `tests/gitArgs.test.ts`

- adds coverage for the constrained push argv shape

### `tests/gitPush.test.ts`

- covers pushing to a temporary bare remote
- verifies the push target stays fixed to `HEAD:refs/heads/<branch>`

### `tests/helpers.ts`

- adds a helper for creating temporary bare Git remotes used by push tests

### `README.md`

- updates the documented tool surface to include `git_push`
- documents the current push behavior and limitations

## Verification Status

Latest verified state:

- `npm run typecheck` passed
- `npm test` passed
- `bash -n scripts/run-mcp.sh` passed
- test count at that point: 17 files, 35 tests

## MCP Status

### Config file

Created outside the repo:

- `~/.config/codex-git-unleash-mcp.yaml`

Contents are intended for this repository on `main`.

### Codex MCP registration

`git_unleash` is registered and `codex mcp get git_unleash` showed:

- command: `/Users/dm/projects/codex-git-unleash-mcp/scripts/run-mcp.sh`
- args:
  `/Users/dm/.config/codex-git-unleash-mcp.yaml`

### Important runtime note

After re-registering the MCP server through the launcher script and restarting the session, the runtime was able to use:

- `git_add`
- `git_commit`
- `git_push`

This confirmed that the earlier commit-signing problem was an environment-launch issue rather than a limitation in the Git tool implementation itself.

## Recommended Next Steps

1. implement `gh_pr_create_draft`
2. decide whether to expose richer structured MCP output before or after GitHub PR support
3. keep using the launcher script for sessions that need SSH-signed commits through MCP

## Current Implementation Scope

Implemented:

- config loading from YAML
- `~` expansion for configured repository paths
- allowlisted repository resolution
- full-match branch authorization helpers
- `git_status`
- `git_add`
- `git_commit`
- `git_push`
- MCP launcher script for SSH agent propagation / validation
- path validation for `git_add`

Not implemented yet:

- `gh_pr_create_draft`
- richer structured MCP output beyond JSON text content
