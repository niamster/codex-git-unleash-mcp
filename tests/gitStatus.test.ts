import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getGitStatus } from "../src/tools/gitStatus.js";
import { createTempGitRepo } from "./helpers.js";

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
});
