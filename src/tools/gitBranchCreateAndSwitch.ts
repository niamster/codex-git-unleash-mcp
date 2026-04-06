import { BranchAlreadyExistsError, DirtyWorktreeError, EmptyBranchNameError } from "../errors.js";
import { branchExists, createBranch, fetchBranch, switchBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";
import { getGitStatus } from "./gitStatus.js";
import { resolveRepoBaseBranch, resolveRepoRemote } from "./runtimeDefaults.js";

export type GitBranchCreateAndSwitchResult = {
  branch: string;
  remote: string;
  base: string;
};

export async function gitBranchCreateAndSwitch(
  repo: RepoPolicy,
  input: { newBranch: string; branch?: string },
): Promise<GitBranchCreateAndSwitchResult> {
  const normalizedBranch = input.newBranch.trim();
  if (!normalizedBranch) {
    throw new EmptyBranchNameError();
  }

  const status = await getGitStatus(repo);
  if (!status.isClean) {
    throw new DirtyWorktreeError(repo.canonicalPath);
  }

  if (await branchExists(repo.canonicalPath, normalizedBranch)) {
    throw new BranchAlreadyExistsError(normalizedBranch, repo.canonicalPath);
  }

  const remote = await resolveRepoRemote(repo);
  const base = input.branch?.trim() || (await resolveRepoBaseBranch(repo, remote));

  await fetchBranch(repo.canonicalPath, remote, base);
  await createBranch(repo.canonicalPath, normalizedBranch, `refs/remotes/${remote}/${base}`);
  await switchBranch(repo.canonicalPath, normalizedBranch);

  return {
    branch: normalizedBranch,
    remote,
    base,
  };
}
