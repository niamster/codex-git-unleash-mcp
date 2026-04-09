# Agents

## Required Workflow

For this repository, the following end-to-end workflow is required for repository changes:

1. inspect the repository policy and create a new linked worktree on a new branch with `git_unleash.git_worktree_add`
2. do planning and coding work
3. commit changes (prefer smaller, targeted commits)
4. push the current branch
5. create a draft PR
6. address PR review comments and iterate as needed, preferably one comment at a time or grouped by theme

Do not begin planning edits or making repository changes before step 1 is complete.

Before creating a development worktree, call `git_unleash.git_repo_policy` first. If the returned policy includes `featureBranchPattern`, prefer that pattern when choosing `new_branch`. Whether or not a suggested pattern is present, the chosen `new_branch` must still match the configured `allowed_branch_patterns`, which remain the enforcement boundary. If the returned policy includes `gitWorktreeBasePath`, choose the full `path` for `git_unleash.git_worktree_add` under that base path. Use that `new_branch` with `git_unleash.git_worktree_add`, and provide an explicit absolute worktree path. Do not assume a default prefix or reuse a prefix from another repository.

Note: other repositories may prefer `git_unleash.git_branch_create_and_switch` instead, especially very large repositories where creating an additional linked worktree is too expensive for the task.

The Git and GitHub operations for the steps above must be performed using the `git_unleash` MCP.
