import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveAllowedRepo } from "../src/auth/repoAuth.js";
import { RepoNotAllowedError } from "../src/errors.js";
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

  it("falls back to repo-local policy when the repository is not globally allowlisted", async () => {
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
});
