import { describe, expect, it } from "vitest";

import {
  gitAddArgs,
  gitBranchRemoteArgs,
  gitCommitArgs,
  gitCreateBranchArgs,
  gitFetchBranchArgs,
  gitPushArgs,
  gitRemoteGetUrlArgs,
  gitRemoteHeadArgs,
  gitSwitchBranchArgs,
  gitWorktreeAddArgs,
} from "../src/exec/git.js";

describe("git argument builders", () => {
  it("builds constrained git add arguments", () => {
    expect(gitAddArgs(["src/index.ts", "README.md"])).toEqual([
      "add",
      "--",
      "src/index.ts",
      "README.md",
    ]);
  });

  it("builds constrained git commit arguments", () => {
    expect(gitCommitArgs("test message")).toEqual(["commit", "-m", "test message"]);
  });

  it("builds constrained git push arguments", () => {
    expect(gitPushArgs("origin", "main")).toEqual(["push", "origin", "HEAD:refs/heads/main"]);
  });

  it("builds constrained git fetch arguments", () => {
    expect(gitFetchBranchArgs("origin", "main")).toEqual(["fetch", "origin", "main"]);
  });

  it("builds constrained git branch creation arguments", () => {
    expect(gitCreateBranchArgs("feature/test-pr", "refs/remotes/origin/main")).toEqual([
      "branch",
      "feature/test-pr",
      "refs/remotes/origin/main",
    ]);
  });

  it("builds constrained git branch switch arguments", () => {
    expect(gitSwitchBranchArgs("feature/test-pr")).toEqual(["checkout", "feature/test-pr"]);
  });

  it("builds constrained git worktree add arguments", () => {
    expect(gitWorktreeAddArgs("/tmp/worktree", "feature/test-pr", "refs/remotes/origin/main")).toEqual([
      "worktree",
      "add",
      "-b",
      "feature/test-pr",
      "/tmp/worktree",
      "refs/remotes/origin/main",
    ]);
  });

  it("builds constrained git remote resolution arguments", () => {
    expect(gitRemoteGetUrlArgs("origin")).toEqual(["remote", "get-url", "origin"]);
    expect(gitBranchRemoteArgs("feature/test-pr")).toEqual(["config", "--get", "branch.feature/test-pr.remote"]);
    expect(gitRemoteHeadArgs("origin")).toEqual(["ls-remote", "--symref", "origin", "HEAD"]);
  });
});
