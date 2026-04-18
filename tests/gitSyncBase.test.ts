import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DirtyWorktreeError, GitSyncBaseConflictError } from "../src/errors.js";
import { hasMergeInProgress } from "../src/exec/git.js";
import { runCommand } from "../src/exec/run.js";
import { gitAdd } from "../src/tools/gitAdd.js";
import { gitBranchCreateAndSwitch } from "../src/tools/gitBranchCreateAndSwitch.js";
import { gitCommit } from "../src/tools/gitCommit.js";
import { gitPush } from "../src/tools/gitPush.js";
import { gitSyncBase } from "../src/tools/gitSyncBase.js";
import { createTempBareGitRepo, createTempGitRepo } from "./helpers.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("gitSyncBase", () => {
  it("merges the detected remote base branch into the current allowed branch", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    const updaterDir = await fs.mkdtemp(path.join(path.dirname(repoDir), "git-mcp-sync-updater-"));
    tempPaths.push(repoDir, remoteDir, updaterDir);

    await runCommand({ cwd: repoDir, command: "git", argv: ["remote", "add", "origin", remoteDir] });
    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await gitAdd(repo, ["README.md"]);
    await gitCommit(repo, "add readme");
    await gitPush(repo, "main");
    await runCommand({ cwd: remoteDir, command: "git", argv: ["symbolic-ref", "HEAD", "refs/heads/main"] });

    await gitBranchCreateAndSwitch(
      {
        ...repo,
        allowedBranchPatterns: [/^feature\/.+$/],
      },
      { newBranch: "feature/sync-base" },
    );

    await runCommand({ cwd: updaterDir, command: "git", argv: ["clone", remoteDir, "."] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["config", "user.name", "Codex Test"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["config", "user.email", "codex@example.com"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["config", "commit.gpgsign", "false"] });
    await fs.writeFile(path.join(updaterDir, "CHANGELOG.md"), "base update\n", "utf8");
    await runCommand({ cwd: updaterDir, command: "git", argv: ["add", "CHANGELOG.md"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["commit", "-m", "remote update"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["push", "origin", "HEAD:refs/heads/main"] });

    const result = await gitSyncBase({
      ...repo,
      worktreePath: repoDir,
      allowedBranchPatterns: [/^feature\/.+$/],
    });

    const changelog = await fs.readFile(path.join(repoDir, "CHANGELOG.md"), "utf8");
    const headOid = await runCommand({
      cwd: repoDir,
      command: "git",
      argv: ["rev-parse", "--verify", "HEAD"],
    });
    const remoteMainOid = await runCommand({
      cwd: repoDir,
      command: "git",
      argv: ["rev-parse", "--verify", "refs/remotes/origin/main"],
    });

    expect(result).toEqual({
      branch: "feature/sync-base",
      remote: "origin",
      base: "main",
      baseRef: "refs/remotes/origin/main",
    });
    expect(changelog).toBe("base update\n");
    expect(headOid.stdout.trim()).toBe(remoteMainOid.stdout.trim());
  });

  it("rejects dirty worktrees before syncing", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await fs.writeFile(path.join(repoDir, "README.md"), "dirty\n", "utf8");

    await expect(gitSyncBase(repo)).rejects.toBeInstanceOf(DirtyWorktreeError);
  });

  it("aborts the merge and raises a conflict error when sync conflicts", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    const updaterDir = await fs.mkdtemp(path.join(path.dirname(repoDir), "git-mcp-conflict-updater-"));
    tempPaths.push(repoDir, remoteDir, updaterDir);

    await runCommand({ cwd: repoDir, command: "git", argv: ["remote", "add", "origin", remoteDir] });
    await fs.writeFile(path.join(repoDir, "README.md"), "base\n", "utf8");
    await gitAdd(repo, ["README.md"]);
    await gitCommit(repo, "initial base");
    await gitPush(repo, "main");
    await runCommand({ cwd: remoteDir, command: "git", argv: ["symbolic-ref", "HEAD", "refs/heads/main"] });

    await gitBranchCreateAndSwitch(
      {
        ...repo,
        allowedBranchPatterns: [/^feature\/.+$/],
      },
      { newBranch: "feature/conflict-sync" },
    );
    await fs.writeFile(path.join(repoDir, "README.md"), "feature change\n", "utf8");
    await gitAdd(
      {
        ...repo,
        worktreePath: repoDir,
        allowedBranchPatterns: [/^feature\/.+$/],
      },
      ["README.md"],
    );
    await gitCommit(
      {
        ...repo,
        worktreePath: repoDir,
        allowedBranchPatterns: [/^feature\/.+$/],
      },
      "feature update",
    );

    await runCommand({ cwd: updaterDir, command: "git", argv: ["clone", remoteDir, "."] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["config", "user.name", "Codex Test"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["config", "user.email", "codex@example.com"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["config", "commit.gpgsign", "false"] });
    await fs.writeFile(path.join(updaterDir, "README.md"), "base change\n", "utf8");
    await runCommand({ cwd: updaterDir, command: "git", argv: ["add", "README.md"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["commit", "-m", "base update"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["push", "origin", "HEAD:refs/heads/main"] });

    const featureRepo = {
      ...repo,
      worktreePath: repoDir,
      allowedBranchPatterns: [/^feature\/.+$/],
    };

    await expect(gitSyncBase(featureRepo)).rejects.toBeInstanceOf(GitSyncBaseConflictError);
    await expect(hasMergeInProgress(repoDir)).resolves.toBe(false);

    const status = await runCommand({
      cwd: repoDir,
      command: "git",
      argv: ["status", "--short"],
    });

    expect(status.stdout.trim()).toBe("");
  });
});
