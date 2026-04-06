import { PathValidationError } from "../errors.js";
import { fetchBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";
import { resolveRepoRemote } from "./runtimeDefaults.js";

export type GitFetchResult = {
  remote: string;
  branch: string;
};

export async function gitFetch(repo: RepoPolicy, input: { branch?: string }): Promise<GitFetchResult> {
  const branch = normalizeFetchBranch(input.branch);
  const remote = await resolveRepoRemote(repo);

  await fetchBranch(repo.canonicalPath, remote, branch);

  return {
    remote,
    branch,
  };
}

function normalizeFetchBranch(branch: string | undefined): string {
  const normalized = branch?.trim() ?? "";
  if (!normalized) {
    return "main";
  }

  if (!isPlainBranchName(normalized)) {
    throw new PathValidationError(`branch '${normalized}' must be a plain branch name`);
  }

  return normalized;
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
