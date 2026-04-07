import { BranchNameNotAllowedError, BranchNotAllowedError, DetachedHeadError } from "../errors.js";
import { getCurrentBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";

export async function requireAllowedBranch(repo: RepoPolicy): Promise<string> {
  const branch = await getCurrentBranch(repo.canonicalPath);
  if (!branch) {
    throw new DetachedHeadError(repo.canonicalPath);
  }

  if (!isAllowedBranchName(repo, branch)) {
    throw new BranchNotAllowedError(branch, repo.canonicalPath);
  }

  return branch;
}

export function requireAllowedBranchName(repo: RepoPolicy, branch: string): string {
  if (!isAllowedBranchName(repo, branch)) {
    throw new BranchNameNotAllowedError(branch, repo.canonicalPath);
  }

  return branch;
}

export function isAllowedBranchName(repo: RepoPolicy, branch: string): boolean {
  return repo.allowedBranchPatterns.some((pattern) => fullMatch(pattern, branch));
}

export function fullMatch(pattern: RegExp, value: string): boolean {
  const fullPattern = new RegExp(`^(?:${pattern.source})$`, pattern.flags);
  return fullPattern.test(value);
}
