import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { BranchNotFoundError, DirtyWorktreeError, EmptyBranchNameError } from "../src/errors.js";
import { getCurrentBranch, gitSwitchBranchArgs } from "../src/exec/git.js";
import { runCommand } from "../src/exec/run.js";
import { gitAdd } from "../src/tools/gitAdd.js";
import { gitBranchCreate } from "../src/tools/gitBranchCreate.js";
import { gitBranchSwitch } from "../src/tools/gitBranchSwitch.js";
import { gitCommit } from "../src/tools/gitCommit.js";
import { gitPush } from "../src/tools/gitPush.js";
import { createTempBareGitRepo, createTempGitRepo } from "./helpers.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("gitBranchSwitch", () => {
  it("switches to an existing local branch when the worktree is clean", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    tempPaths.push(repoDir, remoteDir);

    await runCommand({ cwd: repoDir, command: "git", argv: ["remote", "add", "origin", remoteDir] });
    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await gitAdd(repo, ["README.md"]);
    await gitCommit(repo, "add readme");
    await gitPush(repo, "main");
    await gitBranchCreate(repo, "feature/switch-me");

    const result = await gitBranchSwitch(repo, "feature/switch-me");
    const currentBranch = await getCurrentBranch(repoDir);

    expect(result).toEqual({ branch: "feature/switch-me" });
    expect(currentBranch).toBe("feature/switch-me");
  });

  it("rejects switching when the worktree is dirty", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await fs.writeFile(path.join(repoDir, "README.md"), "dirty\n", "utf8");

    await expect(gitBranchSwitch(repo, "main")).rejects.toBeInstanceOf(DirtyWorktreeError);
  });

  it("rejects missing branches", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await expect(gitBranchSwitch(repo, "feature/missing")).rejects.toBeInstanceOf(BranchNotFoundError);
  });

  it("rejects empty branch names", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await expect(gitBranchSwitch(repo, "   ")).rejects.toBeInstanceOf(EmptyBranchNameError);
  });

  it("uses a fixed branch switch argument shape", () => {
    expect(gitSwitchBranchArgs("feature/switch-me")).toEqual(["checkout", "feature/switch-me"]);
  });
});
