# Implementation State

## Current Branch

- `main`

## Recent Commits

- `1b99fba` `impacted system: git-mcp refresh docs and implementation state`
- `b4b143a` `impacted system: git-mcp add git push tool`
- `6ef21de` `impacted system: git-mcp document setup and MCP launcher`

## Current Working Tree

Uncommitted changes:

- modified: [IMPL-STATE.md](/Users/dm/projects/codex-git-unleash-mcp/IMPL-STATE.md)
- modified: [README.md](/Users/dm/projects/codex-git-unleash-mcp/README.md)
- modified: [SPEC.md](/Users/dm/projects/codex-git-unleash-mcp/SPEC.md)
- modified: [IMPLEMENTATION.md](/Users/dm/projects/codex-git-unleash-mcp/IMPLEMENTATION.md)

Intended split:

1. commit the refreshed docs and implementation checkpoint
2. push the docs checkpoint
3. implement a constrained branch-creation tool for PR setup
4. implement `gh_pr_create_draft`

Suggested commit messages:

- `git-mcp: refresh docs after git push`
- `git-mcp: add branch creation tool`
- `git-mcp: add draft PR tool`

## What The Uncommitted Changes Do

### `IMPL-STATE.md`

- refreshes the checkpoint after the `git_push` implementation and docs commits
- records the successful MCP push test on `main`
- captures branch creation and draft PR support as the next slices

### `README.md`

- removes stale notes now that `git_push` is implemented
- keeps the setup guide aligned with the current tool surface

### `SPEC.md`

- records branch creation as the next constrained Git operation
- clarifies that branch creation should use configured defaults rather than arbitrary source refs

### `IMPLEMENTATION.md`

- refreshes the rollout notes after the `git_push` slice
- sketches the next branch-creation slice as the setup path for draft PR support

## Verification Status

Latest verified state:

- `npm run typecheck` passed
- `npm test` passed
- `bash -n scripts/run-mcp.sh` passed
- test count at that point: 17 files, 35 tests
- MCP `git_push` succeeded against `origin` on `main`

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

1. add a constrained branch-creation tool that fetches the configured upstream base and creates a branch ref without checkout
2. implement `gh_pr_create_draft`
3. decide whether to expose richer structured MCP output before or after GitHub PR support
4. keep using the launcher script for sessions that need SSH-signed commits through MCP

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

- constrained branch creation without checkout
- `gh_pr_create_draft`
- richer structured MCP output beyond JSON text content
