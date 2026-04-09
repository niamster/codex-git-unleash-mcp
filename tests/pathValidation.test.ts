import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PathValidationError } from "../src/errors.js";
import {
  validateRepoRelativePaths,
  validateWorktreePath,
  validateWorktreePathAgainstBasePath,
} from "../src/auth/pathValidation.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("validateRepoRelativePaths", () => {
  it("accepts plain repository-relative paths", () => {
    expect(validateRepoRelativePaths("/repo", ["src/index.ts", "README.md"])).toEqual([
      path.normalize("src/index.ts"),
      "README.md",
    ]);
  });

  it("rejects absolute paths", () => {
    expect(() => validateRepoRelativePaths("/repo", ["/etc/passwd"])).toThrowError(PathValidationError);
  });

  it("rejects traversal outside the repository", () => {
    expect(() => validateRepoRelativePaths("/repo", ["../secret"])).toThrowError(PathValidationError);
  });

  it("accepts absolute worktree paths", async () => {
    const worktreeParent = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-worktree-parent-"));
    const worktreePath = path.join(worktreeParent, "linked");
    tempPaths.push(worktreeParent);
    const canonicalParent = await fs.realpath(worktreeParent);

    await expect(validateWorktreePath(worktreePath)).resolves.toBe(path.join(canonicalParent, "linked"));
  });

  it("rejects relative worktree paths", async () => {
    await expect(validateWorktreePath("tmp/worktree")).rejects.toBeInstanceOf(PathValidationError);
  });

  it("accepts worktree paths inside the repository root", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-path-root-"));
    tempPaths.push(repoRoot);

    await expect(validateWorktreePath(path.join(repoRoot, "worktrees/feature"))).resolves.toBe(
      path.join(await fs.realpath(repoRoot), "worktrees/feature"),
    );
  });

  it("enforces the configured worktree base path when present", async () => {
    const worktreeBaseParent = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-worktree-base-parent-"));
    const worktreeBasePath = path.join(worktreeBaseParent, "base");
    await fs.mkdir(worktreeBasePath);
    tempPaths.push(worktreeBaseParent);

    await expect(validateWorktreePathAgainstBasePath(path.join(worktreeBasePath, "linked"), worktreeBasePath)).resolves
      .toBe(path.join(await fs.realpath(worktreeBasePath), "linked"));
    await expect(
      validateWorktreePathAgainstBasePath(path.join(worktreeBaseParent, "outside"), worktreeBasePath),
    ).rejects.toBeInstanceOf(PathValidationError);
  });
});
