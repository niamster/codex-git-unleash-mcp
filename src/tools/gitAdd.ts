import { validateRepoRelativePaths } from "../auth/pathValidation.js";
import { addPaths } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";

export type GitAddResult = {
  addedPaths: string[];
};

export async function gitAdd(repo: RepoPolicy, inputPaths: string[]): Promise<GitAddResult> {
  const validatedPaths = validateRepoRelativePaths(repo.worktreePath, inputPaths);
  await addPaths(repo.worktreePath, validatedPaths);

  return { addedPaths: validatedPaths };
}
