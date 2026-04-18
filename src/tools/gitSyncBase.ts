import { requireAllowedBranch } from "../auth/branchAuth.js";
import { CommandExecutionError, DirtyWorktreeError, GitSyncBaseConflictError } from "../errors.js";
import { abortMerge, hasMergeInProgress, mergeRefIntoCurrentBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";
import { getGitStatus } from "./gitStatus.js";
import { gitFetch } from "./gitFetch.js";

export type GitSyncBaseResult = {
  branch: string;
  remote: string;
  base: string;
  baseRef: string;
};

export async function gitSyncBase(repo: RepoPolicy): Promise<GitSyncBaseResult> {
  const branch = await requireAllowedBranch(repo);
  const status = await getGitStatus(repo);
  if (!status.isClean) {
    throw new DirtyWorktreeError(repo.worktreePath);
  }

  const { remote, branch: base } = await gitFetch(repo, {});
  const baseRef = `refs/remotes/${remote}/${base}`;

  try {
    await mergeRefIntoCurrentBranch(repo.worktreePath, baseRef);
  } catch (error) {
    if (error instanceof CommandExecutionError) {
      await abortMergeIfNeeded(repo.worktreePath);
      throw new GitSyncBaseConflictError(repo.worktreePath, branch, baseRef);
    }

    throw error;
  }

  return {
    branch,
    remote,
    base,
    baseRef,
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
