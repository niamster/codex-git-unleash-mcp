export type RepoPolicy = {
  path: string;
  canonicalPath: string;
  allowedBranchPatterns: RegExp[];
  defaultRemote: string;
  defaultPrBase?: string;
  allowDraftPrs: boolean;
};

export type Config = {
  repositories: RepoPolicy[];
};
