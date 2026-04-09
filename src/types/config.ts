export type RepoPolicy = {
  path: string;
  canonicalPath: string;
  worktreePath: string;
  allowedBranchPatterns: RegExp[];
  defaultRemote?: string;
  allowDraftPrs: boolean;
};

export type Config = {
  repositories: RepoPolicy[];
};
