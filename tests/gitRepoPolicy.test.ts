import { describe, expect, it } from "vitest";

import { getGitRepoPolicy } from "../src/tools/gitRepoPolicy.js";
import type { RepoPolicy } from "../src/types/config.js";

describe("getGitRepoPolicy", () => {
  it("returns the configured repository policy in a serializable shape", () => {
    const repo: RepoPolicy = {
      path: "/tmp/repo",
      canonicalPath: "/private/tmp/repo",
      worktreePath: "/private/tmp/repo",
      allowedBranchPatterns: [/^user\/.*$/, /^feature\/[a-z0-9._-]+$/],
      featureBranchPattern: "codex/<feature-name>",
      gitWorktreeBasePath: "/private/tmp/worktrees",
      defaultRemote: "origin",
      allowDraftPrs: true,
      branchingPolicies: ["current_branch", "feature_branch"],
    };

    expect(getGitRepoPolicy(repo)).toEqual({
      path: "/tmp/repo",
      canonicalPath: "/private/tmp/repo",
      allowedBranchPatterns: ["^user\\/.*$", "^feature\\/[a-z0-9._-]+$"],
      featureBranchPattern: "codex/<feature-name>",
      gitWorktreeBasePath: "/private/tmp/worktrees",
      defaultRemote: "origin",
      allowDraftPrs: true,
      branchingPolicies: ["current_branch", "feature_branch"],
    });
  });
});
