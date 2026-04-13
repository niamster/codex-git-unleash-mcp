# codex-git-unleash-mcp

Local MCP server for a narrow, policy-constrained set of Git and GitHub operations that Codex can call without repeated sandbox approval prompts.

It exists to handle a small approved workflow through MCP tools: inspect repository state, stage and commit changes, fetch and push the current branch, create or switch local branches in a constrained way, and open draft pull requests.

This is especially useful with OpenAI Codex sandbox, where protected-path behavior still applies to paths such as `.git`. In practice, shell Git operations that write repository metadata can still be blocked or require approval, while direct GitHub network mutations may still be allowed or approval-gated depending on runtime policy.

See OpenAI Codex docs: [Protected paths in writable roots](https://developers.openai.com/codex/agent-approvals-security#protected-paths-in-writable-roots).

For the suggested repository workflow used in this repo (and in general), see [AGENTS.md](./AGENTS.md).

Current tool surface:

- `config_bootstrap`
- `config_upsert_repo`
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

If that file does not exist yet, the server still starts and exposes the full tool surface. Global config is optional at runtime: repositories can also be authorized through a fixed repo-local policy file at `.git-unleash.yaml`.

`config_bootstrap` and `config_upsert_repo` can still create or update the YAML when you want an external allowlist.

Example:

```yaml
defaults:
  allowed_branch_patterns:
    - "^main$"
  feature_branch_pattern: "<user>/<feature-name>"
  git_worktree_base_path: /tmp/git-worktrees
  allow_draft_prs: true
  branching_policies:
    - worktree

always_allowed_branch_patterns:
  - "^<user>/.*$"

repositories:
  - path: ~/projects/codex-git-unleash-mcp
    default_remote: origin
  - path: ~/projects/another-repo
    branching_policies:
      - current_branch
      - feature_branch
    allowed_branch_patterns:
      - "^feature/[a-z0-9._-]+$"
    feature_branch_pattern: "feature/<feature-name>"
    allow_draft_prs: false
```

Notes:

- `path` must be an absolute path or start with `~/`
- `config_bootstrap` creates a minimal valid YAML config file and refuses to overwrite an existing file
- `config_upsert_repo` adds or updates one repository entry in the YAML config and matches existing entries by canonical repository path
- config changes are reloaded from disk on the next tool call, so a server restart is not required after `config_bootstrap` or `config_upsert_repo`
- top-level `defaults` are optional and may define `allowed_branch_patterns`, `feature_branch_pattern`, `git_worktree_base_path`, `default_remote`, `allow_draft_prs`, and `branching_policies`
- top-level `always_allowed_branch_patterns` are optional and are appended to every repository's effective branch policy
- repository values override top-level defaults field-by-field
- `defaults.allowed_branch_patterns` are inherited or overridden, while `always_allowed_branch_patterns` are always added
- `feature_branch_pattern` is an optional suggested naming template for new feature branches; it is advisory metadata and does not grant permission to use a branch name that fails `allowed_branch_patterns`
- `allowed_branch_patterns`, `always_allowed_branch_patterns`, and `feature_branch_pattern` support a dedicated `<user>` placeholder, resolved from `USER`, then `USERNAME`, then the system account username; other environment-variable expansion is intentionally not supported
- `git_worktree_base_path` is inherited or overridden per repository and, when configured, constrains `git_worktree_add.path` to stay under that base
- for Codex workflows, prefer a repo-specific in-repository worktree base such as `.worktrees/` when you want linked worktrees to stay under the same trusted project root; add that directory to `.gitignore`
- `branching_policies` is optional and enforced for branch-setup tools; supported values are `worktree`, `feature_branch`, and `current_branch`
- `worktree` means the preferred setup flow is `git_worktree_add`
- `feature_branch` means the preferred setup flow is `git_branch_create_and_switch`
- `current_branch` means do not create a new worktree or feature branch; work directly on the current allowed branch
- when `branching_policies` contains multiple values, any matching setup flow is allowed
- branch patterns are full-match regexes against the current branch name
- each repository must end up with at least one effective allowed branch pattern, either from the repo entry, inherited `defaults`, or `always_allowed_branch_patterns`
- `git_repo_policy` returns the configured branch patterns and related repository defaults for an authorized repository, including `feature_branch_pattern`, `git_worktree_base_path`, `branching_policies`, the policy source, and the repo-local config path when applicable
- `git_add`, `git_commit`, `git_push`, and `gh_pr_create_draft` require the current branch to match one of the configured patterns
- `git_fetch` only requires the repository to be authorized, fetches from the resolved remote, and uses an explicit branch when provided or the detected base branch otherwise
- `git_worktree_add` requires an explicit absolute target path, validates the requested new branch name against `allowed_branch_patterns`, creates a linked worktree from an explicit or detected upstream base branch, and is only allowed when `branching_policies` is unset or includes `worktree`
- when `git_worktree_base_path` is configured, `git_worktree_add.path` must resolve under that base path
- `git_branch_create_and_switch` and `git_branch_switch` require a clean worktree
- `git_branch_create_and_switch` also requires the requested new branch name to match `allowed_branch_patterns`, and is only allowed when `branching_policies` is unset or includes `feature_branch`
- remote resolution prefers configured `default_remote` when present and valid, then the current branch's remote, then `origin`
- branch creation and PR base resolution prefer the remote HEAD branch and fall back to GitHub default-branch detection when needed
- `git_status` only requires the repository to be authorized

### Repo-Local Policy

Repositories can opt into zero-setup authorization with a fixed repo-local file at `.git-unleash.yaml` in the repository root.

Example:

```yaml
allowed_branch_patterns:
  - "^<user>/.*$"
feature_branch_pattern: "<user>/<feature-name>"
git_worktree_base_path: .worktrees
branching_policies:
  - worktree
allow_global_repo_overrides:
  - feature_branch_pattern
```

Repo-local policy rules:

- `.git-unleash.yaml` is authoritative for the repository when it exists
- global config still works as a fallback when a repository does not define `.git-unleash.yaml`
- `allowed_branch_patterns` always come from `.git-unleash.yaml`; top-level `defaults` from the global config never override repo-local policy
- `default_remote` is never inherited from the global config when `.git-unleash.yaml` is present
- `allow_global_repo_overrides` is optional and may list `feature_branch_pattern`, `git_worktree_base_path`, `allow_draft_prs`, and `branching_policies`
- `allow_global_repo_overrides` only applies values from the matching repository entry in the global config; inherited top-level `defaults` never override `.git-unleash.yaml`
- for repo-local policy, `git_worktree_base_path` may be relative to the repository root
- repo-local policy must not set `default_remote`
- runtime tools fetch the trusted base branch of the current repository instance, compare the repo-local policy in base, index, and working tree, and fail closed on any divergence
- in a fork, the fork's own base branch is authoritative for repo-local policy
- this prevents locally widened repo-local policy from being used for MCP operations

Example opt-in override from a matching global repository entry:

Global config:

```yaml
defaults:
  feature_branch_pattern: "defaults-do-not-win/<feature-name>"

repositories:
  - path: /Users/alice/project
    feature_branch_pattern: "bob/<feature-name>"
```

Repo-local `.git-unleash.yaml`:

```yaml
allowed_branch_patterns:
  - "^[a-zA-Z0-9.]/.*$"
feature_branch_pattern: "<user>/<feature-name>"
allow_global_repo_overrides:
  - feature_branch_pattern
```

Effective policy:

```yaml
allowed_branch_patterns:
  - "^[a-zA-Z0-9.]/.*$"
feature_branch_pattern: "bob/<feature-name>"
```

In that example, the matching repository entry overrides `feature_branch_pattern`, while the global `defaults.feature_branch_pattern` is ignored because repo-local policy did not opt into defaults and defaults never override `.git-unleash.yaml`.

## Workflow Summary

The intended happy path is:

1. If the config file does not exist yet, call `config_bootstrap` to create it.
2. Call `config_upsert_repo` to add or update an allowlisted repository entry when needed.
3. Or check in `.git-unleash.yaml` to authorize the repository through repo-local policy instead of the global YAML.
4. Call `git_repo_policy` or `git_status` to inspect the authorized repository.
5. Before creating a branch, use `git_repo_policy` to confirm the configured `allowed_branch_patterns`, then choose a new branch name that matches that policy.
6. Call `git_branch_create_and_switch` to branch from an explicit or detected upstream base when you need a new local branch in the current worktree.
7. Call `git_worktree_add` when you need a separate linked worktree on a new allowed branch at an explicit absolute path.
8. Call `git_add` with explicit repository-relative paths.
9. Call `git_commit` with a normal commit message.
10. Call `git_push` to push the current branch to the resolved remote.
11. Call `gh_pr_create_draft` to open a draft PR against an explicit base or the detected default base branch.

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

If the config path points to a file that does not exist yet, the server still starts. Runtime tools can still operate on repositories that are authorized through `.git-unleash.yaml`; otherwise they behave as unauthorized until you create or update the global YAML.

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

- `config_bootstrap` to create the initial YAML config file when it does not exist yet; it writes a minimal valid config and the runtime tool handlers will see it on their next call
- `config_upsert_repo` to add or update one repository entry in the YAML config; it validates the resulting file against the existing schema, matches existing repos by canonical path, and the runtime tool handlers will see the updated policy on their next call
- `git_repo_policy` to inspect the configured path, canonical path, allowed branch patterns, suggested feature-branch pattern, configured worktree base path, default remote, draft-PR setting, and policy source for an authorized repository
- `git_status` for an authorized repository
- `git_add` for repository-relative paths inside an authorized repository; it rejects absolute paths and repository-escaping paths like `../x`
- `git_commit` with a normal commit message on an allowed branch; it rejects empty commit messages and empty commits
- `git_fetch` to fetch a plain branch name from the detected remote; it does not allow arbitrary fetch arguments or refspecs and uses an explicit branch when provided or the detected base branch otherwise
- `git_worktree_add` to create a linked worktree for a new allowed branch at an explicit absolute path; it fetches the explicit or detected base branch first, does not allow arbitrary refs, and enforces `git_worktree_base_path` when configured
- `git_branch_create_and_switch` to create a local branch from an explicit or detected upstream base and switch to it; it rejects requested branch names that do not match the configured allowed branch patterns
- `git_branch_switch` to switch to an existing local branch when the worktree is clean; it does not create branches or allow detached checkouts
- `git_push` to push the current branch to the detected remote; it only pushes `HEAD` to `refs/heads/<current-branch>` and does not allow arbitrary refspecs or force-like behavior
- `gh_pr_create_draft` to create a draft PR for the current branch using an explicit base or the detected default branch; it is draft-only and requires a non-empty title

Mutating tools reject detached HEAD.

When the global config file is missing, runtime tools remain registered. They can still authorize repositories through `.git-unleash.yaml`, and once the YAML exists, the next tool call reloads it from disk.

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
  - "^<user>/.*$"

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
    branching_policies:
      - current_branch
    allowed_branch_patterns:
      - "^main$"
  - path: ~/dot.files
    branching_policies:
      - current_branch
    allowed_branch_patterns:
      - "^main$"
```

If you want to bootstrap the config and then add this repository incrementally, a minimal progression is:

1. Call `config_bootstrap` with defaults such as `feature_branch_pattern`, `always_allowed_branch_patterns`, or `branching_policies`.
2. Call `config_upsert_repo` with `repo_path`, and optionally `git_worktree_base_path`, `default_remote`, `allowed_branch_patterns`, or `branching_policies`.
3. Use the Git tools against that repository; they will reload the YAML on each call.
```
