import { BaseBranchResolutionError, RemoteResolutionError } from "../errors.js";
import { getRepoDefaultBranch } from "../exec/gh.js";
import {
  getBranchRemote,
  getCurrentBranch,
  getLocalRemoteHeadBranch,
  getRemoteHeadBranch,
  remoteExists,
} from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";

export async function resolveRepoRemote(
  repo: RepoPolicy,
  options: { allowConfiguredDefaultRemote?: boolean } = {},
): Promise<string> {
  const allowConfiguredDefaultRemote = options.allowConfiguredDefaultRemote ?? true;

  if (allowConfiguredDefaultRemote && repo.defaultRemote) {
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

export async function resolveRepoBaseBranch(
  repo: RepoPolicy,
  remote: string,
  options: { preferLocal?: boolean } = {},
): Promise<string> {
  if (options.preferLocal) {
    const localRemoteHeadBranch = await getLocalRemoteHeadBranch(repo.worktreePath, remote);
    if (localRemoteHeadBranch) {
      return localRemoteHeadBranch;
    }
  }

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
