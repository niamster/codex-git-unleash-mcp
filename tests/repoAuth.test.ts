import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import { resolveAllowedRepo } from "../src/auth/repoAuth.js";
import { ConfigError, RepoNotAllowedError } from "../src/errors.js";
import { runCommand } from "../src/exec/run.js";
import type { Config } from "../src/types/config.js";
import { configureTestGitRepo, createLinkedWorktree, createTempGitRepo } from "./helpers.js";

const tempPaths: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
          worktreePath: "/tmp/other",
          allowedBranchPatterns: [/^feature\/.+$/],
          allowDraftPrs: true,
          policySource: "global",
        },
      ],
    };

    await expect(resolveAllowedRepo(config, repoDir)).rejects.toBeInstanceOf(RepoNotAllowedError);
  });

  it("accepts a linked worktree for an allowlisted repository", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const worktreeDir = path.join(os.tmpdir(), `git-mcp-worktree-${Math.random().toString(16).slice(2)}`);
    tempPaths.push(repoDir, worktreeDir);

    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await runCommand({ cwd: repoDir, command: "git", argv: ["add", "README.md"] });
    await configureTestGitRepo(repoDir);
    await runCommand({ cwd: repoDir, command: "git", argv: ["commit", "-m", "init"] });

    const linkedWorktree = await createLinkedWorktree(repoDir, worktreeDir);
    const resolvedRepo = await resolveAllowedRepo(
      {
        repositories: [repo],
      },
      linkedWorktree,
    );

    expect(resolvedRepo.canonicalPath).toBe(repo.canonicalPath);
    expect(resolvedRepo.worktreePath).toBe(linkedWorktree);
  });

  it("uses repo-local policy when the repository is not globally allowlisted", async () => {
    const { repoDir } = await createTempGitRepo();
    tempPaths.push(repoDir);
    const canonicalRepoDir = await fs.realpath(repoDir);
    vi.stubEnv("USER", "codex");
    vi.stubEnv("USERNAME", "");

    await fs.writeFile(
      path.join(repoDir, ".git-unleash.yaml"),
      [
        "allowed_branch_patterns:",
        '  - "^<user>/.+$"',
        'feature_branch_pattern: "<user>/<feature-name>"',
        "git_worktree_base_path: .worktrees",
      ].join("\n"),
      "utf8",
    );

    const resolvedRepo = await resolveAllowedRepo({ repositories: [] }, repoDir);

    expect(resolvedRepo.policySource).toBe("repo_local");
    expect(resolvedRepo.repoLocalConfigPath).toBe(path.join(canonicalRepoDir, ".git-unleash.yaml"));
    expect(resolvedRepo.featureBranchPattern).toBe("codex/<feature-name>");
    expect(resolvedRepo.gitWorktreeBasePath).toBe(path.join(canonicalRepoDir, ".worktrees"));
    expect(resolvedRepo.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^codex\\/.+$"]);
  });

  it("allows matching global repo entries to override repo-local policy", async () => {
    const { repoDir } = await createTempGitRepo();
    tempPaths.push(repoDir);
    const canonicalRepoDir = await fs.realpath(repoDir);

    await fs.writeFile(
      path.join(repoDir, ".git-unleash.yaml"),
      [
        "allowed_branch_patterns:",
        '  - "^owner/.+$"',
        'feature_branch_pattern: "owner/<feature-name>"',
        "git_worktree_base_path: .worktrees",
        "allow_draft_prs: true",
        "workflow_mode: worktree",
      ].join("\n"),
      "utf8",
    );

    const resolvedRepo = await resolveAllowedRepo(
      {
        repositories: [
          {
            path: repoDir,
            canonicalPath: canonicalRepoDir,
            worktreePath: canonicalRepoDir,
            allowedBranchPatterns: [/^main$/],
            featureBranchPattern: "bob/<feature-name>",
            gitWorktreeBasePath: "/tmp/global-worktrees",
            defaultRemote: "origin",
            allowDraftPrs: false,
            workflowMode: "current_branch",
            policySource: "global",
            repoOverrides: {
              allowedBranchPatterns: [/^main$/],
              featureBranchPattern: "bob/<feature-name>",
              gitWorktreeBasePath: "/tmp/global-worktrees",
              defaultRemote: "origin",
              allowDraftPrs: false,
              workflowMode: "current_branch",
            },
          },
        ],
      },
      repoDir,
    );

    expect(resolvedRepo.policySource).toBe("repo_local");
    expect(resolvedRepo.featureBranchPattern).toBe("bob/<feature-name>");
    expect(resolvedRepo.gitWorktreeBasePath).toBe("/tmp/global-worktrees");
    expect(resolvedRepo.allowDraftPrs).toBe(false);
    expect(resolvedRepo.workflowMode).toBe("current_branch");
    expect(resolvedRepo.defaultRemote).toBe("origin");
    expect(resolvedRepo.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^main$"]);
    expect(resolvedRepo.repoOverridesApplied).toBe(true);
  });

  it("does not apply top-level defaults over repo-local policy", async () => {
    const { repoDir } = await createTempGitRepo();
    tempPaths.push(repoDir);
    const canonicalRepoDir = await fs.realpath(repoDir);

    await fs.writeFile(
      path.join(repoDir, ".git-unleash.yaml"),
      [
        "allowed_branch_patterns:",
        '  - "^owner/.+$"',
        'feature_branch_pattern: "owner/<feature-name>"',
        "git_worktree_base_path: .worktrees",
        "allow_draft_prs: true",
        "workflow_mode: worktree",
      ].join("\n"),
      "utf8",
    );

    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-repo-local-defaults.yaml`);
    tempPaths.push(configPath);

    await fs.writeFile(
      configPath,
      [
        "defaults:",
        "  allowed_branch_patterns:",
        '    - "^main$"',
        '  feature_branch_pattern: "bob/<feature-name>"',
        "  git_worktree_base_path: /tmp/default-worktrees",
        "  default_remote: origin",
        "  allow_draft_prs: false",
        "  workflow_mode: current_branch",
        "repositories:",
        `  - path: ${repoDir}`,
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);
    const resolvedRepo = await resolveAllowedRepo(config, repoDir);

    expect(resolvedRepo.policySource).toBe("repo_local");
    expect(resolvedRepo.featureBranchPattern).toBe("owner/<feature-name>");
    expect(resolvedRepo.gitWorktreeBasePath).toBe(path.join(canonicalRepoDir, ".worktrees"));
    expect(resolvedRepo.allowDraftPrs).toBe(true);
    expect(resolvedRepo.workflowMode).toBe("worktree");
    expect(resolvedRepo.defaultRemote).toBeUndefined();
    expect(resolvedRepo.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^owner\\/.+$"]);
    expect(resolvedRepo.repoOverridesApplied).toBe(false);
  });

  it("rejects repo-local config that sets default_remote", async () => {
    const { repoDir } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await fs.writeFile(
      path.join(repoDir, ".git-unleash.yaml"),
      [
        "allowed_branch_patterns:",
        '  - "^user/.+$"',
        "default_remote: upstream",
      ].join("\n"),
      "utf8",
    );

    await expect(resolveAllowedRepo({ repositories: [] }, repoDir)).rejects.toEqual(
      new ConfigError(`repo-local config '${path.join(await fs.realpath(repoDir), ".git-unleash.yaml")}' must not set default_remote`),
    );
  });

  it("rejects repo-local config when the config path is a symbolic link", async () => {
    const { repoDir } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await fs.writeFile(
      path.join(repoDir, "policy-target.yaml"),
      [
        "allowed_branch_patterns:",
        '  - "^user/.+$"',
      ].join("\n"),
      "utf8",
    );
    await fs.symlink("policy-target.yaml", path.join(repoDir, ".git-unleash.yaml"));

    await expect(resolveAllowedRepo({ repositories: [] }, repoDir)).rejects.toEqual(
      new ConfigError(`repo-local config '${path.join(await fs.realpath(repoDir), ".git-unleash.yaml")}' must not be a symbolic link`),
    );
  });
});
