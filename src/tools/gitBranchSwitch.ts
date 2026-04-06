import { BranchNotFoundError, DirtyWorktreeError, EmptyBranchNameError } from "../errors.js";
import { branchExists, switchBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";
import { getGitStatus } from "./gitStatus.js";

export type GitBranchSwitchResult = {
  branch: string;
};

export async function gitBranchSwitch(repo: RepoPolicy, branch: string): Promise<GitBranchSwitchResult> {
  const normalizedBranch = branch.trim();
  if (!normalizedBranch) {
    throw new EmptyBranchNameError();
  }

  const status = await getGitStatus(repo);
  if (!status.isClean) {
    throw new DirtyWorktreeError(repo.canonicalPath);
  }

  if (!(await branchExists(repo.canonicalPath, normalizedBranch))) {
    throw new BranchNotFoundError(normalizedBranch, repo.canonicalPath);
  }

  await switchBranch(repo.canonicalPath, normalizedBranch);

  return { branch: normalizedBranch };
}
