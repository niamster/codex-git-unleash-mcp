# Agents

## Required Workflow

For this repository, the following end-to-end workflow is required for repository changes:

1. inspect the repository policy and create and switch to a new branch from the detected upstream base
2. do planning and coding work
3. commit changes (prefer smaller, targeted commits)
4. push the current branch
5. create a draft PR
6. address PR review comments and iterate as needed, preferably one comment at a time or grouped by theme

Do not begin planning edits or making repository changes on the current branch before step 1 is complete.

Before creating a development branch, call `git_unleash.git_repo_policy` and choose a branch name that matches the configured `allowed_branch_patterns`. Do not assume a default prefix or reuse a prefix from another repository.

The Git and GitHub operations for the steps above must be performed using the `git_unleash` MCP.
