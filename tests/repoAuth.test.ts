import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveAllowedRepo } from "../src/auth/repoAuth.js";
import { ConfigError, RepoNotAllowedError } from "../src/errors.js";
import { runCommand } from "../src/exec/run.js";
import type { Config } from "../src/types/config.js";
import { configureTestGitRepo, createLinkedWorktree, createTempGitRepo } from "./helpers.js";

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

    await fs.writeFile(
      path.join(repoDir, ".git-unleash.yaml"),
      [
        "allowed_branch_patterns:",
        '  - "^dm/.+$"',
        'feature_branch_pattern: "dm/<feature-name>"',
        "git_worktree_base_path: .worktrees",
      ].join("\n"),
      "utf8",
    );

    const resolvedRepo = await resolveAllowedRepo({ repositories: [] }, repoDir);

    expect(resolvedRepo.policySource).toBe("repo_local");
    expect(resolvedRepo.repoLocalConfigPath).toBe(path.join(canonicalRepoDir, ".git-unleash.yaml"));
    expect(resolvedRepo.featureBranchPattern).toBe("dm/<feature-name>");
    expect(resolvedRepo.gitWorktreeBasePath).toBe(path.join(canonicalRepoDir, ".worktrees"));
    expect(resolvedRepo.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^dm\\/.+$"]);
  });

  it("gives repo-local policy precedence over global config for the same repository", async () => {
    const { repoDir } = await createTempGitRepo();
    tempPaths.push(repoDir);
    const canonicalRepoDir = await fs.realpath(repoDir);

    await fs.writeFile(
      path.join(repoDir, ".git-unleash.yaml"),
      [
        "allowed_branch_patterns:",
        '  - "^user/.+$"',
        'feature_branch_pattern: "user/<feature-name>"',
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
            featureBranchPattern: "main",
            allowDraftPrs: true,
            policySource: "global",
          },
        ],
      },
      repoDir,
    );

    expect(resolvedRepo.policySource).toBe("repo_local");
    expect(resolvedRepo.featureBranchPattern).toBe("user/<feature-name>");
    expect(resolvedRepo.allowedBranchPatterns.map((pattern) => pattern.source)).toEqual(["^user\\/.+$"]);
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
