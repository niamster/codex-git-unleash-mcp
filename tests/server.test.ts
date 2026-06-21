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
      "git_stage",
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
      git_stage: {
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

  it("describes setup tool workflow mode requirements", () => {
    const server = createServer("/tmp/config.yaml") as unknown as {
      _registeredTools: Record<string, { description?: string }>;
    };

    expect(server._registeredTools.git_branch_create_and_switch?.description).toContain(
      "requires feature_branch in the effective allowed workflow modes",
    );
    expect(server._registeredTools.git_worktree_add?.description).toContain(
      "requires worktree in the effective allowed workflow modes",
    );
  });

  it("omits restartRequired from config tool responses", async () => {
    const configPath = path.join(os.tmpdir(), `git-mcp-config-tools-${Date.now()}.yaml`);
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-config-tools-repo-"));
    tempPaths.push(configPath, repoDir);

    const server = createServer(configPath) as unknown as {
      _registeredTools: Record<
        string,
        {
          handler: (input: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>;
        }
      >;
    };

    const bootstrapResult = await server._registeredTools.config_bootstrap!.handler({});
    expect(JSON.parse(bootstrapResult.content[0]!.text!)).toEqual({
      configPath,
      repositories: 0,
    });

    const upsertResult = await server._registeredTools.config_upsert_repo!.handler({ repo_path: repoDir });
    expect(JSON.parse(upsertResult.content[0]!.text!)).toEqual({
      configPath,
      action: "created",
      repo: { path: repoDir },
    });
  });

  it("describes automatic config reload behavior", () => {
    const server = createServer("/tmp/config.yaml") as unknown as {
      _registeredTools: Record<string, { description?: string }>;
    };

    expect(server._registeredTools.config_bootstrap?.description).toContain(
      "runtime tools load the new configuration on their next call",
    );
    expect(server._registeredTools.config_upsert_repo?.description).toContain(
      "runtime tools load the new configuration on their next call",
    );
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
