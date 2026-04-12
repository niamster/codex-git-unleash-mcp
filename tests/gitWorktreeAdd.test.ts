import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  BranchAlreadyExistsError,
  BranchNameNotAllowedError,
  BranchingPolicyViolationError,
  PathValidationError,
} from "../src/errors.js";
import { getCurrentBranch } from "../src/exec/git.js";
import { runCommand } from "../src/exec/run.js";
import { gitAdd } from "../src/tools/gitAdd.js";
import { gitCommit } from "../src/tools/gitCommit.js";
import { gitPush } from "../src/tools/gitPush.js";
import { gitWorktreeAdd } from "../src/tools/gitWorktreeAdd.js";
import { createTempBareGitRepo, createTempGitRepo } from "./helpers.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("gitWorktreeAdd", () => {
  it("creates a linked worktree for a new branch from the detected upstream base", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    const worktreeParentDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-worktree-add-parent-"));
    const worktreeDir = path.join(worktreeParentDir, "linked");
    tempPaths.push(repoDir, remoteDir, worktreeParentDir);
    const expectedWorktreePath = path.join(await fs.realpath(worktreeParentDir), "linked");

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

    const result = await gitWorktreeAdd(
      {
        ...repo,
        allowedBranchPatterns: [/^feature\/.+$/],
      },
      {
        path: worktreeDir,
        newBranch: "feature/from-worktree-add",
      },
    );

    await expect(getCurrentBranch(repoDir)).resolves.toBe("main");
    await expect(getCurrentBranch(result.path)).resolves.toBe("feature/from-worktree-add");
    expect(result).toEqual({
      branch: "feature/from-worktree-add",
      remote: "origin",
      base: "main",
      path: expectedWorktreePath,
    });
  });

  it("uses an explicit upstream branch when provided", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    const worktreeParentDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-worktree-add-explicit-parent-"));
    const worktreeDir = path.join(worktreeParentDir, "linked");
    tempPaths.push(repoDir, remoteDir, worktreeParentDir);
    const expectedWorktreePath = path.join(await fs.realpath(worktreeParentDir), "linked");

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
    await runCommand({ cwd: repoDir, command: "git", argv: ["checkout", "main"] });

    const result = await gitWorktreeAdd(repo, {
      path: worktreeDir,
      newBranch: "feature/from-release-worktree",
      branch: "release",
    });

    await expect(getCurrentBranch(result.path)).resolves.toBe("feature/from-release-worktree");
    expect(result).toEqual({
      branch: "feature/from-release-worktree",
      remote: "origin",
      base: "release",
      path: expectedWorktreePath,
    });
  });

  it("rejects branch names that do not match allowed patterns", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await expect(
      gitWorktreeAdd(
        {
          ...repo,
          allowedBranchPatterns: [/^feature\/.+$/],
        },
        {
          path: "/tmp/git-mcp-disallowed-worktree",
          newBranch: "owner/disallowed",
        },
      ),
    ).rejects.toBeInstanceOf(BranchNameNotAllowedError);
  });

  it("rejects worktree creation when branching_policies excludes worktree", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await expect(
      gitWorktreeAdd(
        {
          ...repo,
          branchingPolicies: ["feature_branch"],
        },
        {
          path: "/tmp/git-mcp-policy-mismatch-worktree",
          newBranch: "feature/from-worktree",
        },
      ),
    ).rejects.toBeInstanceOf(BranchingPolicyViolationError);
  });

  it("rejects worktree creation when branching_policies excludes worktree via current_branch-only mode", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await expect(
      gitWorktreeAdd(
        {
          ...repo,
          branchingPolicies: ["current_branch"],
        },
        {
          path: "/tmp/git-mcp-current-branch-worktree",
          newBranch: "feature/from-current-branch",
        },
      ),
    ).rejects.toBeInstanceOf(BranchingPolicyViolationError);
  });

  it("allows worktree creation when branching_policies includes worktree among multiple strategies", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    const worktreeParentDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-worktree-add-multi-parent-"));
    const worktreeDir = path.join(worktreeParentDir, "linked");
    tempPaths.push(repoDir, remoteDir, worktreeParentDir);
    const expectedWorktreePath = path.join(await fs.realpath(worktreeParentDir), "linked");

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

    const result = await gitWorktreeAdd(
      {
        ...repo,
        branchingPolicies: ["current_branch", "worktree"],
      },
      {
        path: worktreeDir,
        newBranch: "feature/multi-strategy-worktree",
      },
    );

    expect(result).toEqual({
      branch: "feature/multi-strategy-worktree",
      remote: "origin",
      base: "main",
      path: expectedWorktreePath,
    });
  });

  it("rejects duplicate local branch names", async () => {
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
    await runCommand({ cwd: repoDir, command: "git", argv: ["branch", "feature/existing"] });

    await expect(
      gitWorktreeAdd(
        {
          ...repo,
          allowedBranchPatterns: [/^feature\/.+$/],
        },
        {
          path: "/tmp/git-mcp-existing-branch-worktree",
          newBranch: "feature/existing",
        },
      ),
    ).rejects.toBeInstanceOf(BranchAlreadyExistsError);
  });

  it("allows worktree paths inside the repository root when no base path is configured", async () => {
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

    const result = await gitWorktreeAdd(repo, {
      path: path.join(repoDir, "nested-worktree"),
      newBranch: "feature/inside-repo",
    });

    await expect(getCurrentBranch(result.path)).resolves.toBe("feature/inside-repo");
  });

  it("rejects worktree paths outside the configured base path", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    const worktreeBaseParentDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-worktree-base-parent-"));
    const worktreeBaseDir = path.join(worktreeBaseParentDir, "base");
    await fs.mkdir(worktreeBaseDir);
    tempPaths.push(repoDir, remoteDir, worktreeBaseParentDir);

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

    await expect(
      gitWorktreeAdd(
        {
          ...repo,
          gitWorktreeBasePath: await fs.realpath(worktreeBaseDir),
        },
        {
          path: path.join(worktreeBaseParentDir, "outside"),
          newBranch: "feature/outside-base",
        },
      ),
    ).rejects.toBeInstanceOf(PathValidationError);
  });
});
