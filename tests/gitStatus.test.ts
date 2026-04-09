import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getGitStatus } from "../src/tools/gitStatus.js";
import { runCommand } from "../src/exec/run.js";
import { configureTestGitRepo, createLinkedWorktree, createTempGitRepo } from "./helpers.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("getGitStatus", () => {
  it("returns branch and cleanliness for an initialized repository", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);
    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");

    const status = await getGitStatus(repo);

    expect(status.branch).toBeTruthy();
    expect(status.isClean).toBe(false);
    expect(status.stdout).toContain("README.md");
  });

  it("reads status from a linked worktree instead of the configured main checkout", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const worktreeDir = path.join(os.tmpdir(), `git-mcp-worktree-${Math.random().toString(16).slice(2)}`);
    tempPaths.push(repoDir, worktreeDir);

    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await runCommand({ cwd: repoDir, command: "git", argv: ["add", "README.md"] });
    await configureTestGitRepo(repoDir);
    await runCommand({ cwd: repoDir, command: "git", argv: ["commit", "-m", "init"] });

    const linkedWorktree = await createLinkedWorktree(repoDir, worktreeDir);
    await fs.writeFile(path.join(linkedWorktree, "WORKTREE.md"), "only here\n", "utf8");

    const status = await getGitStatus({
      ...repo,
      worktreePath: linkedWorktree,
    });

    expect(status.isClean).toBe(false);
    expect(status.stdout).toContain("WORKTREE.md");
    expect(status.stdout).not.toContain("README.md");
  });
});
