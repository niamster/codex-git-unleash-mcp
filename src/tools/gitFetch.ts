import { PathValidationError } from "../errors.js";
import { fetchBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";
import { resolveRepoBaseBranch, resolveRepoRemote } from "./runtimeDefaults.js";

export type GitFetchResult = {
  remote: string;
  branch: string;
};

export async function gitFetch(repo: RepoPolicy, input: { branch?: string }): Promise<GitFetchResult> {
  const remote = await resolveRepoRemote(repo);
  const branch = (input.branch?.trim() || (await resolveRepoBaseBranch(repo, remote))).trim();

  if (!isPlainBranchName(branch)) {
    throw new PathValidationError(`branch '${branch}' must be a plain branch name`);
  }

  await fetchBranch(repo.worktreePath, remote, branch);

  return {
    remote,
    branch,
  };
}

function isPlainBranchName(branch: string): boolean {
  if (branch.startsWith("-")) {
    return false;
  }

  if (branch.length === 0) {
    return false;
  }

  if (branch.startsWith("/") || branch.endsWith("/")) {
    return false;
  }

  if (branch.startsWith("refs/")) {
    return false;
  }

  if (branch.includes("//")) {
    return false;
  }

  return /^[A-Za-z0-9._/-]+$/.test(branch);
}
