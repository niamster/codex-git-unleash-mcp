import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { bootstrapConfig, loadConfig, loadOptionalConfig, upsertRepoConfig } from "../src/config.js";
import { ConfigError } from "../src/errors.js";

const tempPaths: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
     expect(config.repositories[0]?.gitWorktreeBasePath).toBeUndefined();
     expect(config.repositories[0]?.allowDraftPrs).toBe(true);
     expect(config.repositories[0]?.featureBranchPattern).toBeUndefined();
     expect(config.repositories[0]?.workflowMode).toBeUndefined();
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
        "  git_worktree_base_path: ~/git-worktrees",
        "  default_remote: upstream",
        "  allow_draft_prs: false",
        "  workflow_mode: worktree",
        "repositories:",
        `  - path: ${repoDir}`,
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);
    const expectedBasePath = path.join(os.homedir(), "git-worktrees");

     expect(config.repositories[0]?.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^user\\/.+$"]);
     expect(config.repositories[0]?.featureBranchPattern).toBe("user/<feature-name>");
     expect(config.repositories[0]?.gitWorktreeBasePath).toBe(expectedBasePath);
     expect(config.repositories[0]?.defaultRemote).toBe("upstream");
    expect(config.repositories[0]?.allowDraftPrs).toBe(false);
    expect(config.repositories[0]?.workflowMode).toBe("worktree");
  });

  it("resolves <user> in inherited feature branch patterns from USER", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-user-pattern-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-user-pattern.yaml`);
    tempPaths.push(repoDir, configPath);
    vi.stubEnv("USER", "codex");
    vi.stubEnv("USERNAME", "");

    await fs.writeFile(
      configPath,
      [
        "defaults:",
        "  allowed_branch_patterns:",
        '    - "^codex/.+$"',
        '  feature_branch_pattern: "<user>/<feature-name>"',
        "repositories:",
        `  - path: ${repoDir}`,
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.featureBranchPattern).toBe("codex/<feature-name>");
  });

  it("resolves <user> in inherited allowed branch patterns from USER", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-user-allowed-pattern-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-user-allowed-pattern.yaml`);
    tempPaths.push(repoDir, configPath);
    vi.stubEnv("USER", "codex");
    vi.stubEnv("USERNAME", "");

    await fs.writeFile(
      configPath,
      [
        "defaults:",
        "  allowed_branch_patterns:",
        '    - "^<user>/.+$"',
        "repositories:",
        `  - path: ${repoDir}`,
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^codex\\/.+$"]);
  });

  it("escapes regex metacharacters when resolving <user> in allowed branch patterns", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-user-escaped-pattern-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-user-escaped-pattern.yaml`);
    tempPaths.push(repoDir, configPath);
    vi.stubEnv("USER", "john.doe+dev");
    vi.stubEnv("USERNAME", "");

    await fs.writeFile(
      configPath,
      [
        "defaults:",
        "  allowed_branch_patterns:",
        '    - "^<user>/.+$"',
        "repositories:",
        `  - path: ${repoDir}`,
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);
    const [pattern] = config.repositories[0]?.allowedBranchPatterns ?? [];

    expect(pattern?.source).toBe("^john\\.doe\\+dev\\/.+$");
    expect(pattern?.test("john.doe+dev/feature")).toBe(true);
    expect(pattern?.test("johnXdoe+dev/feature")).toBe(false);
  });

  it("keeps feature branch patterns advisory when resolving <user> with regex metacharacters", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-user-feature-pattern-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-user-feature-pattern.yaml`);
    tempPaths.push(repoDir, configPath);
    vi.stubEnv("USER", "john.doe+dev");
    vi.stubEnv("USERNAME", "");

    await fs.writeFile(
      configPath,
      [
        "repositories:",
        `  - path: ${repoDir}`,
        "    allowed_branch_patterns:",
        '      - "^<user>/.+$"',
        '    feature_branch_pattern: "<user>/<feature-name>"',
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.featureBranchPattern).toBe("john.doe+dev/<feature-name>");
  });

  it("falls back to USERNAME before os.userInfo for <user> resolution", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-username-pattern-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-username-pattern.yaml`);
    tempPaths.push(repoDir, configPath);
    vi.stubEnv("USER", "");
    vi.stubEnv("USERNAME", "codex-win");
    const userInfoSpy = vi.spyOn(os, "userInfo");

    await fs.writeFile(
      configPath,
      [
        "repositories:",
        `  - path: ${repoDir}`,
        "    allowed_branch_patterns:",
        '      - "^codex-win/.+$"',
        '    feature_branch_pattern: "<user>/<feature-name>"',
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.featureBranchPattern).toBe("codex-win/<feature-name>");
    expect(userInfoSpy).not.toHaveBeenCalled();
  });

  it("falls back to os.userInfo when USER and USERNAME are unavailable", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-userinfo-pattern-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-userinfo-pattern.yaml`);
    tempPaths.push(repoDir, configPath);
    vi.stubEnv("USER", "");
    vi.stubEnv("USERNAME", "");
    vi.spyOn(os, "userInfo").mockReturnValue({
      username: "system-user",
      uid: 501,
      gid: 20,
      shell: "/bin/zsh",
      homedir: "/Users/system-user",
    });

    await fs.writeFile(
      configPath,
      [
        "repositories:",
        `  - path: ${repoDir}`,
        "    allowed_branch_patterns:",
        '      - "^system-user/.+$"',
        '    feature_branch_pattern: "<user>/<feature-name>"',
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.featureBranchPattern).toBe("system-user/<feature-name>");
  });

  it("rejects <user> config values when no runtime username can be determined", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-missing-user-pattern-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-missing-user-pattern.yaml`);
    tempPaths.push(repoDir, configPath);
    vi.stubEnv("USER", "");
    vi.stubEnv("USERNAME", "");
    vi.spyOn(os, "userInfo").mockImplementation(() => {
      throw new Error("no user");
    });

    await fs.writeFile(
      configPath,
      [
        "repositories:",
        `  - path: ${repoDir}`,
        "    allowed_branch_patterns:",
        '      - "^<user>/.+$"',
        '    feature_branch_pattern: "<user>/<feature-name>"',
      ].join("\n"),
      "utf8",
    );

    await expect(loadConfig(configPath)).rejects.toThrow("config uses '<user>' but no runtime username could be determined");
  });

  it("lets repositories override top-level defaults", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-override-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-override.yaml`);
    tempPaths.push(repoDir, configPath);
    const expectedWorktreeBasePath = path.join(
      await fs.realpath(path.dirname("/tmp/repo-worktrees")),
      path.basename("/tmp/repo-worktrees"),
    );

    await fs.writeFile(
      configPath,
      [
        "defaults:",
        "  allowed_branch_patterns:",
        '    - "^user/.+$"',
        '  feature_branch_pattern: "user/<feature-name>"',
        "  git_worktree_base_path: /tmp/default-worktrees",
        "  default_remote: upstream",
        "  allow_draft_prs: false",
        "  workflow_mode: worktree",
        "repositories:",
        `  - path: ${repoDir}`,
        "    allowed_branch_patterns:",
        '      - "^feature/.+$"',
        '    feature_branch_pattern: "feature/<feature-name>"',
        "    git_worktree_base_path: /tmp/repo-worktrees",
        "    default_remote: origin",
        "    allow_draft_prs: true",
        "    workflow_mode: feature_branch",
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

     expect(config.repositories[0]?.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^feature\\/.+$"]);
     expect(config.repositories[0]?.featureBranchPattern).toBe("feature/<feature-name>");
     expect(config.repositories[0]?.gitWorktreeBasePath).toBe(expectedWorktreeBasePath);
     expect(config.repositories[0]?.defaultRemote).toBe("origin");
    expect(config.repositories[0]?.allowDraftPrs).toBe(true);
    expect(config.repositories[0]?.workflowMode).toBe("feature_branch");
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

  it("accepts repository-level current-branch workflow policy without defaults", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-current-branch-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-current-branch.yaml`);
    tempPaths.push(repoDir, configPath);

    await fs.writeFile(
      configPath,
      [
        "repositories:",
        `  - path: ${repoDir}`,
        "    workflow_mode: current_branch",
        "    allowed_branch_patterns:",
        '      - "^main$"',
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);

    expect(config.repositories[0]?.workflowMode).toBe("current_branch");
  });

  it("rejects relative git_worktree_base_path values", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-relative-worktree-base-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-relative-worktree-base.yaml`);
    tempPaths.push(repoDir, configPath);

    await fs.writeFile(
      configPath,
      [
        "defaults:",
        "  git_worktree_base_path: tmp/worktrees",
        "repositories:",
        `  - path: ${repoDir}`,
        "    allowed_branch_patterns:",
        '      - "^main$"',
      ].join("\n"),
      "utf8",
    );

    await expect(loadConfig(configPath)).rejects.toThrow(
      "git_worktree_base_path 'tmp/worktrees' must be absolute or start with '~/'",
    );
  });

  it("returns undefined for a missing optional config file", async () => {
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-missing.yaml`);
    tempPaths.push(configPath);

    await expect(loadOptionalConfig(configPath)).resolves.toBeUndefined();
  });
});

describe("bootstrapConfig", () => {
  it("creates a minimal valid config file", async () => {
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-bootstrap.yaml`);
    tempPaths.push(configPath);

    const result = await bootstrapConfig(configPath, {
      feature_branch_pattern: "owner/<feature-name>",
      allow_draft_prs: true,
    });

    expect(result).toEqual({
      defaults: {
        feature_branch_pattern: "owner/<feature-name>",
        allow_draft_prs: true,
      },
      repositories: [],
    });

    await expect(loadConfig(configPath)).resolves.toEqual({ repositories: [] });
  });

  it("refuses to overwrite an existing config file", async () => {
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-bootstrap-existing.yaml`);
    tempPaths.push(configPath);
    await fs.writeFile(configPath, "repositories: []\n", "utf8");

    await expect(bootstrapConfig(configPath, {})).rejects.toEqual(
      new ConfigError(`config file '${configPath}' already exists`),
    );
  });
});

describe("upsertRepoConfig", () => {
  it("creates a new config file with one repo when the config is missing", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-upsert-create-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-upsert-create.yaml`);
    tempPaths.push(repoDir, configPath);

    const result = await upsertRepoConfig(configPath, {
      repo_path: repoDir,
      allowed_branch_patterns: ["^owner\\/.*$"],
      workflow_mode: "worktree",
    });

    expect(result).toEqual({
      action: "created",
      repo: {
        path: repoDir,
        allowed_branch_patterns: ["^owner\\/.*$"],
        workflow_mode: "worktree",
      },
    });

    const config = await loadConfig(configPath);
    expect(config.repositories).toHaveLength(1);
    expect(config.repositories[0]?.path).toBe(repoDir);
    expect(config.repositories[0]?.workflowMode).toBe("worktree");
  });

  it("updates an existing repo entry matched by canonical path", async () => {
    const repoParentDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-upsert-update-parent-"));
    const repoDir = path.join(repoParentDir, "repo");
    const aliasDir = path.join(repoParentDir, "repo-alias");
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-upsert-update.yaml`);
    tempPaths.push(repoParentDir, configPath);

    await fs.mkdir(repoDir);
    await fs.symlink(repoDir, aliasDir);
    await fs.writeFile(
      configPath,
      [
        "repositories:",
        `  - path: ${repoDir}`,
        "    allowed_branch_patterns:",
        '      - "^owner\\/.*$"',
      ].join("\n"),
      "utf8",
    );

    const result = await upsertRepoConfig(configPath, {
      repo_path: aliasDir,
      default_remote: "origin",
      workflow_mode: "worktree",
    });

    expect(result).toEqual({
      action: "updated",
      repo: {
        path: repoDir,
        allowed_branch_patterns: ["^owner/.*$"],
        default_remote: "origin",
        workflow_mode: "worktree",
      },
    });

    const nextConfig = await loadConfig(configPath);
    expect(nextConfig.repositories).toHaveLength(1);
    expect(nextConfig.repositories[0]?.defaultRemote).toBe("origin");
    expect(nextConfig.repositories[0]?.workflowMode).toBe("worktree");
  });

  it("rejects invalid branch regex updates", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-upsert-invalid-regex-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-upsert-invalid-regex.yaml`);
    tempPaths.push(repoDir, configPath);

    await expect(
      upsertRepoConfig(configPath, {
        repo_path: repoDir,
        allowed_branch_patterns: ["["],
      }),
    ).rejects.toThrow(`invalid branch regex '[' for repository '${repoDir}'`);
  });
});
