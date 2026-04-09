import { BaseBranchResolutionError, RemoteResolutionError } from "../errors.js";
import { getRepoDefaultBranch } from "../exec/gh.js";
import {
  getBranchRemote,
  getCurrentBranch,
  getRemoteHeadBranch,
  remoteExists,
} from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";

export async function resolveRepoRemote(repo: RepoPolicy): Promise<string> {
  if (repo.defaultRemote) {
    if (await remoteExists(repo.worktreePath, repo.defaultRemote)) {
      return repo.defaultRemote;
    }
  }

  const currentBranch = await getCurrentBranch(repo.worktreePath);
  if (currentBranch) {
    const branchRemote = await getBranchRemote(repo.worktreePath, currentBranch);
    if (branchRemote && (await remoteExists(repo.worktreePath, branchRemote))) {
      return branchRemote;
    }
  }

  if (await remoteExists(repo.worktreePath, "origin")) {
    return "origin";
  }

  throw new RemoteResolutionError(repo.worktreePath);
}

export async function resolveRepoBaseBranch(repo: RepoPolicy, remote: string): Promise<string> {
  const remoteHeadBranch = await getRemoteHeadBranch(repo.worktreePath, remote);
  if (remoteHeadBranch) {
    return remoteHeadBranch;
  }

  const ghDefaultBranch = await getRepoDefaultBranch(repo.worktreePath);
  if (ghDefaultBranch) {
    return ghDefaultBranch;
  }

  throw new BaseBranchResolutionError(repo.worktreePath, remote);
}
