import { EmptyCommitError, EmptyCommitMessageError } from "../errors.js";
import { createCommit, getHeadCommit, hasStagedChanges } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";

export type GitCommitResult = {
  commitOid: string;
  summary: string;
};

export async function gitCommit(repo: RepoPolicy, message: string): Promise<GitCommitResult> {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    throw new EmptyCommitMessageError();
  }

  const stagedChanges = await hasStagedChanges(repo.canonicalPath);
  if (!stagedChanges) {
    throw new EmptyCommitError(repo.canonicalPath);
  }

  await createCommit(repo.canonicalPath, normalizedMessage);
  const headCommit = await getHeadCommit(repo.canonicalPath);

  return {
    commitOid: headCommit.oid,
    summary: headCommit.summary,
  };
}
