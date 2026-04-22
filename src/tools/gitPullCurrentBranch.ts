import { requireAllowedBranch } from "../auth/branchAuth.js";
import { CommandExecutionError, DirtyWorktreeError, GitPullCurrentBranchConflictError } from "../errors.js";
import { abortMerge, fetchBranch, hasMergeInProgress, mergeRefIntoCurrentBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";
import { getGitStatus } from "./gitStatus.js";
import { resolveRepoRemote } from "./runtimeDefaults.js";

export type GitPullCurrentBranchResult = {
  branch: string;
  remote: string;
  remoteRef: string;
};

export async function gitPullCurrentBranch(repo: RepoPolicy): Promise<GitPullCurrentBranchResult> {
  const branch = await requireAllowedBranch(repo);
  const status = await getGitStatus(repo);
  if (!status.isClean) {
    throw new DirtyWorktreeError(repo.worktreePath);
  }

  const remote = await resolveRepoRemote(repo);
  await fetchBranch(repo.worktreePath, remote, branch);
  const remoteRef = `refs/remotes/${remote}/${branch}`;

  try {
    await mergeRefIntoCurrentBranch(repo.worktreePath, remoteRef);
  } catch (error) {
    if (error instanceof CommandExecutionError) {
      await abortMergeIfNeeded(repo.worktreePath);
      throw new GitPullCurrentBranchConflictError(repo.worktreePath, branch, remoteRef);
    }

    throw error;
  }

  return {
    branch,
    remote,
    remoteRef,
  };
}

async function abortMergeIfNeeded(cwd: string): Promise<void> {
  if (!(await hasMergeInProgress(cwd))) {
    return;
  }

  try {
    await abortMerge(cwd);
  } catch {
    // Best effort cleanup: callers should never be left in a merge flow when abort works.
  }
}
