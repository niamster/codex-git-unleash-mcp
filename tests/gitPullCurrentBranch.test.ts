import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DirtyWorktreeError, GitPullCurrentBranchConflictError } from "../src/errors.js";
import { hasMergeInProgress } from "../src/exec/git.js";
import { runCommand } from "../src/exec/run.js";
import { gitAdd } from "../src/tools/gitAdd.js";
import { gitBranchCreateAndSwitch } from "../src/tools/gitBranchCreateAndSwitch.js";
import { gitCommit } from "../src/tools/gitCommit.js";
import { gitPullCurrentBranch } from "../src/tools/gitPullCurrentBranch.js";
import { gitPush } from "../src/tools/gitPush.js";
import { configureTestGitRepo, createTempBareGitRepo, createTempGitRepo } from "./helpers.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("gitPullCurrentBranch", () => {
  it("fetches and merges the current branch from the resolved remote", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    const updaterDir = await fs.mkdtemp(path.join(path.dirname(repoDir), "git-mcp-pull-updater-"));
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
      { newBranch: "feature/pr-branch" },
    );
    const featureRepo = {
      ...repo,
      worktreePath: repoDir,
      allowedBranchPatterns: [/^feature\/.+$/],
    };
    await fs.writeFile(path.join(repoDir, "FEATURE.md"), "local feature\n", "utf8");
    await gitAdd(featureRepo, ["FEATURE.md"]);
    await gitCommit(featureRepo, "add feature");
    await gitPush(featureRepo, "feature/pr-branch");

    await runCommand({ cwd: updaterDir, command: "git", argv: ["clone", remoteDir, "."] });
    await configureTestGitRepo(updaterDir);
    await runCommand({ cwd: updaterDir, command: "git", argv: ["checkout", "feature/pr-branch"] });
    await fs.writeFile(path.join(updaterDir, "REMOTE.md"), "remote update\n", "utf8");
    await runCommand({ cwd: updaterDir, command: "git", argv: ["add", "REMOTE.md"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["commit", "-m", "remote feature update"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["push", "origin", "HEAD:refs/heads/feature/pr-branch"] });

    const result = await gitPullCurrentBranch(featureRepo);
    const remoteFile = await fs.readFile(path.join(repoDir, "REMOTE.md"), "utf8");
    const headOid = await runCommand({
      cwd: repoDir,
      command: "git",
      argv: ["rev-parse", "--verify", "HEAD"],
    });
    const remoteBranchOid = await runCommand({
      cwd: repoDir,
      command: "git",
      argv: ["rev-parse", "--verify", "refs/remotes/origin/feature/pr-branch"],
    });

    expect(result).toEqual({
      branch: "feature/pr-branch",
      remote: "origin",
      remoteRef: "refs/remotes/origin/feature/pr-branch",
    });
    expect(remoteFile).toBe("remote update\n");
    expect(headOid.stdout.trim()).toBe(remoteBranchOid.stdout.trim());
  });

  it("rejects dirty worktrees before pulling", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await fs.writeFile(path.join(repoDir, "README.md"), "dirty\n", "utf8");

    await expect(gitPullCurrentBranch(repo)).rejects.toBeInstanceOf(DirtyWorktreeError);
  });

  it("aborts the merge and raises a conflict error when the pull conflicts", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    const updaterDir = await fs.mkdtemp(path.join(path.dirname(repoDir), "git-mcp-pull-conflict-updater-"));
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
      { newBranch: "feature/conflict-pull" },
    );
    const featureRepo = {
      ...repo,
      worktreePath: repoDir,
      allowedBranchPatterns: [/^feature\/.+$/],
    };
    await gitPush(featureRepo, "feature/conflict-pull");
    await fs.writeFile(path.join(repoDir, "README.md"), "local change\n", "utf8");
    await gitAdd(featureRepo, ["README.md"]);
    await gitCommit(featureRepo, "local update");

    await runCommand({ cwd: updaterDir, command: "git", argv: ["clone", remoteDir, "."] });
    await configureTestGitRepo(updaterDir);
    await runCommand({ cwd: updaterDir, command: "git", argv: ["checkout", "feature/conflict-pull"] });
    await fs.writeFile(path.join(updaterDir, "README.md"), "remote change\n", "utf8");
    await runCommand({ cwd: updaterDir, command: "git", argv: ["add", "README.md"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["commit", "-m", "remote conflicting update"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["push", "origin", "HEAD:refs/heads/feature/conflict-pull"] });

    await expect(gitPullCurrentBranch(featureRepo)).rejects.toBeInstanceOf(GitPullCurrentBranchConflictError);
    await expect(hasMergeInProgress(repoDir)).resolves.toBe(false);

    const status = await runCommand({
      cwd: repoDir,
      command: "git",
      argv: ["status", "--short"],
    });

    expect(status.stdout.trim()).toBe("");
  });
});
