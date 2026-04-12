import type { RepoPolicy } from "../types/config.js";

export type GitRepoPolicyResult = {
  path: string;
  canonicalPath: string;
  allowedBranchPatterns: string[];
  featureBranchPattern?: string;
  gitWorktreeBasePath?: string;
  defaultRemote?: string;
  allowDraftPrs: boolean;
  branchingPolicies?: string[];
  policySource: string;
  repoLocalConfigPath?: string;
};

export function getGitRepoPolicy(repo: RepoPolicy): GitRepoPolicyResult {
  return {
    path: repo.path,
    canonicalPath: repo.canonicalPath,
    allowedBranchPatterns: repo.allowedBranchPatterns.map((pattern) => pattern.source),
    featureBranchPattern: repo.featureBranchPattern,
    gitWorktreeBasePath: repo.gitWorktreeBasePath,
    defaultRemote: repo.defaultRemote,
    allowDraftPrs: repo.allowDraftPrs,
    branchingPolicies: repo.branchingPolicies,
    policySource: repo.policySource,
    repoLocalConfigPath: repo.repoLocalConfigPath,
  };
}
