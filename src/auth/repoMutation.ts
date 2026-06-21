import { requireAllowedBranch } from "./branchAuth.js";
import { BranchChangedDuringMutationError } from "../errors.js";
import { getCurrentBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";

const repoMutationQueues = new Map<string, Promise<void>>();

export async function withRepoMutationLock<T>(repo: RepoPolicy, operation: () => Promise<T>): Promise<T> {
  const repoKey = repo.worktreePath;
  const previous = repoMutationQueues.get(repoKey) ?? Promise.resolve();
  const ready = previous.catch(() => undefined);
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const queued = ready.then(() => current);
  repoMutationQueues.set(repoKey, queued);

  await ready;

  try {
    return await operation();
  } finally {
    releaseCurrent();
    if (repoMutationQueues.get(repoKey) === queued) {
      repoMutationQueues.delete(repoKey);
    }
  }
}

export async function withAllowedBranchMutation<T>(
  repo: RepoPolicy,
  operation: (branch: string) => Promise<T>,
): Promise<T> {
  return await withRepoMutationLock(repo, async () => {
    const branch = await requireAllowedBranch(repo);
    const result = await operation(branch);
    const currentBranch = await getCurrentBranch(repo.worktreePath);

    if (currentBranch !== branch) {
      throw new BranchChangedDuringMutationError(branch, currentBranch || null, repo.worktreePath);
    }

    return result;
  });
}
