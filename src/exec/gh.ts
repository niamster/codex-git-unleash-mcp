import { runCommand } from "./run.js";

export function ghPrCreateDraftArgs(base: string, title: string, body: string): string[] {
  return ["pr", "create", "--draft", "--base", base, "--title", title, "--body", body];
}

export function ghRepoViewDefaultBranchArgs(): string[] {
  return ["repo", "view", "--json", "defaultBranchRef"];
}

export async function createDraftPullRequest(
  cwd: string,
  args: { base: string; title: string; body: string },
): Promise<string> {
  const result = await runCommand({
    cwd,
    command: "gh",
    argv: ghPrCreateDraftArgs(args.base, args.title, args.body),
  });

  return result.stdout.trim();
}

export async function getRepoDefaultBranch(cwd: string): Promise<string | null> {
  try {
    const result = await runCommand({
      cwd,
      command: "gh",
      argv: ghRepoViewDefaultBranchArgs(),
    });
    const parsed = JSON.parse(result.stdout) as { defaultBranchRef?: { name?: string } };
    const branch = parsed.defaultBranchRef?.name?.trim();
    return branch || null;
  } catch {
    return null;
  }
}
