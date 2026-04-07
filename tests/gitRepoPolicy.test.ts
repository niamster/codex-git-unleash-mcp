import { describe, expect, it } from "vitest";

import { getGitRepoPolicy } from "../src/tools/gitRepoPolicy.js";
import type { RepoPolicy } from "../src/types/config.js";

describe("getGitRepoPolicy", () => {
  it("returns the configured repository policy in a serializable shape", () => {
    const repo: RepoPolicy = {
      path: "/tmp/repo",
      canonicalPath: "/private/tmp/repo",
      allowedBranchPatterns: [/^dm\/.*$/, /^feature\/[a-z0-9._-]+$/],
      defaultRemote: "origin",
      allowDraftPrs: true,
    };

    expect(getGitRepoPolicy(repo)).toEqual({
      path: "/tmp/repo",
      canonicalPath: "/private/tmp/repo",
      allowedBranchPatterns: ["^dm\\/.*$", "^feature\\/[a-z0-9._-]+$"],
      defaultRemote: "origin",
      allowDraftPrs: true,
    });
  });
});
