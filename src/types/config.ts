export type WorkflowMode = "worktree" | "feature_branch" | "current_branch";
export type RepoPolicySource = "global" | "repo_local";

export type RepoPolicyOverrides = {
  allowedBranchPatterns?: RegExp[];
  featureBranchPattern?: string;
  gitWorktreeBasePath?: string;
  defaultRemote?: string;
  allowDraftPrs?: boolean;
  workflowMode?: WorkflowMode;
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
  workflowMode?: WorkflowMode;
  policySource: RepoPolicySource;
  repoLocalConfigPath?: string;
  repoLocalConfigRelativePath?: string;
  repoOverrides?: RepoPolicyOverrides;
  repoOverridesApplied?: boolean;
};

export type Config = {
  repositories: RepoPolicy[];
};
