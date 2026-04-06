import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getGitStatus } from "../src/tools/gitStatus.js";
import type { RepoPolicy } from "../src/types/config.js";
import { runCommand } from "../src/exec/run.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("getGitStatus", () => {
  it("returns branch and cleanliness for an initialized repository", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-repo-"));
    tempPaths.push(repoDir);

    await runCommand({ cwd: repoDir, command: "git", argv: ["init"] });
    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");

    const repo: RepoPolicy = {
      path: repoDir,
      canonicalPath: repoDir,
      allowedBranchPatterns: [/^.*/],
      defaultRemote: "origin",
      allowDraftPrs: true,
    };

    const status = await getGitStatus(repo);

    expect(status.branch).toBeTruthy();
    expect(status.isClean).toBe(false);
    expect(status.stdout).toContain("README.md");
  });
});
