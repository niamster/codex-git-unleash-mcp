import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ConfigError } from "../src/errors.js";
import { createServer, getRegisteredToolNames, loadRuntimeConfig } from "../src/server.js";

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
      "git_sync_base",
      "git_pull_current_branch",
      "git_worktree_add",
      "git_push",
      "gh_pr_create_draft",
    ]);
  });
});

describe("createServer", () => {
  it("registers explicit tool annotations that match the tool contracts", () => {
    const server = createServer("/tmp/config.yaml") as unknown as {
      _registeredTools: Record<string, { annotations?: Record<string, boolean> }>;
    };

    const annotationsByTool = Object.fromEntries(
      Object.entries(server._registeredTools).map(([name, tool]) => [name, tool.annotations ?? {}]),
    );

    expect(annotationsByTool).toEqual({
      config_bootstrap: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      config_upsert_repo: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
      git_repo_policy: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      git_status: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      git_add: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      git_commit: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      git_branch_create_and_switch: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
      git_branch_switch: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
      git_fetch: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      git_sync_base: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
      git_pull_current_branch: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
      git_worktree_add: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      git_push: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      gh_pr_create_draft: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
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

  it("raises a config error with bootstrap guidance when the file is missing", async () => {
    const configPath = path.join(os.tmpdir(), `git-mcp-runtime-missing-${Date.now()}.yaml`);
    tempPaths.push(configPath);

    await expect(loadRuntimeConfig(configPath)).rejects.toEqual(
      new ConfigError(
        `config file '${configPath}' does not exist; call 'config_bootstrap' to create it or 'config_upsert_repo' to create it with a repository entry`,
      ),
    );
  });
});
