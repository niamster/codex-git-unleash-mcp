import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EmptyCommitError, EmptyCommitMessageError } from "../src/errors.js";
import { gitAdd } from "../src/tools/gitAdd.js";
import { gitCommit } from "../src/tools/gitCommit.js";
import { createTempGitRepo } from "./helpers.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("gitCommit", () => {
  it("creates a commit from staged changes", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await gitAdd(repo, ["README.md"]);

    const result = await gitCommit(repo, "add readme");

    expect(result.commitOid).toMatch(/^[0-9a-f]{40}$/);
    expect(result.summary).toBe("add readme");
  });

  it("rejects empty commit messages", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await expect(gitCommit(repo, "   ")).rejects.toBeInstanceOf(EmptyCommitMessageError);
  });

  it("rejects empty commits", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await expect(gitCommit(repo, "empty commit")).rejects.toBeInstanceOf(EmptyCommitError);
  });
});
