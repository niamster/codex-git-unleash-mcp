import { requireAllowedBranchName } from "../auth/branchAuth.js";
import { requireBranchingPolicy } from "../auth/branchingPolicy.js";
import { validateWorktreePathAgainstBasePath } from "../auth/pathValidation.js";
import { BranchAlreadyExistsError, EmptyBranchNameError } from "../errors.js";
import { addWorktree, branchExists, fetchBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";
import { resolveRepoBaseBranch, resolveRepoRemote } from "./runtimeDefaults.js";

export type GitWorktreeAddResult = {
  branch: string;
  remote: string;
  base: string;
  path: string;
};

export async function gitWorktreeAdd(
  repo: RepoPolicy,
  input: { path: string; newBranch: string; branch?: string },
): Promise<GitWorktreeAddResult> {
  requireBranchingPolicy(repo, "git_worktree_add", ["worktree"]);
  const normalizedBranch = input.newBranch.trim();
  if (!normalizedBranch) {
    throw new EmptyBranchNameError();
  }
  requireAllowedBranchName(repo, normalizedBranch);

  if (await branchExists(repo.worktreePath, normalizedBranch)) {
    throw new BranchAlreadyExistsError(normalizedBranch, repo.worktreePath);
  }

  const worktreePath = await validateWorktreePathAgainstBasePath(input.path, repo.gitWorktreeBasePath);
  const remote = await resolveRepoRemote(repo);
  const base = input.branch?.trim() || (await resolveRepoBaseBranch(repo, remote));

  await fetchBranch(repo.worktreePath, remote, base);
  await addWorktree(repo.worktreePath, worktreePath, normalizedBranch, `refs/remotes/${remote}/${base}`);

  return {
    branch: normalizedBranch,
    remote,
    base,
    path: worktreePath,
  };
}
