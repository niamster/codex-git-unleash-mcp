import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("loadConfig", () => {
  it("loads config and applies defaults", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}.yaml`);
    tempPaths.push(repoDir, configPath);

    await fs.writeFile(
      configPath,
      `repositories:\n  - path: ${repoDir}\n    allowed_branch_patterns:\n      - "^feature/.+$"\n`,
      "utf8",
    );

    const config = await loadConfig(configPath);
    const canonicalRepoDir = await fs.realpath(repoDir);

    expect(config.repositories).toHaveLength(1);
    expect(config.repositories[0]?.canonicalPath).toBe(canonicalRepoDir);
    expect(config.repositories[0]?.defaultRemote).toBeUndefined();
    expect(config.repositories[0]?.allowDraftPrs).toBe(true);
    expect(config.repositories[0]?.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^feature\\/.+$"]);
  });

  it("inherits top-level defaults", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-defaults-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-defaults.yaml`);
    tempPaths.push(repoDir, configPath);

    await fs.writeFile(
      configPath,
      [
        "defaults:",
        "  allowed_branch_patterns:",
        '    - "^dm/.+$"',
        "  default_remote: upstream",
        "  allow_draft_prs: false",
        "repositories:",
        `  - path: ${repoDir}`,
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^dm\\/.+$"]);
    expect(config.repositories[0]?.defaultRemote).toBe("upstream");
    expect(config.repositories[0]?.allowDraftPrs).toBe(false);
  });

  it("lets repositories override top-level defaults", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-override-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-override.yaml`);
    tempPaths.push(repoDir, configPath);

    await fs.writeFile(
      configPath,
      [
        "defaults:",
        "  allowed_branch_patterns:",
        '    - "^dm/.+$"',
        "  default_remote: upstream",
        "  allow_draft_prs: false",
        "repositories:",
        `  - path: ${repoDir}`,
        "    allowed_branch_patterns:",
        '      - "^feature/.+$"',
        "    default_remote: origin",
        "    allow_draft_prs: true",
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^feature\\/.+$"]);
    expect(config.repositories[0]?.defaultRemote).toBe("origin");
    expect(config.repositories[0]?.allowDraftPrs).toBe(true);
  });

  it("rejects repositories without effective branch patterns", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-no-patterns-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-no-patterns.yaml`);
    tempPaths.push(repoDir, configPath);

    await fs.writeFile(configPath, `repositories:\n  - path: ${repoDir}\n`, "utf8");

    await expect(loadConfig(configPath)).rejects.toThrow(
      `repository '${repoDir}' must define allowed_branch_patterns directly or inherit them from top-level defaults`,
    );
  });

  it("expands home-directory paths", async () => {
    const fakeHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-home-"));
    const repoDir = path.join(fakeHomeDir, "projects", "git-mcp-home-repo");
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-home.yaml`);
    tempPaths.push(fakeHomeDir, configPath);

    await fs.mkdir(repoDir, { recursive: true });

    const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(fakeHomeDir);
    try {
      await fs.writeFile(
        configPath,
        `repositories:\n  - path: ~/projects/git-mcp-home-repo\n    allowed_branch_patterns:\n      - "^main$"\n`,
        "utf8",
      );

      const config = await loadConfig(configPath);
      const canonicalRepoDir = await fs.realpath(repoDir);

      expect(config.repositories[0]?.path).toBe(repoDir);
      expect(config.repositories[0]?.canonicalPath).toBe(canonicalRepoDir);
    } finally {
      homedirSpy.mockRestore();
    }
  });
});
