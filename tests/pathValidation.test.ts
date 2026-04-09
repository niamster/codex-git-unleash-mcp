import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PathValidationError } from "../src/errors.js";
import { validateRepoRelativePaths, validateWorktreePath } from "../src/auth/pathValidation.js";

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

  it("accepts absolute worktree paths outside the repository root", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-path-root-"));
    const worktreeParent = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-worktree-parent-"));
    const worktreePath = path.join(worktreeParent, "linked");
    tempPaths.push(repoRoot, worktreeParent);
    const canonicalParent = await fs.realpath(worktreeParent);

    await expect(validateWorktreePath(repoRoot, worktreePath)).resolves.toBe(path.join(canonicalParent, "linked"));
  });

  it("rejects relative worktree paths", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-path-root-"));
    tempPaths.push(repoRoot);

    await expect(validateWorktreePath(repoRoot, "tmp/worktree")).rejects.toBeInstanceOf(PathValidationError);
  });

  it("rejects worktree paths inside the repository root", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-path-root-"));
    tempPaths.push(repoRoot);

    await expect(validateWorktreePath(repoRoot, path.join(repoRoot, "worktrees/feature"))).rejects.toBeInstanceOf(
      PathValidationError,
    );
  });
});
