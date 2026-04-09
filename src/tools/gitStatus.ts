import { getCurrentBranch, getStatus } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";

type GitStatusResult = {
  branch: string | null;
  isClean: boolean;
  stdout: string;
};

export async function getGitStatus(repo: RepoPolicy): Promise<GitStatusResult> {
  const stdout = await getStatus(repo.worktreePath);
  const branch = parseBranch(stdout) ?? (await safeCurrentBranch(repo.worktreePath));

  return {
    branch,
    isClean: statusIsClean(stdout),
    stdout,
  };
}

function parseBranch(stdout: string): string | null {
  const [firstLine] = stdout.split("\n");
  if (!firstLine?.startsWith("## ")) {
    return null;
  }

  const branchPart = firstLine.slice(3).split("...")[0]?.trim();
  if (!branchPart || branchPart === "HEAD (no branch)") {
    return null;
  }

  return branchPart;
}

function statusIsClean(stdout: string): boolean {
  const lines = stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  return lines.length <= 1;
}

async function safeCurrentBranch(cwd: string): Promise<string | null> {
  const branch = await getCurrentBranch(cwd);
  return branch || null;
}
