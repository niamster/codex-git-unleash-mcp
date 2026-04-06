import { runCommand } from "./run.js";

export function ghPrCreateDraftArgs(base: string, title: string, body: string): string[] {
  return ["pr", "create", "--draft", "--base", base, "--title", title, "--body", body];
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
