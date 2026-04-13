export type BranchingPolicy = "worktree" | "feature_branch" | "current_branch";
export type RepoPolicySource = "global" | "repo_local";
export type GlobalRepoOverrideField =
  | "feature_branch_pattern"
  | "git_worktree_base_path"
  | "allow_draft_prs"
  | "branching_policies";

export type RepoPolicyGlobalRepoOverrides = {
  featureBranchPattern?: string;
  gitWorktreeBasePath?: string;
  allowDraftPrs?: boolean;
  branchingPolicies?: BranchingPolicy[];
};

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
  globalRepoOverrides?: RepoPolicyGlobalRepoOverrides;
};

export type Config = {
  repositories: RepoPolicy[];
};
