import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getRegisteredToolNames, loadRuntimeConfig } from "../src/server.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("getRegisteredToolNames", () => {
  it("always returns the full tool surface", () => {
    expect(getRegisteredToolNames()).toEqual([
      "config_bootstrap",
      "config_upsert_repo",
      "git_repo_policy",
      "git_status",
      "git_add",
      "git_commit",
      "git_branch_create_and_switch",
      "git_branch_switch",
      "git_fetch",
      "git_worktree_add",
      "git_push",
      "gh_pr_create_draft",
    ]);
  });
});

describe("loadRuntimeConfig", () => {
  it("reloads config from disk for each call", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-runtime-reload-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-runtime-reload-${Date.now()}.yaml`);
    tempPaths.push(repoDir, configPath);

    await fs.writeFile(
      configPath,
      [
        "repositories:",
        `  - path: ${repoDir}`,
        "    allowed_branch_patterns:",
        '      - "^main$"',
      ].join("\n"),
      "utf8",
    );

    const firstConfig = await loadRuntimeConfig(configPath);
    expect(firstConfig.repositories[0]?.defaultRemote).toBeUndefined();

    await fs.writeFile(
      configPath,
      [
        "repositories:",
        `  - path: ${repoDir}`,
        "    allowed_branch_patterns:",
        '      - "^main$"',
        "    default_remote: upstream",
      ].join("\n"),
      "utf8",
    );

    const secondConfig = await loadRuntimeConfig(configPath);
    expect(secondConfig.repositories[0]?.defaultRemote).toBe("upstream");
  });

  it("returns an empty config when the global config file is missing", async () => {
    const configPath = path.join(os.tmpdir(), `git-mcp-runtime-missing-${Date.now()}.yaml`);
    tempPaths.push(configPath);

    await expect(loadRuntimeConfig(configPath)).resolves.toEqual({ repositories: [] });
  });
});
