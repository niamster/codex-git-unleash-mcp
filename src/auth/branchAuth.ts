import { BranchNameNotAllowedError, BranchNotAllowedError, DetachedHeadError } from "../errors.js";
import { getCurrentBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";

const fullMatchCache = new WeakMap<RegExp, RegExp>();

export async function requireAllowedBranch(repo: RepoPolicy): Promise<string> {
  const branch = await getCurrentBranch(repo.worktreePath);
  if (!branch) {
    throw new DetachedHeadError(repo.worktreePath);
  }

  if (!isAllowedBranchName(repo, branch)) {
    throw new BranchNotAllowedError(branch, repo.worktreePath);
  }

  return branch;
}

export function requireAllowedBranchName(repo: RepoPolicy, branch: string): string {
  if (!isAllowedBranchName(repo, branch)) {
    throw new BranchNameNotAllowedError(branch, repo.worktreePath);
  }

  return branch;
}

export function isAllowedBranchName(repo: RepoPolicy, branch: string): boolean {
  return repo.allowedBranchPatterns.some((pattern) => fullMatch(pattern, branch));
}

export function fullMatch(pattern: RegExp, value: string): boolean {
  let fullPattern = fullMatchCache.get(pattern);
  if (!fullPattern) {
    fullPattern = new RegExp(`^(?:${pattern.source})$`, pattern.flags);
    fullMatchCache.set(pattern, fullPattern);
  }

  fullPattern.lastIndex = 0;
  return fullPattern.test(value);
}
