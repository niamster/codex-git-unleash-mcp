import { requireAllowedBranchName } from "../auth/branchAuth.js";
import { requireBranchingPolicy } from "../auth/branchingPolicy.js";
import { BranchAlreadyExistsError, DirtyWorktreeError, EmptyBranchNameError } from "../errors.js";
import { branchExists, createBranch, fetchBranch, switchBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";
import { getGitStatus } from "./gitStatus.js";
import { resolveRepoBaseBranch, resolveRepoRemote } from "./runtimeDefaults.js";

export type GitBranchCreateAndSwitchResult = {
  branch: string;
  remote: string;
  base: string;
};

export async function gitBranchCreateAndSwitch(
  repo: RepoPolicy,
  input: { newBranch: string; branch?: string },
): Promise<GitBranchCreateAndSwitchResult> {
  requireBranchingPolicy(repo, "git_branch_create_and_switch", ["branch"]);
  const normalizedBranch = input.newBranch.trim();
  if (!normalizedBranch) {
    throw new EmptyBranchNameError();
  }
  requireAllowedBranchName(repo, normalizedBranch);

  const status = await getGitStatus(repo);
  if (!status.isClean) {
    throw new DirtyWorktreeError(repo.worktreePath);
  }

  if (await branchExists(repo.worktreePath, normalizedBranch)) {
    throw new BranchAlreadyExistsError(normalizedBranch, repo.worktreePath);
  }

  const remote = await resolveRepoRemote(repo);
  const base = input.branch?.trim() || (await resolveRepoBaseBranch(repo, remote));

  await fetchBranch(repo.worktreePath, remote, base);
  await createBranch(repo.worktreePath, normalizedBranch, `refs/remotes/${remote}/${base}`);
  await switchBranch(repo.worktreePath, normalizedBranch);

  return {
    branch: normalizedBranch,
    remote,
    base,
  };
}
