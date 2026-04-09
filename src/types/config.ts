export type BranchingPolicy = "worktree" | "branch" | "current_branch";

export type RepoPolicy = {
  path: string;
  canonicalPath: string;
  worktreePath: string;
  allowedBranchPatterns: RegExp[];
  featureBranchPattern?: string;
  defaultRemote?: string;
  allowDraftPrs: boolean;
  branchingPolicy?: BranchingPolicy;
};

export type Config = {
  repositories: RepoPolicy[];
};
