import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runCommand } from "../src/exec/run.js";
import type { RepoPolicy } from "../src/types/config.js";

export async function createTempGitRepo(): Promise<{ repoDir: string; repo: RepoPolicy }> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-repo-"));

  await runCommand({ cwd: repoDir, command: "git", argv: ["init", "--initial-branch=main"] });
  await runCommand({ cwd: repoDir, command: "git", argv: ["config", "user.name", "Codex Test"] });
  await runCommand({ cwd: repoDir, command: "git", argv: ["config", "user.email", "codex@example.com"] });

  return {
    repoDir,
    repo: {
      path: repoDir,
      canonicalPath: await fs.realpath(repoDir),
      worktreePath: await fs.realpath(repoDir),
      allowedBranchPatterns: [/^.*$/],
      allowDraftPrs: true,
    },
  };
}

export async function createTempBareGitRepo(): Promise<string> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-remote-"));
  await runCommand({ cwd: repoDir, command: "git", argv: ["init", "--bare"] });
  return repoDir;
}

export async function createLinkedWorktree(repoDir: string, worktreeDir: string): Promise<string> {
  await runCommand({
    cwd: repoDir,
    command: "git",
    argv: ["worktree", "add", "--detach", worktreeDir, "HEAD"],
  });

  return await fs.realpath(worktreeDir);
}
