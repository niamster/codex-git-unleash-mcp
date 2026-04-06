import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runCommand } from "../src/exec/run.js";
import type { RepoPolicy } from "../src/types/config.js";

export async function createTempGitRepo(): Promise<{ repoDir: string; repo: RepoPolicy }> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-repo-"));

  await runCommand({ cwd: repoDir, command: "git", argv: ["init"] });
  await runCommand({ cwd: repoDir, command: "git", argv: ["config", "user.name", "Codex Test"] });
  await runCommand({ cwd: repoDir, command: "git", argv: ["config", "user.email", "codex@example.com"] });

  return {
    repoDir,
    repo: {
      path: repoDir,
      canonicalPath: await fs.realpath(repoDir),
      allowedBranchPatterns: [/^.*$/],
      defaultRemote: "origin",
      allowDraftPrs: true,
    },
  };
}
