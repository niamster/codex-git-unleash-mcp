import type { RepoPolicy } from "../types/config.js";

export type GitRepoPolicyResult = {
  path: string;
  canonicalPath: string;
  allowedBranchPatterns: string[];
  gitWorktreeBasePath?: string;
  defaultRemote?: string;
  allowDraftPrs: boolean;
  branchingPolicy?: string;
};

export function getGitRepoPolicy(repo: RepoPolicy): GitRepoPolicyResult {
  return {
    path: repo.path,
    canonicalPath: repo.canonicalPath,
    allowedBranchPatterns: repo.allowedBranchPatterns.map((pattern) => pattern.source),
    gitWorktreeBasePath: repo.gitWorktreeBasePath,
    defaultRemote: repo.defaultRemote,
    allowDraftPrs: repo.allowDraftPrs,
    branchingPolicy: repo.branchingPolicy,
  };
}
