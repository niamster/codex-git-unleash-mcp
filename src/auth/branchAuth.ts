import { BranchNameNotAllowedError, BranchNotAllowedError, DetachedHeadError } from "../errors.js";
import { getCurrentBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";

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
  // We intentionally clone here instead of mutating RegExp.lastIndex in place.
  // This adds negligible overhead on our git-tool paths and keeps matching free
  // of shared mutable regex state even though issue #48 optimized for reuse.
  return new RegExp(pattern.source, pattern.flags).test(value);
}
