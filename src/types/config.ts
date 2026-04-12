export type BranchingPolicy = "worktree" | "feature_branch" | "current_branch";
export type RepoPolicySource = "global" | "repo_local";

export type RepoPolicy = {
  path: string;
  canonicalPath: string;
  worktreePath: string;
  allowedBranchPatterns: RegExp[];
  featureBranchPattern?: string;
  gitWorktreeBasePath?: string;
  defaultRemote?: string;
  allowDraftPrs: boolean;
  branchingPolicies?: BranchingPolicy[];
  policySource: RepoPolicySource;
  repoLocalConfigPath?: string;
  repoLocalConfigRelativePath?: string;
};

export type Config = {
  repositories: RepoPolicy[];
};
