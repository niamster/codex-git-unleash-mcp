import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { BranchAlreadyExistsError, EmptyBranchNameError } from "../src/errors.js";
import { getCurrentBranch, gitCreateBranchArgs, gitFetchBranchArgs } from "../src/exec/git.js";
import { runCommand } from "../src/exec/run.js";
import { gitAdd } from "../src/tools/gitAdd.js";
import { gitBranchCreate } from "../src/tools/gitBranchCreate.js";
import { gitCommit } from "../src/tools/gitCommit.js";
import { gitPush } from "../src/tools/gitPush.js";
import { createTempBareGitRepo, createTempGitRepo } from "./helpers.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("gitBranchCreate", () => {
  it("creates a new local branch from the fetched upstream base without switching HEAD", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    tempPaths.push(repoDir, remoteDir);

    await runCommand({ cwd: repoDir, command: "git", argv: ["remote", "add", "origin", remoteDir] });
    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await gitAdd(repo, ["README.md"]);
    await gitCommit(repo, "add readme");
    await gitPush(repo, "main");

    const result = await gitBranchCreate(repo, "feature/test-pr");
    const headAfter = await getCurrentBranch(repoDir);
    const newBranchOid = await runCommand({
      cwd: repoDir,
      command: "git",
      argv: ["rev-parse", "--verify", "refs/heads/feature/test-pr"],
    });
    const remoteBaseOid = await runCommand({
      cwd: repoDir,
      command: "git",
      argv: ["rev-parse", "--verify", "refs/remotes/origin/main"],
    });

    expect(result).toEqual({
      branch: "feature/test-pr",
      remote: "origin",
      base: "main",
    });
    expect(headAfter).toBe("main");
    expect(newBranchOid.stdout.trim()).toBe(remoteBaseOid.stdout.trim());
  });

  it("rejects duplicate branch names", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    tempPaths.push(repoDir, remoteDir);

    await runCommand({ cwd: repoDir, command: "git", argv: ["remote", "add", "origin", remoteDir] });
    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await gitAdd(repo, ["README.md"]);
    await gitCommit(repo, "add readme");
    await gitPush(repo, "main");
    await gitBranchCreate(repo, "feature/existing");

    await expect(gitBranchCreate(repo, "feature/existing")).rejects.toBeInstanceOf(BranchAlreadyExistsError);
  });

  it("rejects empty branch names", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await expect(gitBranchCreate(repo, "   ")).rejects.toBeInstanceOf(EmptyBranchNameError);
  });

  it("uses fixed git fetch and branch argument shapes", () => {
    expect(gitFetchBranchArgs("origin", "main")).toEqual(["fetch", "origin", "main"]);
    expect(gitCreateBranchArgs("feature/test-pr", "refs/remotes/origin/main")).toEqual([
      "branch",
      "feature/test-pr",
      "refs/remotes/origin/main",
    ]);
  });
});
