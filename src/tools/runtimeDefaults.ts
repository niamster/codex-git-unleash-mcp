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
    if (await remoteExists(repo.canonicalPath, repo.defaultRemote)) {
      return repo.defaultRemote;
    }
  }

  const currentBranch = await getCurrentBranch(repo.canonicalPath);
  if (currentBranch) {
    const branchRemote = await getBranchRemote(repo.canonicalPath, currentBranch);
    if (branchRemote && (await remoteExists(repo.canonicalPath, branchRemote))) {
      return branchRemote;
    }
  }

  if (await remoteExists(repo.canonicalPath, "origin")) {
    return "origin";
  }

  throw new RemoteResolutionError(repo.canonicalPath);
}

export async function resolveRepoBaseBranch(repo: RepoPolicy, remote: string): Promise<string> {
  const remoteHeadBranch = await getRemoteHeadBranch(repo.canonicalPath, remote);
  if (remoteHeadBranch) {
    return remoteHeadBranch;
  }

  const ghDefaultBranch = await getRepoDefaultBranch(repo.canonicalPath);
  if (ghDefaultBranch) {
    return ghDefaultBranch;
  }

  throw new BaseBranchResolutionError(repo.canonicalPath, remote);
}
