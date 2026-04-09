import { describe, expect, it } from "vitest";

import { getRegisteredToolNames } from "../src/server.js";

describe("getRegisteredToolNames", () => {
  it("returns only config tools when runtime config is unavailable", () => {
    expect(getRegisteredToolNames(false)).toEqual(["config_bootstrap", "config_upsert_repo"]);
  });

  it("returns config and git tools when runtime config is available", () => {
    expect(getRegisteredToolNames(true)).toEqual([
      "config_bootstrap",
      "config_upsert_repo",
      "git_repo_policy",
      "git_status",
      "git_add",
      "git_commit",
      "git_branch_create_and_switch",
      "git_branch_switch",
      "git_fetch",
      "git_worktree_add",
      "git_push",
      "gh_pr_create_draft",
    ]);
  });
});
