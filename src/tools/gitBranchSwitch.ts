import { requireAllowedBranchName } from "../auth/branchAuth.js";
import { requireWorkflowMode } from "../auth/branchingPolicy.js";
import { BranchNotFoundError, DirtyWorktreeError, EmptyBranchNameError } from "../errors.js";
import { branchExists, switchBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";
import { getGitStatus } from "./gitStatus.js";

export type GitBranchSwitchResult = {
  branch: string;
};

export async function gitBranchSwitch(repo: RepoPolicy, branch: string): Promise<GitBranchSwitchResult> {
  requireWorkflowMode(repo, "git_branch_switch", ["feature_branch"]);

  const normalizedBranch = branch.trim();
  if (!normalizedBranch) {
    throw new EmptyBranchNameError();
  }
  requireAllowedBranchName(repo, normalizedBranch);

  const status = await getGitStatus(repo);
  if (!status.isClean) {
    throw new DirtyWorktreeError(repo.worktreePath);
  }

  if (!(await branchExists(repo.worktreePath, normalizedBranch))) {
    throw new BranchNotFoundError(normalizedBranch, repo.worktreePath);
  }

  await switchBranch(repo.worktreePath, normalizedBranch);

  return { branch: normalizedBranch };
}
