import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveAllowedRepo } from "../src/auth/repoAuth.js";
import { RepoNotAllowedError } from "../src/errors.js";
import type { Config } from "../src/types/config.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("resolveAllowedRepo", () => {
  it("rejects a repository path that is not allowlisted", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-repo-"));
    tempPaths.push(repoDir);

    const config: Config = {
      repositories: [
        {
          path: "/tmp/other",
          canonicalPath: "/tmp/other",
          allowedBranchPatterns: [/^feature\/.+$/],
          allowDraftPrs: true,
        },
      ],
    };

    await expect(resolveAllowedRepo(config, repoDir)).rejects.toBeInstanceOf(RepoNotAllowedError);
  });
});
