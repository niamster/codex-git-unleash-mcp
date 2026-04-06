import { describe, expect, it } from "vitest";

import { ghPrCreateDraftArgs, ghRepoViewDefaultBranchArgs } from "../src/exec/gh.js";

describe("gh argument builders", () => {
  it("builds constrained gh draft PR arguments", () => {
    expect(ghPrCreateDraftArgs("main", "Add feature", "Body")).toEqual([
      "pr",
      "create",
      "--draft",
      "--base",
      "main",
      "--title",
      "Add feature",
      "--body",
      "Body",
    ]);
  });

  it("builds constrained gh default-branch lookup arguments", () => {
    expect(ghRepoViewDefaultBranchArgs()).toEqual(["repo", "view", "--json", "defaultBranchRef"]);
  });
});
