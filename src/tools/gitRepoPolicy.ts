import type { RepoPolicy } from "../types/config.js";

export type GitRepoPolicyResult = {
  path: string;
  canonicalPath: string;
  allowedBranchPatterns: string[];
  featureBranchPattern?: string;
  gitWorktreeBasePath?: string;
  defaultRemote?: string;
  allowDraftPrs: boolean;
  workflowMode?: string;
  policySource: string;
  repoLocalConfigPath?: string;
  repoOverridesApplied: boolean;
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
    workflowMode: repo.workflowMode,
    policySource: repo.policySource,
    repoLocalConfigPath: repo.repoLocalConfigPath,
    repoOverridesApplied: repo.repoOverridesApplied ?? false,
  };
}
