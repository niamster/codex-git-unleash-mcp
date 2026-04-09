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
    expect(config.repositories[0]?.branchingPolicy).toBeUndefined();
    expect(config.repositories[0]?.featureBranchPattern).toBeUndefined();
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
        '    - "^user/.+$"',
        '  feature_branch_pattern: "user/<feature-name>"',
        "  default_remote: upstream",
        "  allow_draft_prs: false",
        "  branching_policy: worktree",
        "repositories:",
        `  - path: ${repoDir}`,
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^user\\/.+$"]);
    expect(config.repositories[0]?.featureBranchPattern).toBe("user/<feature-name>");
    expect(config.repositories[0]?.defaultRemote).toBe("upstream");
    expect(config.repositories[0]?.allowDraftPrs).toBe(false);
    expect(config.repositories[0]?.branchingPolicy).toBe("worktree");
  });

  it("appends always-allowed branch patterns to repository policy", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-global-patterns-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-global-patterns.yaml`);
    tempPaths.push(repoDir, configPath);

    await fs.writeFile(
      configPath,
      [
        'always_allowed_branch_patterns:',
        '  - "^user/.+$"',
        "repositories:",
        `  - path: ${repoDir}`,
        "    allowed_branch_patterns:",
        '      - "^main$"',
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual([
      "^main$",
      "^user\\/.+$",
    ]);
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
        '    - "^user/.+$"',
        '  feature_branch_pattern: "user/<feature-name>"',
        "  default_remote: upstream",
        "  allow_draft_prs: false",
        "  branching_policy: worktree",
        "repositories:",
        `  - path: ${repoDir}`,
        "    allowed_branch_patterns:",
        '      - "^feature/.+$"',
        '    feature_branch_pattern: "feature/<feature-name>"',
        "    default_remote: origin",
        "    allow_draft_prs: true",
        "    branching_policy: current_branch",
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^feature\\/.+$"]);
    expect(config.repositories[0]?.featureBranchPattern).toBe("feature/<feature-name>");
    expect(config.repositories[0]?.defaultRemote).toBe("origin");
    expect(config.repositories[0]?.allowDraftPrs).toBe(true);
    expect(config.repositories[0]?.branchingPolicy).toBe("current_branch");
  });

  it("appends always-allowed branch patterns to inherited defaults", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-defaults-plus-global-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-defaults-plus-global.yaml`);
    tempPaths.push(repoDir, configPath);

    await fs.writeFile(
      configPath,
      [
        "defaults:",
        "  allowed_branch_patterns:",
        '    - "^main$"',
        'always_allowed_branch_patterns:',
        '  - "^user/.+$"',
        "repositories:",
        `  - path: ${repoDir}`,
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual([
      "^main$",
      "^user\\/.+$",
    ]);
  });

  it("accepts repositories that only rely on always-allowed branch patterns", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-global-only-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-global-only.yaml`);
    tempPaths.push(repoDir, configPath);

    await fs.writeFile(
      configPath,
      ['always_allowed_branch_patterns:', '  - "^user/.+$"', "repositories:", `  - path: ${repoDir}`].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^user\\/.+$"]);
  });

  it("rejects repositories without effective branch patterns", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-no-patterns-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-no-patterns.yaml`);
    tempPaths.push(repoDir, configPath);

    await fs.writeFile(configPath, `repositories:\n  - path: ${repoDir}\n`, "utf8");

    await expect(loadConfig(configPath)).rejects.toThrow(
      `repository '${repoDir}' must define allowed_branch_patterns directly, inherit them from top-level defaults, or rely on always_allowed_branch_patterns`,
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

  it("accepts repository-level current-branch workflow policy without defaults", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-current-branch-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-current-branch.yaml`);
    tempPaths.push(repoDir, configPath);

    await fs.writeFile(
      configPath,
      [
        "repositories:",
        `  - path: ${repoDir}`,
        "    branching_policy: current_branch",
        "    allowed_branch_patterns:",
        '      - "^main$"',
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.branchingPolicy).toBe("current_branch");
  });
});
