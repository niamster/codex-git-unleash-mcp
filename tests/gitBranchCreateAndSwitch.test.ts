import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  BranchAlreadyExistsError,
  BranchNameNotAllowedError,
  DirtyWorktreeError,
  EmptyBranchNameError,
} from "../src/errors.js";
import {
  getCurrentBranch,
  gitCreateBranchArgs,
  gitFetchBranchArgs,
  gitRemoteHeadArgs,
} from "../src/exec/git.js";
import { runCommand } from "../src/exec/run.js";
import { gitAdd } from "../src/tools/gitAdd.js";
import { gitBranchCreateAndSwitch } from "../src/tools/gitBranchCreateAndSwitch.js";
import { gitCommit } from "../src/tools/gitCommit.js";
import { gitPush } from "../src/tools/gitPush.js";
import { createLinkedWorktree, createTempBareGitRepo, createTempGitRepo } from "./helpers.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("gitBranchCreateAndSwitch", () => {
  it("creates a new branch from the detected upstream base and switches to it", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    tempPaths.push(repoDir, remoteDir);

    await runCommand({ cwd: repoDir, command: "git", argv: ["remote", "add", "origin", remoteDir] });
    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await gitAdd(repo, ["README.md"]);
    await gitCommit(repo, "add readme");
    await gitPush(repo, "main");
    await runCommand({
      cwd: remoteDir,
      command: "git",
      argv: ["symbolic-ref", "HEAD", "refs/heads/main"],
    });

    const result = await gitBranchCreateAndSwitch(
      {
        ...repo,
        allowedBranchPatterns: [/^feature\/.+$/],
      },
      { newBranch: "feature/test-pr" },
    );

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
    expect(headAfter).toBe("feature/test-pr");
    expect(newBranchOid.stdout.trim()).toBe(remoteBaseOid.stdout.trim());
  });

  it("rejects dirty worktrees before switching branches", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await fs.writeFile(path.join(repoDir, "README.md"), "dirty\n", "utf8");

    await expect(gitBranchCreateAndSwitch(repo, { newBranch: "feature/dirty" })).rejects.toBeInstanceOf(
      DirtyWorktreeError,
    );
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
    await runCommand({
      cwd: remoteDir,
      command: "git",
      argv: ["symbolic-ref", "HEAD", "refs/heads/main"],
    });
    await gitBranchCreateAndSwitch(repo, { newBranch: "feature/existing" });

    await expect(gitBranchCreateAndSwitch(repo, { newBranch: "feature/existing" })).rejects.toBeInstanceOf(
      BranchAlreadyExistsError,
    );
  });

  it("rejects empty branch names", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await expect(gitBranchCreateAndSwitch(repo, { newBranch: "   " })).rejects.toBeInstanceOf(
      EmptyBranchNameError,
    );
  });

  it("rejects branch names that do not match allowed patterns", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await expect(
      gitBranchCreateAndSwitch(
        {
          ...repo,
          allowedBranchPatterns: [/^feature\/.+$/],
        },
        { newBranch: "codex/disallowed" },
      ),
    ).rejects.toBeInstanceOf(BranchNameNotAllowedError);
  });

  it("uses an explicit upstream branch when provided", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    tempPaths.push(repoDir, remoteDir);

    await runCommand({ cwd: repoDir, command: "git", argv: ["remote", "add", "origin", remoteDir] });
    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await gitAdd(repo, ["README.md"]);
    await gitCommit(repo, "add readme");
    await gitPush(repo, "main");
    await runCommand({
      cwd: remoteDir,
      command: "git",
      argv: ["symbolic-ref", "HEAD", "refs/heads/main"],
    });

    await runCommand({ cwd: repoDir, command: "git", argv: ["checkout", "-b", "release"] });
    await fs.writeFile(path.join(repoDir, "RELEASE.md"), "release\n", "utf8");
    await gitAdd(repo, ["RELEASE.md"]);
    await gitCommit(repo, "add release notes");
    await gitPush(repo, "release");
    await runCommand({
      cwd: remoteDir,
      command: "git",
      argv: ["symbolic-ref", "HEAD", "refs/heads/main"],
    });
    await runCommand({ cwd: repoDir, command: "git", argv: ["checkout", "main"] });

    const result = await gitBranchCreateAndSwitch(repo, {
      newBranch: "feature/from-release",
      branch: "release",
    });
    const headAfter = await getCurrentBranch(repoDir);
    const newBranchOid = await runCommand({
      cwd: repoDir,
      command: "git",
      argv: ["rev-parse", "--verify", "refs/heads/feature/from-release"],
    });
    const remoteReleaseOid = await runCommand({
      cwd: repoDir,
      command: "git",
      argv: ["rev-parse", "--verify", "refs/remotes/origin/release"],
    });

    expect(result).toEqual({
      branch: "feature/from-release",
      remote: "origin",
      base: "release",
    });
    expect(headAfter).toBe("feature/from-release");
    expect(newBranchOid.stdout.trim()).toBe(remoteReleaseOid.stdout.trim());
  });

  it("creates and switches the branch in a linked worktree", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    const worktreeParentDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-worktree-parent-"));
    const worktreeDir = path.join(worktreeParentDir, "linked");
    tempPaths.push(repoDir, remoteDir, worktreeParentDir);

    await runCommand({ cwd: repoDir, command: "git", argv: ["remote", "add", "origin", remoteDir] });
    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await gitAdd(repo, ["README.md"]);
    await gitCommit(repo, "add readme");
    await gitPush(repo, "main");
    await runCommand({
      cwd: remoteDir,
      command: "git",
      argv: ["symbolic-ref", "HEAD", "refs/heads/main"],
    });

    const linkedWorktree = await createLinkedWorktree(repoDir, worktreeDir);
    const result = await gitBranchCreateAndSwitch(
      {
        ...repo,
        worktreePath: linkedWorktree,
        allowedBranchPatterns: [/^feature\/.+$/],
      },
      { newBranch: "feature/from-worktree" },
    );

    await expect(getCurrentBranch(linkedWorktree)).resolves.toBe("feature/from-worktree");
    await expect(getCurrentBranch(repoDir)).resolves.toBe("main");
    expect(result).toEqual({
      branch: "feature/from-worktree",
      remote: "origin",
      base: "main",
    });
  });

  it("uses fixed git fetch, branch creation, and remote-head argument shapes", () => {
    expect(gitFetchBranchArgs("origin", "main")).toEqual(["fetch", "origin", "main"]);
    expect(gitCreateBranchArgs("feature/test-pr", "refs/remotes/origin/main")).toEqual([
      "branch",
      "feature/test-pr",
      "refs/remotes/origin/main",
    ]);
    expect(gitRemoteHeadArgs("origin")).toEqual(["ls-remote", "--symref", "origin", "HEAD"]);
  });
});
