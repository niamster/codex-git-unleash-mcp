export type BranchingPolicy = "worktree" | "feature_branch" | "current_branch";

export type RepoPolicy = {
  path: string;
  canonicalPath: string;
  worktreePath: string;
  allowedBranchPatterns: RegExp[];
  featureBranchPattern?: string;
  defaultRemote?: string;
  allowDraftPrs: boolean;
  branchingPolicies?: BranchingPolicy[];
};

export type Config = {
  repositories: RepoPolicy[];
};
