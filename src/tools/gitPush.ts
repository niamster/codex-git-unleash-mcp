import { pushBranch } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";
import { resolveRepoRemote } from "./runtimeDefaults.js";

export type GitPushResult = {
  remote: string;
  branch: string;
};

export async function gitPush(repo: RepoPolicy, branch: string): Promise<GitPushResult> {
  const remote = await resolveRepoRemote(repo);
  await pushBranch(repo.canonicalPath, remote, branch);

  return {
    remote,
    branch,
  };
}
