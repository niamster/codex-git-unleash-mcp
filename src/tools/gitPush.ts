import { pushBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";

export type GitPushResult = {
  remote: string;
  branch: string;
};

export async function gitPush(repo: RepoPolicy, branch: string): Promise<GitPushResult> {
  await pushBranch(repo.canonicalPath, repo.defaultRemote, branch);

  return {
    remote: repo.defaultRemote,
    branch,
  };
}
