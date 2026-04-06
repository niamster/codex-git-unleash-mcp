import {
  BranchAlreadyExistsError,
  EmptyBranchNameError,
  MissingDefaultBaseBranchError,
} from "../errors.js";
import { branchExists, createBranch, fetchBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";

export type GitBranchCreateResult = {
  branch: string;
  remote: string;
  base: string;
};

export async function gitBranchCreate(repo: RepoPolicy, newBranch: string): Promise<GitBranchCreateResult> {
  const normalizedBranch = newBranch.trim();
  if (!normalizedBranch) {
    throw new EmptyBranchNameError();
  }

  const base = repo.defaultPrBase;
  if (!base) {
    throw new MissingDefaultBaseBranchError(repo.canonicalPath);
  }

  if (await branchExists(repo.canonicalPath, normalizedBranch)) {
    throw new BranchAlreadyExistsError(normalizedBranch, repo.canonicalPath);
  }

  await fetchBranch(repo.canonicalPath, repo.defaultRemote, base);
  await createBranch(repo.canonicalPath, normalizedBranch, `refs/remotes/${repo.defaultRemote}/${base}`);

  return {
    branch: normalizedBranch,
    remote: repo.defaultRemote,
    base,
  };
}
